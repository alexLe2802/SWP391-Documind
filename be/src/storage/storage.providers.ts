import { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { R2_PRESIGNER, R2_S3_CLIENT } from './storage.constants';
import { R2Presigner } from './storage.types';

export const r2S3ClientProvider: FactoryProvider<S3Client> = {
  provide: R2_S3_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): S3Client => {
    const accountId = configService.get<string>('R2_ACCOUNT_ID', '');
    const endpoint =
      configService.get<string>('R2_ENDPOINT', '') ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
    const accessKeyId = configService.get<string>('R2_ACCESS_KEY_ID', '');
    const secretAccessKey = configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
      '',
    );

    return new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: true,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  },
};

export const r2PresignerProvider: FactoryProvider<R2Presigner> = {
  provide: R2_PRESIGNER,
  useFactory: (): R2Presigner => getSignedUrl,
};
