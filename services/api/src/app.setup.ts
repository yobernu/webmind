import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import helmet from 'helmet';

import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';

/**
 * The API is consumed by the browser extension, whose pages have a
 * `chrome-extension://<id>` origin, and by the Vite dev harness on localhost.
 * Auth uses the Authorization header rather than cookies, so credentials are
 * not enabled.
 *
 * Precedence: an explicit CORS_ALLOWED_ORIGINS list; otherwise WebMind's own
 * extension (EXTENSION_ID) plus localhost outside production; otherwise, in
 * development only, any extension.
 */
export function isAllowedOrigin(origin: string): boolean {
  const configured = process.env.CORS_ALLOWED_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured?.length) {
    return configured.includes(origin);
  }

  const production = process.env.NODE_ENV === 'production';
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
    origin,
  );
  const extensionId = process.env.EXTENSION_ID?.trim();

  if (extensionId) {
    return (
      origin === `chrome-extension://${extensionId}` ||
      (!production && isLocalhost)
    );
  }

  // Without a pinned id any installed extension could call the API with a
  // stolen token, which is tolerable on a laptop and nowhere else.
  return (
    !production && (origin.startsWith('chrome-extension://') || isLocalhost)
  );
}

/**
 * Everything applied to the Nest app besides its modules. Shared by `main.ts`
 * and the e2e tests, so the tests exercise the same validation, error
 * handling and headers as production.
 */
export function configureApp(app: INestApplication): INestApplication {
  // A JSON API serves no HTML, but these headers still matter: no MIME
  // sniffing, no framing, HSTS behind TLS (SRS §9.1).
  app.use(helmet());

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      // No Origin header: same-origin, curl, or a server-to-server call.
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      // `false` omits the CORS headers, which the browser treats as a denial.
      // Throwing here would surface as a confusing 500 instead.
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Without this, a database fault (wrong credentials, server down) reaches the
  // client as a raw 500 carrying the query and stack trace.
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));

  return app;
}
