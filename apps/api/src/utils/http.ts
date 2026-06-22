/**
 * HTTP helpers shared by every route: the standard response envelope
 * ({ success, data?, error?, code? }), a typed error class the routes throw,
 * and an async wrapper so thrown errors reach the central error handler.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Machine-readable error identifiers. A superset of the codes in
 * API_CONTRACT.md — the contract's list is non-exhaustive and the shared
 * `ErrorCode` union (packages/shared) still needs reconciliation, so the API
 * owns its own string codes here rather than coupling to that type today.
 */
export type ApiCode =
  | 'INVALID_TOKEN'
  | 'UNAUTHORIZED'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'CONFLICT'
  | 'SERVER_ERROR';

/** The envelope returned by ALL endpoints (success or failure). */
export interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: ApiCode;
}

/** An error a route/service can throw; the error handler renders it verbatim. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: ApiCode,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static unauthorized(message = 'Not authorized'): ApiError {
    return new ApiError(403, message, 'UNAUTHORIZED');
  }

  static invalidToken(message = 'Invalid or expired token'): ApiError {
    return new ApiError(401, message, 'INVALID_TOKEN');
  }

  static invalidInput(message = 'Invalid input'): ApiError {
    return new ApiError(400, message, 'INVALID_INPUT');
  }

  static notFound(message = 'Not found', code: ApiCode = 'NOT_FOUND'): ApiError {
    return new ApiError(404, message, code);
  }

  static conflict(message = 'Already exists'): ApiError {
    return new ApiError(409, message, 'CONFLICT');
  }
}

/** Write a success envelope. */
export function sendOk<T>(res: Response, data: T, status = 200): void {
  const body: Envelope<T> = { success: true, data };
  res.status(status).json(body);
}

/** Write a failure envelope. */
export function sendError(res: Response, status: number, error: string, code: ApiCode): void {
  const body: Envelope<never> = { success: false, error, code };
  res.status(status).json(body);
}

/**
 * Wrap an async route handler so a rejected promise is forwarded to Express's
 * error pipeline (Express 4 does not await handlers). Without this, a thrown
 * ApiError inside an `async` handler would hang the request.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
