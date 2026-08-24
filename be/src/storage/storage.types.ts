import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface UploadObjectInput {
  objectKey: string;
  body: Buffer | Uint8Array;
  contentType: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}

export interface UploadObjectResult {
  objectKey: string;
  etag?: string;
}

export type ObjectDisposition = 'inline' | 'attachment';

export interface PresignedObjectUrl {
  url: string;
  expiresAt: string;
}

export type ObjectUrlStrategy = 'public' | 'presigned';

export interface ObjectUrlResponse {
  url: string;
  strategy: ObjectUrlStrategy;
  expiresAt?: string;
  contentType?: string;
  fallbackToOfficeViewer?: boolean;
}

export type R2Presigner = (
  client: S3Client,
  command: GetObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;
