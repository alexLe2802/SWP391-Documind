export interface UploadedContentFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size?: number;
}
