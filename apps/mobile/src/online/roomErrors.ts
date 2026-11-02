/**
 * Typed failure of `create_private_table`. Its `message` is an online error
 * code (`room_rate_limited` or `offline`), so `actionErrorMessage` and
 * `onlineErrorMessage` (messages.ts) can show it like any other online error.
 */

export type CreatePrivateTableFailure = 'rate_limited' | 'network';

const ERROR_NAME = 'CreatePrivateTableError';

export class CreatePrivateTableError extends Error {
  readonly reason: CreatePrivateTableFailure;

  constructor(reason: CreatePrivateTableFailure) {
    super(reason === 'rate_limited' ? 'room_rate_limited' : 'offline');
    // Transpiled Error subclasses can lose their prototype; keep `instanceof` working.
    Object.setPrototypeOf(this, CreatePrivateTableError.prototype);
    this.name = ERROR_NAME;
    this.reason = reason;
  }
}

/** True for a `CreatePrivateTableError`, also across a lost prototype chain. */
export function isCreatePrivateTableError(error: unknown): error is CreatePrivateTableError {
  if (error instanceof CreatePrivateTableError) return true;
  if (typeof error !== 'object' || error === null || !('name' in error) || !('reason' in error)) return false;
  return error.name === ERROR_NAME && (error.reason === 'rate_limited' || error.reason === 'network');
}
