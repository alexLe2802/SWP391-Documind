import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApiContract } from '../src/common/api-contract/configure-api-contract';

@Controller('contract-test')
class ContractTestController {
  @Get('success')
  success(): { status: string } {
    return { status: 'ok' };
  }

  @Get('paginated')
  paginated(): {
    items: Array<{ id: string }>;
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    };
  } {
    return {
      items: [{ id: 'document-1' }],
      meta: {
        page: 1,
        limit: 20,
        totalItems: 21,
        totalPages: 2,
        hasNext: true,
        hasPrevious: false,
      },
    };
  }

  @Get('error')
  error(): never {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: [{ field: 'title', message: 'title is required' }],
    });
  }
}

describe('Shared API contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContractTestController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    configureApiContract(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('wraps successful responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/contract-test/success')
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'ok' },
    });
    expect(typeof (response.body as Record<string, unknown>).timestamp).toBe(
      'string',
    );
  });

  it('moves pagination metadata to the envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/contract-test/paginated')
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: [{ id: 'document-1' }],
      meta: {
        page: 1,
        limit: 20,
        totalItems: 21,
        totalPages: 2,
        hasNext: true,
        hasPrevious: false,
      },
    });
    expect(typeof (response.body as Record<string, unknown>).timestamp).toBe(
      'string',
    );
  });

  it('returns stable errors with path and request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/contract-test/error')
      .set('x-request-id', 'request-123')
      .expect(400);

    expect(response.headers['x-request-id']).toBe('request-123');
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ field: 'title', message: 'title is required' }],
      },
      path: '/api/contract-test/error',
      requestId: 'request-123',
    });
    expect(typeof (response.body as Record<string, unknown>).timestamp).toBe(
      'string',
    );
  });
});
