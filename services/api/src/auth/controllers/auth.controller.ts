import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import { AuthService } from '../services/auth.service.js';
import { GoogleAuthService } from '../services/google-auth.service.js';
import { RegisterDto } from '../dto/register.dto.js';
import { LoginDto } from '../dto/login.dto.js';
import { GoogleAuthDto } from '../dto/google-auth.dto.js';

/**
 * Credential-accepting routes are limited per IP to slow password guessing.
 * Only the `auth` bucket applies here; the AI bucket is for answers.
 */
const AUTH_LIMIT = { auth: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  /**
   * Sign-in options this server supports. Public, and the single source of
   * truth for the Google client id so the extension needs no build-time copy.
   */
  @Public()
  @Get('providers')
  providers() {
    return { google: this.googleAuthService.describeProvider() };
  }

  /** `signup` is the SRS §6 name; `register` is kept for existing clients. */
  @Public()
  @Post(['register', 'signup'])
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ ai: true })
  @Throttle(AUTH_LIMIT)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ ai: true })
  @Throttle(AUTH_LIMIT)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('google')
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ ai: true })
  @Throttle(AUTH_LIMIT)
  @HttpCode(HttpStatus.OK)
  google(@Body() dto: GoogleAuthDto) {
    return this.authService.loginWithGoogle(dto.idToken);
  }

  /**
   * Reads the account fresh rather than echoing the token payload, so the
   * profile stays current and a deleted account fails the check.
   */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.validateUser(user.id);
  }
}
