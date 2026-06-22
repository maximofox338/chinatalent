/**
 * Thin bridge from Zod to our error shape. Parsing a request body or query
 * through these helpers turns any validation failure into a 400 INVALID_INPUT
 * ApiError with a human-readable message, so routes never deal with ZodError.
 */
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { ApiError } from './http';

function formatZodError(err: ZodError): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

/** Parse and validate, throwing ApiError(400, INVALID_INPUT) on failure. */
export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  try {
    return schema.parse(value) as z.infer<S>;
  } catch (err) {
    if (err instanceof ZodError) {
      throw ApiError.invalidInput(formatZodError(err));
    }
    throw err;
  }
}
