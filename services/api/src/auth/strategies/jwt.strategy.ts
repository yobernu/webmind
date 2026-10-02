import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

import { UsersService } from '../../users/services/users.service.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      ignoreExpiration: false,

      // getOrThrow, because passport-jwt requires a defined secret and a
      // missing JWT_SECRET must fail loudly at boot rather than at request time.
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * A valid signature only proves the token was issued; the account may have
   * been deleted since. Checking keeps a deleted user's 7-day token from
   * reaching anything.
   */
  async validate(payload: { sub: string; email: string }): Promise<AuthenticatedUser> {
    const user = await this.users.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('This account no longer exists');
    }

    return { id: user.id, email: user.email };
  }
}
