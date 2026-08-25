import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

interface RequestWithId extends Request {
  requestId?: string;
}

// Thực hiện chức năng yêu cầu id middleware.
export function requestIdMiddleware(
  request: RequestWithId,
  response: Response,
  next: NextFunction,
): void {
  const requestId = request.header('x-request-id')?.trim() || randomUUID();
  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
