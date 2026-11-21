import { unwrap } from './api';

/**
 * Map a /auth/username-available response to the sign-up form status.
 *
 * The API envelope is `{ data: { data: { valid, available, message } } }`.
 * Reading `response.data` directly loses `available`, which makes every
 * username look taken.
 */
export function usernameCheckStatus(response) {
  const result = unwrap(response);
  if (!result) return { state: 'idle', message: '' };
  if (result.valid === false) {
    return { state: 'invalid', message: result.message ?? 'Choose a different username.' };
  }
  return {
    state: result.available ? 'available' : 'taken',
    message:
      result.message ??
      (result.available ? 'This username is available.' : 'That username is taken.'),
  };
}
