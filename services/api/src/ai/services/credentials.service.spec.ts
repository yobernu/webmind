import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { UsersService } from '../../users/services/users.service.js';
import type { CredentialsRepository } from '../repositories/credentials.repository.js';
import { CredentialsService } from './credentials.service.js';

/** No encryption key, so only server keys can resolve. */
function createService(env: Record<string, string>) {
  return new CredentialsService(
    {} as CredentialsRepository,
    {} as UsersService,
    { get: (key: string) => env[key] } as unknown as ConfigService,
  );
}

describe('CredentialsService server keys', () => {
  const env = {
    GEMINI_API_KEY: 'gemini-key',
    OPENROUTER_API_KEY: 'openrouter-key',
    ANTHROPIC_API_KEY: 'anthropic-key',
  };

  it.each([
    ['gemini', 'gemini-key'],
    ['openrouter', 'openrouter-key'],
    ['anthropic', 'anthropic-key'],
  ] as const)('gives %s its own key and no other vendor’s', async (provider, key) => {
    const resolved = await createService(env).resolveCredential('user-1', provider);

    expect(resolved).toEqual({ apiKey: key, source: 'server' });
  });

  it('refuses rather than falling back to another provider’s key', async () => {
    const service = createService({ OPENROUTER_API_KEY: 'openrouter-key' });

    await expect(service.resolveCredential('user-1', 'anthropic')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
