import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Exempts a route from the global JwtAuthGuard. Authentication is the default
 * so that a new controller cannot forget it (SRS §9.1: users may only reach
 * records they own); opting out has to be written down.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
