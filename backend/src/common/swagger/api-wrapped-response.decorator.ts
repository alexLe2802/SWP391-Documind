import { Type, applyDecorators } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelopeDto } from '../api-contract/dto/api-envelope.dto';

// Hiển thị giao diện api wrapped ok phản hồi.
export function ApiWrappedOkResponse(
  model: Type<unknown>,
  description: string,
  example?: unknown,
): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['success', 'data', 'timestamp'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { $ref: getSchemaPath(model) },
          timestamp: { type: 'string', format: 'date-time' },
        },
        ...(example ? { example } : {}),
      },
    }),
  );
}

// Hiển thị giao diện api wrapped array ok phản hồi.
export function ApiWrappedArrayOkResponse(
  model: Type<unknown>,
  description: string,
  example?: unknown,
): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['success', 'data', 'timestamp'],
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(model) },
          },
          timestamp: { type: 'string', format: 'date-time' },
        },
        ...(example ? { example } : {}),
      },
    }),
  );
}

// Hiển thị giao diện api wrapped lỗi responses.
export function ApiWrappedErrorResponses(
  responses: Array<{
    status: number;
    description: string;
    code?: string;
    message?: string;
  }>,
): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ApiErrorEnvelopeDto),
    ...responses.map((response) =>
      ApiResponse({
        status: response.status,
        description: response.description,
        schema: {
          allOf: [{ $ref: getSchemaPath(ApiErrorEnvelopeDto) }],
          example: {
            success: false,
            error: {
              code: response.code ?? 'ERROR',
              message: response.message ?? response.description,
            },
            timestamp: '2026-06-24T10:00:00.000Z',
            path: '/api/payments/checkout',
            requestId: '7f2d5d9a-54c4-44fd-9f5c-9d090cf1b6ad',
          },
        },
      }),
    ),
  );
}
