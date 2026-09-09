import { NotFoundException } from '@nestjs/common';

/**
 * Asserts a row exists and belongs to the caller.
 *
 * Deliberately 404 rather than 403: a "forbidden" reply would confirm that a
 * given id exists for some other user, which is a probe worth denying.
 */
export function assertOwned<T>(row: T | null | undefined, what = 'Resource'): T {
  if (!row) {
    throw new NotFoundException(`${what} not found`);
  }

  return row;
}
