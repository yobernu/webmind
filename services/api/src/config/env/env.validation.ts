import { parseMasterKey } from '../../common/crypto/secret-box.js';

/**
 * Checks environment invariants at boot, before anything serves traffic.
 *
 * Passed to `ConfigModule.forRoot({ validate })`. The rule for optional
 * secrets is: absent is fine and reported as a disabled feature, malformed is
 * fatal. A key that is present but unusable would otherwise surface as a
 * runtime failure on the first user who tries to store a credential, long after
 * deployment.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  // Throws on a wrong-length or non-base64 key; returns null when unset.
  parseMasterKey(config.CREDENTIAL_ENCRYPTION_KEY as string | undefined);

  const port = config.PORT;
  if (port !== undefined && Number.isNaN(Number(port))) {
    throw new Error(`PORT must be a number, got "${String(port)}"`);
  }

  return config;
}
