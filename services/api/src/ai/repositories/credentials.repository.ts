import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';
import type { SealedSecret } from '../../common/crypto/secret-box.js';

export interface StoredCredential extends SealedSecret {
  id: string;
  userId: string;
  provider: string;
  keyVersion: number;
  hint: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CredentialsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Always scoped by user, so a leaked id reads nothing. */
  async find(userId: string, provider: string) {
    return this.prisma.providerCredential.findUnique({
      where: { userId_provider: { userId, provider } },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.providerCredential.findMany({
      where: { userId },
      orderBy: { provider: 'asc' },
    });
  }

  async upsert(
    userId: string,
    provider: string,
    sealed: SealedSecret,
    keyVersion: number,
    hint: string,
  ) {
    const data = { ...sealed, keyVersion, hint };

    return this.prisma.providerCredential.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, ...data },
      update: data,
    });
  }

  /** Returns whether a row was actually removed, so the caller can 404. */
  async remove(userId: string, provider: string): Promise<boolean> {
    const { count } = await this.prisma.providerCredential.deleteMany({
      where: { userId, provider },
    });

    return count > 0;
  }

  /** Fire-and-forget: a failed timestamp update must not fail an answer. */
  async touch(id: string): Promise<void> {
    await this.prisma.providerCredential
      .update({ where: { id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
}
