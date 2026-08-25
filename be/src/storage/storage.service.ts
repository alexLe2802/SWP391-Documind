import {
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { R2_PRESIGNER, R2_S3_CLIENT } from './storage.constants';
import {
  ObjectDisposition,
  ObjectUrlResponse,
  PresignedObjectUrl,
  R2Presigner,
  UploadObjectInput,
  UploadObjectResult,
  UploadedFile,
} from './storage.types';

export interface UploadUrlResponse {
  key: string;
  uploadUrl: string;
  expiresIn: number;
  publicUrl?: string;
}

export interface DownloadUrlResponse {
  downloadUrl: string;
  expiresIn: number;
}

export interface PreviewUrlResponse {
  url: string;
  strategy: 'public' | 'presigned';
  expiresIn?: number;
}

export interface UploadedObjectResponse {
  key: string;
  fileUrl?: string;
}

interface ByteArrayTransformableBody {
  transformToByteArray(): Promise<Uint8Array>;
}

const DEFAULT_PRESIGNED_URL_TTL_SECONDS = 300;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly configService: ConfigService,
    @Inject(R2_S3_CLIENT) private readonly client: S3Client,
    @Inject(R2_PRESIGNER) private readonly presign: R2Presigner,
  ) {}

  // Tạo hoặc lưu object key.
  createObjectKey(ownerId: string, fileName: string): string {
    return `users/${this.sanitizeKeySegment(ownerId)}/${randomUUID()}-${this.sanitizeFileName(fileName)}`;
  }

  // Xử lý object key.
  generateObjectKey(
    ownerId: string,
    documentId: string,
    originalFileName: string,
  ): string {
    return `users/${this.sanitizeKeySegment(ownerId)}/documents/${this.sanitizeKeySegment(documentId)}/${this.sanitizeFileName(originalFileName)}`;
  }

  // Tạo hoặc lưu tải lên url.
  async createUploadUrl(
    ownerId: string,
    dto: CreateUploadUrlDto,
  ): Promise<UploadUrlResponse> {
    const key = this.createObjectKey(ownerId, dto.fileName);
    const expiresIn = this.getPresignedUrlTtl();
    const publicUrl = this.getPublicUrl();

    try {
      const command = new PutObjectCommand({
        Bucket: this.getBucketName(),
        Key: key,
        ContentType: dto.contentType,
      });

      return {
        key,
        uploadUrl: await this.presign(this.client, command, { expiresIn }),
        expiresIn,
        publicUrl: publicUrl ? this.buildPublicUrl(key, publicUrl) : undefined,
      };
    } catch (error) {
      this.logStorageError('presign-upload', key, error);
      throw new ServiceUnavailableException(
        'Document storage is temporarily unavailable',
      );
    }
  }

  async uploadObject(input: UploadObjectInput): Promise<UploadObjectResult>;
  async uploadObject(
    ownerId: string,
    file: UploadedFile,
  ): Promise<UploadedObjectResponse>;
  // Tạo hoặc lưu tải lên object.
  async uploadObject(
    inputOrOwnerId: UploadObjectInput | string,
    file?: UploadedFile,
  ): Promise<UploadObjectResult | UploadedObjectResponse> {
    if (typeof inputOrOwnerId === 'string') {
      if (!file) {
        throw new BadRequestException('File is required');
      }

      const key = this.createObjectKey(inputOrOwnerId, file.originalname);
      await this.putObject({
        objectKey: key,
        body: file.buffer,
        contentType: file.mimetype,
        contentLength: file.size,
      });

      return {
        key,
        fileUrl: this.getPublicUrl() ? this.buildPublicUrl(key) : undefined,
      };
    }

    return this.putObject(inputOrOwnerId);
  }

  async createDownloadUrl(
    ownerId: string,
    key: string,
  ): Promise<DownloadUrlResponse>;
  async createDownloadUrl(
    objectKey: string,
    originalFileName: string,
  ): Promise<PresignedObjectUrl>;
  // Tạo hoặc lưu tải xuống url.
  async createDownloadUrl(
    objectKeyOrOwnerId: string,
    keyOrFileName: string,
  ): Promise<DownloadUrlResponse | PresignedObjectUrl> {
    if (
      keyOrFileName.includes('/') &&
      !objectKeyOrOwnerId.startsWith('users/')
    ) {
      this.assertOwnedKey(objectKeyOrOwnerId, keyOrFileName);
      const result = await this.createPresignedUrl(keyOrFileName, 'attachment');
      return {
        downloadUrl: result.url,
        expiresIn: this.getPresignedUrlTtl(),
      };
    }

    // Truyền tên gốc – createPresignedUrl sẽ dùng RFC 5987 để encode Unicode.
    return this.createPresignedUrl(
      objectKeyOrOwnerId,
      'attachment',
      keyOrFileName,
    );
  }

  // Tạo hoặc lưu object xem trước url.
  async createObjectPreviewUrl(
    objectKey: string,
    contentType?: string,
  ): Promise<ObjectUrlResponse> {
    const publicUrl = this.getPublicUrl();

    if (publicUrl) {
      return {
        url: this.buildPublicUrl(objectKey),
        strategy: 'public',
      };
    }

    const result = await this.createPresignedUrl(
      objectKey,
      'inline',
      undefined,
      contentType,
    );
    return {
      ...result,
      strategy: 'presigned',
    };
  }

  // Tạo hoặc lưu object tải xuống url.
  async createObjectDownloadUrl(
    objectKey: string,
    originalFileName: string,
    contentType?: string,
  ): Promise<ObjectUrlResponse> {
    const result = await this.createPresignedUrl(
      objectKey,
      'attachment',
      // Truyền tên gốc – createPresignedUrl sẽ dùng RFC 5987 để encode Unicode.
      originalFileName,
      contentType,
    );
    return {
      ...result,
      strategy: 'presigned',
    };
  }

  async createPreviewUrl(
    ownerId: string,
    key: string,
  ): Promise<PreviewUrlResponse>;
  createPreviewUrl(objectKey: string): Promise<PresignedObjectUrl>;
  // Tạo hoặc lưu xem trước url.
  async createPreviewUrl(
    objectKeyOrOwnerId: string,
    key?: string,
  ): Promise<PreviewUrlResponse | PresignedObjectUrl> {
    if (key) {
      this.assertOwnedKey(objectKeyOrOwnerId, key);

      if (this.getPublicUrl()) {
        return {
          url: this.buildPublicUrl(key),
          strategy: 'public',
        };
      }

      const result = await this.createPresignedUrl(key, 'inline');
      return {
        url: result.url,
        strategy: 'presigned',
        expiresIn: this.getPresignedUrlTtl(),
      };
    }

    return this.createPresignedUrl(objectKeyOrOwnerId, 'inline');
  }

  // Lấy dữ liệu object buffer.
  async getObjectBuffer(objectKey: string): Promise<Buffer<ArrayBufferLike>> {
    try {
      const result: GetObjectCommandOutput = await this.client.send(
        new GetObjectCommand({
          Bucket: this.getBucketName(),
          Key: objectKey,
        }),
      );

      if (!result.Body) {
        throw new Error('Stored object body is empty');
      }

      return this.toBuffer(result.Body);
    } catch (error) {
      this.logStorageError('download', objectKey, error);
      throw new ServiceUnavailableException(
        'Document storage is temporarily unavailable',
      );
    }
  }

  // Thực hiện chức năng object exists.
  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.getBucketName(),
          Key: objectKey,
        }),
      );
      return true;
    } catch (error) {
      const candidate = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        candidate.name === 'NotFound' ||
        candidate.name === 'NoSuchKey' ||
        candidate.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      this.logStorageError('head', objectKey, error);
      throw new ServiceUnavailableException(
        'Document storage is temporarily unavailable',
      );
    }
  }

  async deleteObject(
    ownerId: string,
    key: string,
  ): Promise<{ message: string }>;
  async deleteObject(objectKey: string): Promise<void>;
  // Xóa hoặc giải phóng object.
  async deleteObject(
    objectKeyOrOwnerId: string,
    key?: string,
  ): Promise<{ message: string } | void> {
    if (key) {
      this.assertOwnedKey(objectKeyOrOwnerId, key);
      await this.deleteStoredObject(key);
      return { message: 'Storage object deleted' };
    }

    await this.deleteStoredObject(objectKeyOrOwnerId);
  }

  // Thực hiện chức năng put object.
  private async putObject(
    input: UploadObjectInput,
  ): Promise<UploadObjectResult> {
    try {
      const result = await this.client.send(
        new PutObjectCommand({
          Bucket: this.getBucketName(),
          Key: input.objectKey,
          Body: input.body,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
          Metadata: input.metadata,
        }),
      );

      return {
        objectKey: input.objectKey,
        etag: result.ETag,
      };
    } catch (error) {
      this.logStorageError('upload', input.objectKey, error);
      throw new ServiceUnavailableException(
        'Document storage is temporarily unavailable',
      );
    }
  }

  // Xóa hoặc giải phóng stored object.
  private async deleteStoredObject(objectKey: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.getBucketName(),
          Key: objectKey,
        }),
      );
    } catch (error) {
      this.logStorageError('delete', objectKey, error);
      throw new ServiceUnavailableException(
        'Document storage is temporarily unavailable',
      );
    }
  }

  // Tạo hoặc lưu presigned url.
  private async createPresignedUrl(
    objectKey: string,
    disposition: ObjectDisposition,
    fileName?: string,
    contentType?: string,
  ): Promise<PresignedObjectUrl> {
    const expiresIn = this.getPresignedUrlTtl();
    // Sử dụng RFC 5987 (filename*=UTF-8'') để hỗ trợ tên file Unicode (tiếng Việt, v.v.).
    const responseContentDisposition = fileName
      ? `${disposition}; filename="${this.sanitizeFileName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
      : disposition;

    try {
      const command = new GetObjectCommand({
        Bucket: this.getBucketName(),
        Key: objectKey,
        ResponseContentDisposition: responseContentDisposition,
        ResponseContentType: contentType,
      });
      const url = await this.presign(this.client, command, { expiresIn });

      return {
        url,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      };
    } catch (error) {
      this.logStorageError('presign', objectKey, error);
      throw new ServiceUnavailableException(
        'Document storage is temporarily unavailable',
      );
    }
  }

  // Chuyển đổi hoặc chuẩn hóa buffer.
  private async toBuffer(
    body: NonNullable<GetObjectCommandOutput['Body']>,
  ): Promise<Buffer<ArrayBufferLike>> {
    const candidate: unknown = body;

    if (candidate instanceof Uint8Array) {
      return Buffer.from(candidate);
    }

    if (this.hasTransformToByteArray(candidate)) {
      return Buffer.from(await candidate.transformToByteArray());
    }

    if (candidate instanceof Readable) {
      const chunks: Buffer<ArrayBufferLike>[] = [];
      for await (const chunk of candidate as AsyncIterable<
        Buffer<ArrayBufferLike> | Uint8Array | string
      >) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }

    throw new Error('Unsupported stored object body type');
  }

  // Kiểm tra điều kiện transform to byte array.
  private hasTransformToByteArray(
    body: unknown,
  ): body is ByteArrayTransformableBody {
    const candidate = body as { transformToByteArray?: unknown };

    return (
      typeof body === 'object' &&
      body !== null &&
      typeof candidate.transformToByteArray === 'function'
    );
  }

  // Lấy dữ liệu bucket name.
  private getBucketName(): string {
    const bucketName = this.configService.get<string>('R2_BUCKET_NAME', '');

    if (!bucketName) {
      throw new Error('R2 bucket is not configured');
    }

    return bucketName;
  }

  // Lấy dữ liệu public url.
  private getPublicUrl(): string | undefined {
    const publicUrl = this.configService.get<string>('R2_PUBLIC_URL', '');
    return publicUrl || undefined;
  }

  // Lấy dữ liệu presigned url ttl.
  private getPresignedUrlTtl(): number {
    return this.configService.get<number>(
      'R2_PRESIGNED_URL_TTL_SECONDS',
      DEFAULT_PRESIGNED_URL_TTL_SECONDS,
    );
  }

  // Thực hiện chức năng sanitize tệp name.
  private sanitizeFileName(originalFileName: string): string {
    const baseName = path.posix.basename(
      path.win32.basename(originalFileName.trim()),
    );
    const extension = path.extname(baseName).toLowerCase();
    const stem = path.basename(baseName, path.extname(baseName));
    const safeStem = stem
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180);
    const safeExtension = extension.replace(/[^a-z0-9.]/g, '').slice(0, 20);

    return `${safeStem || 'file'}${safeExtension}`;
  }

  // Thực hiện chức năng sanitize key segment.
  private sanitizeKeySegment(value: string): string {
    const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]/g, '');

    if (!sanitized) {
      throw new Error('Invalid storage key segment');
    }

    return sanitized;
  }

  // Thực hiện chức năng assert owned key.
  private assertOwnedKey(ownerId: string, key: string): void {
    if (!key.startsWith(`users/${this.sanitizeKeySegment(ownerId)}/`)) {
      throw new BadRequestException(
        'Storage object does not belong to the current user',
      );
    }
  }

  // Chuyển đổi hoặc chuẩn hóa public url.
  private buildPublicUrl(key: string, configuredPublicUrl?: string): string {
    const publicUrl = configuredPublicUrl ?? this.getPublicUrl();

    if (!publicUrl) {
      throw new BadRequestException('Public bucket URL is not configured');
    }

    return `${publicUrl.replace(/\/$/, '')}/${key}`;
  }

  // Thực hiện chức năng log storage lỗi.
  private logStorageError(
    operation: string,
    objectKey: string,
    error: unknown,
  ): void {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(
      `R2 ${operation} failed for object key "${objectKey}": ${message}`,
    );
  }
}
