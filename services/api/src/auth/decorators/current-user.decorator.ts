import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** Whatever JwtStrategy.validate() returned for this request. */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Reads the authenticated user off the request, so controllers behind
 * JwtAuthGuard do not each reach into `req.user`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();

    return request.user;
  },
);
