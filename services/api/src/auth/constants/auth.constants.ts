/**
 * Returned for both an unknown email and a wrong password. Keeping the two
 * indistinguishable stops the endpoint from being used to discover which
 * email addresses have accounts.
 */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

export const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists';

/** bcrypt work factor used for every password hash. */
export const BCRYPT_COST = 12;

/**
 * Compared against when the email is unknown, so that a missing account costs
 * the same time as a wrong password. Without this, the response time alone
 * reveals whether an account exists. It is a real bcrypt hash at BCRYPT_COST
 * of a value no user can register.
 */
export const ABSENT_ACCOUNT_HASH =
  '$2b$12$wqOCBXy5po.iWB90ugE86.3s/CQ3W6tEk5BX5cu23K7oMIf2H3Sjm';
