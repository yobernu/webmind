import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import {
  ABSENT_ACCOUNT_HASH,
  BCRYPT_COST,
  EMAIL_TAKEN_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
} from '../constants/auth.constants.js';
import { AuthProvider } from '../../generated/prisma/enums.js';
import {
  UsersService,
  type ProviderProfile,
} from '../../users/services/users.service.js';
import { RegisterDto } from '../dto/register.dto.js';
import { LoginDto } from '../dto/login.dto.js';
import { GoogleAuthService } from './google-auth.service.js';
import type { PublicUserSource } from '../../users/entities/user.entity.js';
import { toPublicUser } from '../../users/mappers/user.mapper.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();

    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException(EMAIL_TAKEN_MESSAGE);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const user = await this.usersService.createUser(email, passwordHash);

    return this.generateAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();

    const user = await this.usersService.findByEmail(email);

    // Always run a comparison, even when the account does not exist, so both
    // failures take the same time and the same message.
    const passwordValid = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? ABSENT_ACCOUNT_HASH,
    );

    if (!user || !passwordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    return this.generateAuthResponse(user);
  }

  /**
   * Exchanges a Google ID token from the extension for a WebMind session.
   *
   * Resolution order: the linked Google identity, then an existing account with
   * the same (Google-verified) email, then a brand new account.
   */
  async loginWithGoogle(idToken: string) {
    const identity = await this.googleAuthService.verifyIdToken(idToken);

    const profile: ProviderProfile = {
      email: identity.email,
      name: identity.name,
      avatarUrl: identity.avatarUrl,
      emailVerified: identity.emailVerified,
      provider: AuthProvider.GOOGLE,
      providerAccountId: identity.sub,
    };

    const user = await this.resolveProviderUser(profile);

    return this.generateAuthResponse(user);
  }

  private async resolveProviderUser(profile: ProviderProfile) {
    const linked = await this.usersService.findByProviderAccount(
      profile.provider,
      profile.providerAccountId,
    );

    if (linked) {
      return linked;
    }

    const byEmail = await this.usersService.findByEmail(profile.email);

    if (byEmail) {
      // Safe to adopt: the provider vouched for this email address, which
      // verifyIdToken already required.
      //
      // Password sign-ups never verify the address, so anyone could have
      // registered it first and be waiting for the real owner to arrive (an
      // account pre-hijack). Now that ownership is proven, a password set
      // before that proof is revoked; the owner can keep using Google.
      return this.usersService.linkIdentity(byEmail.id, profile, {
        revokePassword: !byEmail.emailVerified && byEmail.passwordHash !== null,
      });
    }

    try {
      return await this.usersService.createWithIdentity(profile);
    } catch (cause) {
      // Two first-time sign-ins racing each other: whichever loses the unique
      // constraint reads the row the winner just wrote.
      if (!isUniqueConstraintViolation(cause)) {
        throw cause;
      }

      const created = await this.usersService.findByProviderAccount(
        profile.provider,
        profile.providerAccountId,
      );

      if (created) {
        return created;
      }

      const existing = await this.usersService.findByEmail(profile.email);

      if (!existing) {
        throw cause;
      }

      return existing;
    }
  }

  async validateUser(userId: string) {
    const user = await this.usersService.findById(userId);

    // The token was signed for an account that no longer exists.
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    return toPublicUser(user);
  }

  private async generateAuthResponse(user: PublicUserSource) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      accessToken,
      user: toPublicUser(user),
    };
  }
}

/** Prisma's unique-constraint code, without importing the error class here. */
function isUniqueConstraintViolation(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: unknown }).code === 'P2002'
  );
}
