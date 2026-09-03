import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';

import { AuthService } from '../services/auth.service.js';
import { GoogleAuthService } from '../services/google-auth.service.js';
import { RegisterDto } from '../dto/register.dto.js';
import { LoginDto } from '../dto/login.dto.js';
import { GoogleAuthDto } from '../dto/google-auth.dto.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';

/** What JwtStrategy.validate() puts on the request. */
interface AuthenticatedRequest {
  user: { id: string; email: string };
}

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
  @Get('providers')
  providers() {
    return { google: this.googleAuthService.describeProvider() };
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  google(@Body() dto: GoogleAuthDto) {
    return this.authService.loginWithGoogle(dto.idToken);
  }

  /**
   * Reads the account fresh rather than echoing the token payload, so the
   * profile stays current and a deleted account fails the check.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.validateUser(req.user.id);
  }
}
