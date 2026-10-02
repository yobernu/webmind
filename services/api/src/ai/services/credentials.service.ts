import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  decryptSecret,
  encryptSecret,
  parseMasterKey,
  secretHint,
} from '../../common/crypto/secret-box.js';
import { UsersService } from '../../users/services/users.service.js';
import type { AiProviderId } from '../providers/ai-provider.interface.js';
import { CredentialsRepository } from '../repositories/credentials.repository.js';

/**
 * The environment variable holding each provider's server key. A Record, so
 * adding a provider id without its variable fails to compile instead of
 * silently sending one vendor's key to another.
 */
const SERVER_KEY_VARIABLES: Record<AiProviderId, string> = {
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

/** Version stamped into new rows and into the AAD. */
const CURRENT_KEY_VERSION = 1;

/** Which key a request will be served with, and where it came from. */
export interface ResolvedCredential {
  apiKey: string;
  source: 'user' | 'server';
  /** Set only for a user key, so usage can be timestamped. */
  credentialId?: string;
}

/** What the API may reveal about a stored key. */
export interface CredentialSummary {
  provider: AiProviderId;
  hint: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/**
 * Owns provider credentials: storage, encryption, and the precedence rule that
 * decides whose key serves a request.
 *
 * Precedence lives here alone because three callers need the same answer —
 * answering, embedding, and the rate-limit exemption — and disagreement between
 * them would mean billing the wrong account or leaking an exemption.
 */
@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);
  private readonly masterKey: Buffer | null;

  constructor(
    private readonly credentials: CredentialsRepository,
    private readonly users: UsersService,
    private readonly configService: ConfigService,
  ) {
    // Throws on a malformed key: a half-configured secret store is worse than
    // an absent one, because the absence is at least reported.
    this.masterKey = parseMasterKey(
      configService.get<string>('CREDENTIAL_ENCRYPTION_KEY'),
    );

    if (!this.masterKey) {
      this.logger.warn(
        'CREDENTIAL_ENCRYPTION_KEY is not set; users cannot store their own provider keys.',
      );
    }
  }

  /** False when the server cannot encrypt, so the UI can explain rather than fail. */
  get isAvailable(): boolean {
    return this.masterKey !== null;
  }

  private requireMasterKey(): Buffer {
    if (!this.masterKey) {
      throw new ServiceUnavailableException(
        'Storing your own API key is not available on this server.',
      );
    }

    return this.masterKey;
  }

  /**
   * Binds a ciphertext to its owner, provider and key version.
   *
   * Not secret, but decryption fails without the exact same value, which is
   * what stops a row being moved between accounts.
   */
  private aad(userId: string, provider: string, keyVersion: number): string {
    return `${userId}:${provider}:${keyVersion}`;
  }

  /** The server-wide key for a provider, if one is configured. */
  private serverKey(provider: AiProviderId): string | null {
    return (
      this.configService.get<string>(SERVER_KEY_VARIABLES[provider])?.trim() ||
      null
    );
  }

  /**
   * Resolves the key for one user and provider.
   *
   * A stored key wins over the server's; `byokEnabled: false` ignores any
   * stored key, which is the entitlement gate.
   */
  async resolveCredential(
    userId: string,
    provider: AiProviderId,
  ): Promise<ResolvedCredential> {
    const own = await this.findUsableUserKey(userId, provider);

    if (own) return own;

    const server = this.serverKey(provider);

    if (server) return { apiKey: server, source: 'server' };

    throw new ServiceUnavailableException(
      `No API key is available for ${provider}. Add your own key to continue.`,
    );
  }

  /** Like `resolveCredential` but returns null instead of throwing. */
  async tryResolveCredential(
    userId: string,
    provider: AiProviderId,
  ): Promise<ResolvedCredential | null> {
    return this.resolveCredential(userId, provider).catch(() => null);
  }

  /** Decrypts the user's own key, or null when there is not a usable one. */
  private async findUsableUserKey(
    userId: string,
    provider: AiProviderId,
  ): Promise<ResolvedCredential | null> {
    if (!this.masterKey) return null;

    const user = await this.users.findById(userId);
    if (!user?.byokEnabled) return null;

    const row = await this.credentials.find(userId, provider);
    if (!row) return null;

    try {
      const apiKey = decryptSecret(
        this.masterKey,
        { ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag },
        this.aad(userId, provider, row.keyVersion),
      );

      return { apiKey, source: 'user', credentialId: row.id };
    } catch {
      // A row that will not decrypt is unusable, but falling back to the server
      // key silently would bill the wrong account for a key the user believes
      // is in force. Refuse instead, loudly in the log.
      this.logger.error(
        `Stored ${provider} credential for user ${userId} could not be decrypted; refusing to fall back.`,
      );

      throw new ServiceUnavailableException(
        `Your stored ${provider} key could not be read. Remove and re-add it.`,
      );
    }
  }

  /** True when this user has a usable stored key, for status and throttling. */
  async hasUserKey(userId: string, provider: AiProviderId): Promise<boolean> {
    if (!this.masterKey) return false;

    const user = await this.users.findById(userId);
    if (!user?.byokEnabled) return false;

    return (await this.credentials.find(userId, provider)) !== null;
  }

  async listForUser(userId: string): Promise<CredentialSummary[]> {
    const rows = await this.credentials.listForUser(userId);

    // Deliberately omits every field that could reconstruct the key.
    return rows.map((row) => ({
      provider: row.provider as AiProviderId,
      hint: row.hint,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    }));
  }

  async store(
    userId: string,
    provider: AiProviderId,
    apiKey: string,
  ): Promise<CredentialSummary> {
    const masterKey = this.requireMasterKey();
    const trimmed = apiKey.trim();

    if (trimmed.length < 8) {
      throw new BadRequestException('That does not look like an API key.');
    }

    const sealed = encryptSecret(
      masterKey,
      trimmed,
      this.aad(userId, provider, CURRENT_KEY_VERSION),
    );

    const row = await this.credentials.upsert(
      userId,
      provider,
      sealed,
      CURRENT_KEY_VERSION,
      secretHint(trimmed),
    );

    return {
      provider,
      hint: row.hint,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    };
  }

  async remove(userId: string, provider: AiProviderId): Promise<void> {
    const removed = await this.credentials.remove(userId, provider);

    if (!removed) {
      throw new NotFoundException(`No stored ${provider} key to remove.`);
    }
  }

  /** Records that a key was used; never throws into the answer path. */
  async markUsed(credential: ResolvedCredential): Promise<void> {
    if (credential.source === 'user' && credential.credentialId) {
      await this.credentials.touch(credential.credentialId);
    }
  }
}
