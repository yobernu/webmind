import { afterEach, describe, expect, it } from 'vitest';

import { isAllowedOrigin } from './app.setup.js';

const CHROME = 'chrome-extension://ibgogjgdimkikamkfdhimeelgdjpjibg';
const FIREFOX = 'moz-extension://3f1c2a9e-5b7d-4c11-9a2e-0d6f8b1c4e77';

const saved = { ...process.env };

function env(values: Record<string, string | undefined>) {
  for (const key of ['NODE_ENV', 'EXTENSION_ID', 'ALLOW_FIREFOX_EXTENSIONS', 'CORS_ALLOWED_ORIGINS']) {
    delete process.env[key];
  }
  Object.assign(process.env, values);
}

afterEach(() => {
  process.env = { ...saved };
});

describe('isAllowedOrigin', () => {
  it('in production allows only the pinned Chrome extension and, when enabled, Firefox', () => {
    env({
      NODE_ENV: 'production',
      EXTENSION_ID: 'ibgogjgdimkikamkfdhimeelgdjpjibg',
      ALLOW_FIREFOX_EXTENSIONS: 'true',
    });

    expect(isAllowedOrigin(CHROME)).toBe(true);
    expect(isAllowedOrigin(FIREFOX)).toBe(true);
    expect(isAllowedOrigin('chrome-extension://someoneelse')).toBe(false);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(false);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
  });

  it('rejects Firefox origins unless enabled', () => {
    env({ NODE_ENV: 'production', EXTENSION_ID: 'ibgogjgdimkikamkfdhimeelgdjpjibg' });

    expect(isAllowedOrigin(FIREFOX)).toBe(false);
  });

  it('only accepts well-formed Firefox origins', () => {
    env({ NODE_ENV: 'production', ALLOW_FIREFOX_EXTENSIONS: 'true' });

    expect(isAllowedOrigin(FIREFOX)).toBe(true);
    expect(isAllowedOrigin('moz-extension://not-a-uuid')).toBe(false);
    expect(isAllowedOrigin(CHROME)).toBe(false);
  });

  it('allows any extension and localhost in development', () => {
    env({});

    expect(isAllowedOrigin(CHROME)).toBe(true);
    expect(isAllowedOrigin(FIREFOX)).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
  });

  it('lets an explicit list override everything', () => {
    env({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://app.example', ALLOW_FIREFOX_EXTENSIONS: 'true' });

    expect(isAllowedOrigin('https://app.example')).toBe(true);
    expect(isAllowedOrigin(FIREFOX)).toBe(false);
  });
});
