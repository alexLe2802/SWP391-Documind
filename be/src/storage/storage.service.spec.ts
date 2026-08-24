import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { R2Presigner } from './storage.types';

describe('StorageService', () => {
  const send = jest.fn<Promise<Record<string, unknown>>, [unknown]>();
  const client = { send } as unknown as S3Client;
  const presigner = jest.fn<ReturnType<R2Presigner>, Parameters<R2Presigner>>();
  const config = new ConfigService({
    R2_BUCKET_NAME: 'documents',
    R2_PRESIGNED_URL_TTL_SECONDS: 300,
  });

  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StorageService(config, client, presigner);
  });

  it('creates owner-scoped upload keys', async () => {
    presigner.mockResolvedValue('https://signed.example');

    const result = await service.createUploadUrl('owner-id', {
      fileName: 'My Notes.pdf',
      contentType: 'application/pdf',
    });

    expect(result.key).toMatch(/^users\/owner-id\/.+-my-notes\.pdf$/);
    expect(result.uploadUrl).toBe('https://signed.example');
  });

  it('generates a private user-scoped object key with a sanitized file name', () => {
    expect(
      service.generateObjectKey(
        'owner-id',
        'document-id',
        '..\\Bai giang: Toan (Final).PDF',
      ),
    ).toBe('users/owner-id/documents/document-id/bai-giang-toan-final.pdf');
  });

  it('uploads an object to the configured private bucket', async () => {
    send.mockResolvedValue({ ETag: '"etag-value"' });

    await expect(
      service.uploadObject({
        objectKey: 'users/u/documents/d/file.pdf',
        body: Buffer.from('content'),
        contentType: 'application/pdf',
        contentLength: 7,
        metadata: { documentId: 'd' },
      }),
    ).resolves.toEqual({
      objectKey: 'users/u/documents/d/file.pdf',
      etag: '"etag-value"',
    });

    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'documents',
      Key: 'users/u/documents/d/file.pdf',
      ContentType: 'application/pdf',
      ContentLength: 7,
      Metadata: { documentId: 'd' },
    });
  });

  it('checks whether a generated preview object exists', async () => {
    send.mockResolvedValue({});

    await expect(
      service.objectExists('users/u/documents/d/preview.pdf'),
    ).resolves.toBe(true);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it('returns false when a generated preview object is missing', async () => {
    send.mockRejectedValue({
      name: 'NotFound',
      $metadata: { httpStatusCode: 404 },
    });

    await expect(
      service.objectExists('users/u/documents/d/preview.pdf'),
    ).resolves.toBe(false);
  });

  it('uploads file bytes directly to R2 with legacy signature', async () => {
    send.mockResolvedValue({});

    const result = await service.uploadObject('owner-id', {
      originalname: 'My Notes.pdf',
      mimetype: 'application/pdf',
      size: 123,
      buffer: Buffer.from('pdf'),
    });

    expect(send).toHaveBeenCalled();
    expect(result.key).toMatch(/^users\/owner-id\/.+-my-notes\.pdf$/);
  });

  it('deletes an object from the configured bucket', async () => {
    send.mockResolvedValue({});

    await service.deleteObject('users/u/documents/d/file.pdf');

    const command = send.mock.calls[0][0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'documents',
      Key: 'users/u/documents/d/file.pdf',
    });
  });

  it('downloads an object body from the configured bucket', async () => {
    send.mockResolvedValue({
      Body: {
        transformToByteArray: () =>
          Promise.resolve(Uint8Array.from(Buffer.from('stored content'))),
      },
    });

    await expect(
      service.getObjectBuffer('users/u/documents/d/file.pdf'),
    ).resolves.toEqual(Buffer.from('stored content'));

    const command = send.mock.calls[0][0] as GetObjectCommand;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'documents',
      Key: 'users/u/documents/d/file.pdf',
    });
  });

  it('prevents deleting keys outside the owner prefix', async () => {
    await expect(
      service.deleteObject('owner-id', 'users/another-user/file.pdf'),
    ).rejects.toThrow('Storage object does not belong to the current user');
    expect(send).not.toHaveBeenCalled();
  });

  it('creates a short-lived inline preview URL', async () => {
    presigner.mockResolvedValue('https://signed.example/preview');
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-06-15T00:00:00.000Z').getTime());

    await expect(
      service.createPreviewUrl('users/u/documents/d/file.pdf'),
    ).resolves.toEqual({
      url: 'https://signed.example/preview',
      expiresAt: '2026-06-15T00:05:00.000Z',
    });

    const command = presigner.mock.calls[0][1];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'documents',
      Key: 'users/u/documents/d/file.pdf',
      ResponseContentDisposition: 'inline',
    });
    expect(presigner).toHaveBeenCalledWith(client, command, {
      expiresIn: 300,
    });
  });

  it('uses a public preview url when configured', async () => {
    const publicConfig = new ConfigService({
      R2_BUCKET_NAME: 'documents',
      R2_PRESIGNED_URL_TTL_SECONDS: 300,
      R2_PUBLIC_URL: 'https://pub.example',
    });
    const publicService = new StorageService(publicConfig, client, presigner);

    const result = await publicService.createPreviewUrl(
      'owner-id',
      'users/owner-id/file.pdf',
    );

    expect(result).toEqual({
      url: 'https://pub.example/users/owner-id/file.pdf',
      strategy: 'public',
    });
  });

  it('creates a public object preview URL when a public bucket URL is configured', async () => {
    const publicConfig = new ConfigService({
      R2_BUCKET_NAME: 'documents',
      R2_PRESIGNED_URL_TTL_SECONDS: 300,
      R2_PUBLIC_URL: 'https://pub.example',
    });
    const publicService = new StorageService(publicConfig, client, presigner);

    await expect(
      publicService.createObjectPreviewUrl('users/u/documents/d/file.pdf'),
    ).resolves.toEqual({
      url: 'https://pub.example/users/u/documents/d/file.pdf',
      strategy: 'public',
    });
    expect(presigner).not.toHaveBeenCalled();
  });

  it('creates a presigned object preview URL when public access is not configured', async () => {
    presigner.mockResolvedValue('https://signed.example/preview');

    await expect(
      service.createObjectPreviewUrl(
        'users/u/documents/d/file.pdf',
        'application/pdf',
      ),
    ).resolves.toEqual({
      url: 'https://signed.example/preview',
      strategy: 'presigned',
      expiresAt: expect.any(String) as string,
    });

    const command = presigner.mock.calls[0][1];
    expect(command.input.ResponseContentType).toBe('application/pdf');
  });

  it('creates an attachment URL with a safe download file name', async () => {
    presigner.mockResolvedValue('https://signed.example/download');

    await service.createDownloadUrl(
      'users/u/documents/d/file.pdf',
      'report "final".pdf',
    );

    const command = presigner.mock.calls[0][1];
    expect(command.input.ResponseContentDisposition).toBe(
      'attachment; filename="report-final.pdf"; filename*=UTF-8\'\'report%20%22final%22.pdf',
    );
  });

  it('creates a presigned object download URL with a safe file name', async () => {
    presigner.mockResolvedValue('https://signed.example/download');

    await expect(
      service.createObjectDownloadUrl(
        'users/u/documents/d/file.pdf',
        'report "final".pdf',
        'application/pdf',
      ),
    ).resolves.toMatchObject({
      url: 'https://signed.example/download',
      strategy: 'presigned',
    });

    const command = presigner.mock.calls[0][1];
    expect(command.input.ResponseContentDisposition).toBe(
      'attachment; filename="report-final.pdf"; filename*=UTF-8\'\'report%20%22final%22.pdf',
    );
    expect(command.input.ResponseContentType).toBe('application/pdf');
  });

  it('does not expose SDK errors to callers', async () => {
    send.mockRejectedValue(new Error('secret endpoint failure'));

    await expect(
      service.uploadObject({
        objectKey: 'key',
        body: Buffer.from('content'),
        contentType: 'application/pdf',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
