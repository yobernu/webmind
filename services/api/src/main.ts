import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';

/**
 * The API is consumed by the browser extension, whose pages have a
 * `chrome-extension://<id>` origin, and by the Vite dev harness on localhost.
 * Auth uses the Authorization header rather than cookies, so credentials are
 * not enabled.
 */
function isAllowedOrigin(origin: string): boolean {
  const configured = process.env.CORS_ALLOWED_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured?.length) {
    return configured.includes(origin);
  }

  return (
    origin.startsWith('chrome-extension://') ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
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

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
