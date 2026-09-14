import { Inject, Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  getOptionsToken,
  getStorageToken,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';

import { AiService } from '../../ai/services/ai.service.js';

/**
 * Rate limits per authenticated user rather than per IP.
 *
 * SRS §8 asks for "request limits and token/cost controls" on the AI pipeline.
 * IP keying is the wrong unit here: several users behind one NAT would share a
 * budget, and one user across two networks would get two.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  // ThrottlerGuard's own dependencies have to be re-declared to add one of our
  // own; the tokens are exported for exactly this case.
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly aiService: AiService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { id?: string } | undefined;

    // Unauthenticated requests never reach a throttled route (JwtAuthGuard runs
    // first), but fall back to the IP rather than lumping them under one key.
    return user?.id ?? (req.ip as string) ?? 'unknown';
  }

  /**
   * Exempts requests that will be served with the user's own API key.
   *
   * The cap exists to bound *this server's* provider bill. Someone spending
   * their own quota costs this server nothing, so throttling them would be
   * arbitrary. Requests falling back to the server key stay capped.
   */
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { id?: string } }>();

    const userId = request?.user?.id;
    if (!userId) return false;

    try {
      // Resolves the same provider and credential the handler will use, so the
      // exemption cannot disagree with whose key actually pays.
      const resolved = await this.aiService.resolveFor(userId);

      return resolved.credential.source === 'user';
    } catch {
      // No provider available at all: let it through to the handler, which
      // produces the real, explanatory error.
      return false;
    }
  }
}
