import { Injectable } from '@nestjs/common';

import { assertOwned } from '../../common/utils/ownership.js';
import type { AuthProvider } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UpdateUserDto } from '../dto/update-user.dto.js';
import type { PublicUser } from '../entities/user.entity.js';
import { toPublicUser } from '../mappers/user.mapper.js';

/** Profile fields an external provider can supply about an account. */
export interface ProviderProfile {
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  emailVerified: boolean;
  provider: AuthProvider;
  providerAccountId: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async createUser(email: string, passwordHash: string) {
    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });
  }

  /** The user behind an external account, or null when it is not linked yet. */
  async findByProviderAccount(
    provider: AuthProvider,
    providerAccountId: string,
  ) {
    const identity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerAccountId: { provider, providerAccountId },
      },
      include: { user: true },
    });

    return identity?.user ?? null;
  }

  /** Creates an account and its first external identity atomically. */
  async createWithIdentity(profile: ProviderProfile) {
    return this.prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        emailVerified: profile.emailVerified,
        identities: {
          create: {
            provider: profile.provider,
            providerAccountId: profile.providerAccountId,
            email: profile.email,
          },
        },
      },
    });
  }

  /**
   * Attaches an external identity to an existing account, filling in profile
   * fields the account does not have yet without overwriting what it does.
   *
   * `revokePassword` drops a password nobody ever proved belongs to the email
   * owner; see AuthService.resolveProviderUser.
   */
  async linkIdentity(
    userId: string,
    profile: ProviderProfile,
    options: { revokePassword?: boolean } = {},
  ) {
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          name: profile.name ?? undefined,
          avatarUrl: profile.avatarUrl ?? undefined,
          emailVerified: profile.emailVerified ? true : undefined,
          ...(options.revokePassword ? { passwordHash: null } : {}),
        },
      }),
      this.prisma.authIdentity.create({
        data: {
          userId,
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
          email: profile.email,
        },
      }),
    ]);

    return user;
  }

  async getProfile(userId: string): Promise<PublicUser> {
    return toPublicUser(assertOwned(await this.findById(userId), 'User'));
  }

  async updateProfile(userId: string, dto: UpdateUserDto): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto.name === undefined ? {} : { name: dto.name.trim() || null },
    });

    return toPublicUser(user);
  }

  /**
   * Every table hangs off the user with ON DELETE CASCADE, so one delete
   * removes all of their data in a single statement.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  /** Stores the answer-provider preference. Null model means "provider default". */
  async setAiPreference(
    userId: string,
    aiProvider: string,
    aiModel: string | null,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { aiProvider, aiModel },
    });
  }
}
