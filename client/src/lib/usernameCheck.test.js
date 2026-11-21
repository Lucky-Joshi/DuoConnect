import { describe, expect, it } from 'vitest';
import { usernameCheckStatus } from './usernameCheck';

const response = (data) => ({ data: { data } });

describe('usernameCheckStatus', () => {
  it('recognizes an available username in the wrapped API response', () => {
    expect(
      usernameCheckStatus(
        response({
          username: 'bright_fox',
          valid: true,
          available: true,
          message: 'This username is available.',
        }),
      ),
    ).toEqual({ state: 'available', message: 'This username is available.' });
  });

  it('marks an existing username as taken', () => {
    expect(
      usernameCheckStatus(
        response({ valid: true, available: false, message: 'That username is taken.' }),
      ),
    ).toEqual({ state: 'taken', message: 'That username is taken.' });
  });

  it('reports invalid usernames separately from taken ones', () => {
    expect(
      usernameCheckStatus(
        response({ valid: false, available: false, message: 'Use at least 3 characters.' }),
      ),
    ).toEqual({ state: 'invalid', message: 'Use at least 3 characters.' });
  });

  it('stays idle when there is no payload', () => {
    expect(usernameCheckStatus({ data: {} })).toEqual({ state: 'idle', message: '' });
  });
});
