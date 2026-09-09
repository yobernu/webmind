import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limits per authenticated user rather than per IP.
 *
 * SRS §8 asks for "request limits and token/cost controls" on the AI pipeline.
 * IP keying is the wrong unit here: several users behind one NAT would share a
 * budget, and one user across two networks would get two.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { id?: string } | undefined;

    // Unauthenticated requests never reach a throttled route (JwtAuthGuard runs
    // first), but fall back to the IP rather than lumping them under one key.
    return user?.id ?? (req.ip as string) ?? 'unknown';
  }
}
