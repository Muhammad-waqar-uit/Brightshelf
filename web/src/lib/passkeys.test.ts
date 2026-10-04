import { describe, expect, it } from 'vitest';
import { getPasskeyErrorMessage } from './passkeys';

describe('getPasskeyErrorMessage', () => {
  it('identifies a canceled WebAuthn ceremony', () => {
    const error = new DOMException('', 'NotAllowedError');

    expect(getPasskeyErrorMessage(error, 'sign-in')).toMatch(/was canceled/i);
    expect(getPasskeyErrorMessage(error, 'registration')).toMatch(/was canceled/i);
  });

  it('provides a recovery path for missing credentials and verification failures', () => {
    expect(getPasskeyErrorMessage(new DOMException('', 'NotFoundError'), 'sign-in')).toMatch(
      /no matching passkey.*email or google/i,
    );
    expect(getPasskeyErrorMessage(new Error('failure'), 'sign-in')).toMatch(
      /retry or use email or google/i,
    );
  });
});
