import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { GoogleAuthService } from './services/google-auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [
    UsersModule,

    // Must be `.register()`, not bare `PassportModule`: @nestjs/passport v12's
    // AuthGuard injects AuthModuleOptions non-optionally, and only register()
    // provides it.
    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.registerAsync({
      imports: [ConfigModule],

      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),

        signOptions: {
          expiresIn: '7d',
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, GoogleAuthService, JwtStrategy],

  // PassportModule is re-exported so that any module guarding routes with
  // JwtAuthGuard can resolve AuthModuleOptions by importing AuthModule alone.
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
