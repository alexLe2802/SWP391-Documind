import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApiContract } from './common/api-contract/configure-api-contract';
import {
  ApiErrorEnvelopeDto,
  ApiSuccessEnvelopeDto,
} from './common/api-contract/dto/api-envelope.dto';
import { PaginationMetaDto } from './common/api-contract/dto/pagination-meta.dto';

// Thực hiện chức năng bootstrap.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: configService.getOrThrow<string>('CORS_ORIGIN').split(','),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  configureApiContract(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('DocuMind API')
    .setDescription(
      'Executable API reference for DocuMind contract v0.3. Protected endpoints require a Firebase ID token.',
    )
    .setVersion('0.3')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig, {
      extraModels: [
        ApiSuccessEnvelopeDto,
        ApiErrorEnvelopeDto,
        PaginationMetaDto,
      ],
    }),
  );

  await app.listen(configService.get<number>('PORT', 3001));
}

void bootstrap();
