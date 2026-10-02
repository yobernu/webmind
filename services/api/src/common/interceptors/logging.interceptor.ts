import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * One line per request: method, route, status and duration.
 *
 * Deliberately no bodies and no query strings (SRS §9.1): bodies carry page
 * text and notes, and `/search?q=` carries what the user was looking for. The
 * route template (`/notes/:id`) is logged rather than the concrete path where
 * Nest knows it.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const started = performance.now();
    const route =
      (request.route as { path?: string } | undefined)?.path ?? request.path;

    // Read on 'finish' rather than from the handler's outcome: the exception
    // filter decides the final status of a failed request, and a streamed
    // answer is only done when its last event is written.
    response.once('finish', () => {
      this.logger.log(
        `${request.method} ${route} ${response.statusCode} ${Math.round(performance.now() - started)}ms`,
      );
    });

    return next.handle();
  }
}
