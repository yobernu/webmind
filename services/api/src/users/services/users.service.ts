import { Injectable } from '@nestjs/common';

import type { AuthProvider } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';

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
   */
  async linkIdentity(userId: string, profile: ProviderProfile) {
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          name: profile.name ?? undefined,
          avatarUrl: profile.avatarUrl ?? undefined,
          emailVerified: profile.emailVerified ? true : undefined,
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
}
