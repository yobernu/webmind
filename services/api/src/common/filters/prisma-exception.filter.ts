import { HttpStatus } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';

/**
 * Prisma's own query-error codes (P2002, P2025, ...). Anything else on a known
 * request error is a connection-level failure: either a P1xxx code, or a raw
 * driver code passed straight through by the adapter (`ECONNREFUSED`,
 * `ETIMEDOUT`, `28P01` for bad database credentials, and so on). Those are
 * infrastructure faults, not client mistakes, so they must never surface as a
 * 4xx that looks like bad user input.
 */
const QUERY_ERROR_CODE = /^P2\d{3}$/;

export const UNAVAILABLE_MESSAGE =
  'The service is temporarily unavailable. Please try again in a moment.';

/** A sanitized response, safe to return to a client. */
export interface DescribedFault {
  status: number;
  message: string;
  error: string;
  /** Short identifier for the server log, never sent to the client. */
  code: string;
}

const unavailable = (code: string): DescribedFault => ({
  status: HttpStatus.SERVICE_UNAVAILABLE,
  message: UNAVAILABLE_MESSAGE,
  error: 'Service Unavailable',
  code,
});

/**
 * Maps a Prisma failure to a sanitized response, or returns null when the
 * exception did not come from Prisma. Prisma error messages embed the failing
 * query, the schema path and sometimes the connection user, so the raw message
 * is never part of the result.
 */
export function describePrismaFault(exception: unknown): DescribedFault | null {
  if (exception instanceof Prisma.PrismaClientInitializationError) {
    return unavailable(exception.errorCode ?? 'PrismaClientInitializationError');
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const { code } = exception;

    if (code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        message: 'A record with these details already exists',
        error: 'Conflict',
        code,
      };
    }

    if (code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'The requested record was not found',
        error: 'Not Found',
        code,
      };
    }

    return QUERY_ERROR_CODE.test(code)
      ? {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unexpected error occurred',
          error: 'Internal Server Error',
          code,
        }
      : unavailable(code);
  }

  if (
    exception instanceof Prisma.PrismaClientUnknownRequestError ||
    exception instanceof Prisma.PrismaClientValidationError ||
    exception instanceof Prisma.PrismaClientRustPanicError
  ) {
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      error: 'Internal Server Error',
      code: exception.name,
    };
  }

  return null;
}
