import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import {
  describePrismaFault,
  UNAVAILABLE_MESSAGE,
  type DescribedFault,
} from './prisma-exception.filter.js';

/**
 * Driver-level codes meaning the database was unreachable or refused us. The
 * `pg` pool raises some of these as plain Errors that never pass through
 * Prisma's error classes.
 */
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'EPIPE',
  '28P01', // password authentication failed
  '28000', // invalid authorization specification
  '3D000', // database does not exist
  '53300', // too many connections
  '57P01', // server shutting down
  '57P03', // server not accepting connections
]);

/** Pool failures that arrive as a bare Error with no code at all. */
const CONNECTION_ERROR_PATTERNS = [
  /connection terminated/i,
  /connection error/i,
  /timeout exceeded when trying to connect/i,
  /server closed the connection/i,
  /socket hang up/i,
];

/**
 * Catch-all filter. Deliberate HttpExceptions (401 invalid credentials, 409
 * duplicate email, 400 validation) pass through untouched; everything else is
 * logged in full and replaced with a sanitized body, so a backend fault can
 * never reach the client as a stack trace or be mistaken for bad credentials.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const response = host.switchToHttp().getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      httpAdapter.reply(
        response,
        typeof body === 'string' ? { statusCode: status, message: body } : body,
        status,
      );
      return;
    }

    const prismaFault = describePrismaFault(exception);
    const fault =
      prismaFault ??
      this.describeConnectionFault(exception) ??
      this.describeUnknownFault(exception);

    // A Prisma error's message and stack quote the failing call's arguments,
    // which can be a user's page text or notes (SRS §9.1: logs must not expose
    // page content). Only the summary line is logged for those.
    this.logger.error(
      `${fault.code} -> ${fault.status}: ${summaryLine(exception)}`,
      prismaFault || !(exception instanceof Error) ? undefined : exception.stack,
    );

    httpAdapter.reply(
      response,
      { statusCode: fault.status, message: fault.message, error: fault.error },
      fault.status,
    );
  }

  private describeConnectionFault(exception: unknown): DescribedFault | null {
    if (!(exception instanceof Error)) return null;

    const code = (exception as { code?: unknown }).code;
    const matchesCode = typeof code === 'string' && CONNECTION_ERROR_CODES.has(code);
    const matchesMessage = CONNECTION_ERROR_PATTERNS.some((pattern) =>
      pattern.test(exception.message),
    );

    if (!matchesCode && !matchesMessage) return null;

    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      message: UNAVAILABLE_MESSAGE,
      error: 'Service Unavailable',
      code: typeof code === 'string' ? code : 'CONNECTION_FAULT',
    };
  }

  private describeUnknownFault(exception: unknown): DescribedFault {
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      error: 'Internal Server Error',
      code: exception instanceof Error ? exception.name : 'UnknownError',
    };
  }
}

/**
 * The last non-empty line of an error message. Prisma messages are multi-line,
 * with the call site and its arguments first and the actual cause last, so the
 * tail is both the most useful line and the one free of user data.
 */
function summaryLine(exception: unknown): string {
  const message = exception instanceof Error ? exception.message : String(exception);

  return (
    message
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .pop() ?? message
  );
}
