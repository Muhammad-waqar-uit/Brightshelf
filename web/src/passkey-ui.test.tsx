// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  getAuthenticationOptions: vi.fn(),
  verifyAuthentication: vi.fn(),
  getRegistrationOptions: vi.fn(),
  verifyRegistration: vi.fn(),
  listPasskeys: vi.fn(),
  renamePasskey: vi.fn(),
  removePasskey: vi.fn(),
  supportsPasskeys: vi.fn(),
  getPasskeyErrorMessage: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: mocks.startAuthentication,
  startRegistration: mocks.startRegistration,
}));

vi.mock('@/app/account/security/actions', () => ({
  getAuthenticationOptions: mocks.getAuthenticationOptions,
  verifyAuthentication: mocks.verifyAuthentication,
  getRegistrationOptions: mocks.getRegistrationOptions,
  verifyRegistration: mocks.verifyRegistration,
  listPasskeys: mocks.listPasskeys,
  renamePasskey: mocks.renamePasskey,
  removePasskey: mocks.removePasskey,
}));

vi.mock('@/lib/passkeys', () => ({
  supportsPasskeys: mocks.supportsPasskeys,
  getPasskeyErrorMessage: mocks.getPasskeyErrorMessage,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

import { PasskeyManager } from './components/PasskeyManager';
import PasskeySignInButton from './components/PasskeySignInButton';

const passkey = {
  id: 'passkey-1',
  label: 'Personal laptop',
  deviceType: 'singleDevice' as const,
  backedUp: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.supportsPasskeys.mockReturnValue(true);
  mocks.getPasskeyErrorMessage.mockImplementation((error: unknown, action: string) => {
    const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : '';
    if (name === 'NotAllowedError') {
      return action === 'sign-in'
        ? 'Passkey sign-in was canceled. Retry or continue with email or Google.'
        : 'Passkey registration was canceled. Retry or continue using email or Google.';
    }
    return 'The passkey ceremony failed.';
  });
  mocks.getAuthenticationOptions.mockResolvedValue({ ok: true, value: { challenge: 'test' } });
  mocks.startAuthentication.mockResolvedValue({ id: 'assertion' });
  mocks.verifyAuthentication.mockResolvedValue({ ok: true, value: undefined });
  mocks.getRegistrationOptions.mockResolvedValue({ ok: true, value: { challenge: 'test' } });
  mocks.startRegistration.mockResolvedValue({ id: 'registration' });
  mocks.verifyRegistration.mockResolvedValue({ ok: true, value: undefined });
  mocks.listPasskeys.mockResolvedValue({ ok: true, value: [passkey] });
  mocks.renamePasskey.mockResolvedValue({ ok: true, value: undefined });
  mocks.removePasskey.mockResolvedValue({ ok: true, value: undefined });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('passkey sign-in', () => {
  it('explains unsupported browser support and keeps the email fallback guidance visible', async () => {
    mocks.supportsPasskeys.mockReturnValue(false);
    render(<PasskeySignInButton />);

    expect(await screen.findByText(/does not support passkeys/i)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Passkeys unavailable' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('shows pending state, then reports successful verification and navigates', async () => {
    const options = deferred<{ ok: true; value: { challenge: string } }>();
    const assign = vi.fn();
    mocks.push.mockImplementation(assign);
    mocks.getAuthenticationOptions.mockReturnValue(options.promise);
    render(<PasskeySignInButton returnTo="/account/security" />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
    expect(
      screen.getByRole('button', { name: 'Waiting for passkey...' }).hasAttribute('disabled'),
    ).toBe(true);
    options.resolve({ ok: true, value: { challenge: 'test' } });
    await waitFor(() => expect(mocks.verifyAuthentication).toHaveBeenCalled());
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/account/security'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers retry or email/Google fallback after a canceled ceremony or rejected verification', async () => {
    mocks.startAuthentication.mockRejectedValueOnce(new DOMException('', 'NotAllowedError'));
    render(<PasskeySignInButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/was canceled/i);

    mocks.startAuthentication.mockResolvedValueOnce({ id: 'assertion' });
    mocks.verifyAuthentication.mockResolvedValueOnce({
      ok: false,
      message: 'The passkey could not be verified. Retry or use email or Google.',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be verified/i);
    expect(screen.queryByText(/signed in/i)).toBeNull();
  });
});

describe('passkey account manager', () => {
  it('shows a pending registration state and confirms the passkey only after success', async () => {
    const options = deferred<{ ok: true; value: { challenge: string } }>();
    mocks.getRegistrationOptions.mockReturnValue(options.promise);
    render(<PasskeyManager initialPasskeys={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey' }));
    expect(
      screen.getByRole('button', { name: 'Waiting for your device...' }).hasAttribute('disabled'),
    ).toBe(true);
    options.resolve({ ok: true, value: { challenge: 'test' } });
    expect((await screen.findByRole('status')).textContent).toMatch(/passkey added/i);
    expect(mocks.verifyRegistration).toHaveBeenCalledWith({ id: 'registration' }, 'This device');
    expect(mocks.listPasskeys).toHaveBeenCalled();
  });

  it('requires an explicit removal confirmation and provides re-authentication fallback', async () => {
    mocks.removePasskey.mockResolvedValue({
      ok: false,
      message: 'Sign in again before removing your last passkey.',
    });
    render(<PasskeyManager initialPasskeys={[passkey]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove passkey' }));

    expect(screen.getByText('Remove this passkey from your account?')).toBeTruthy();
    expect(mocks.removePasskey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/last passkey/i);
    expect(
      screen
        .getByRole('link', { name: /sign in again with email or google/i })
        .getAttribute('href'),
    ).toBe('/sign-in?next=%2Faccount%2Fsecurity');
  });

  it('provides an explicit keep action to cancel the removal confirmation', () => {
    render(<PasskeyManager initialPasskeys={[passkey]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove passkey' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep passkey' }));
    expect(screen.queryByText('Remove this passkey from your account?')).toBeNull();
  });

  it('provides a sign-in fallback instead of management controls when re-authentication is required', () => {
    render(
      <PasskeyManager
        initialPasskeys={[]}
        loadError="Re-authenticate with email or Google to manage passkeys."
      />,
    );
    expect(screen.queryByRole('button', { name: 'Add passkey' })).toBeNull();
    expect(screen.getByRole('link', { name: /sign in again with email or google/i })).toBeTruthy();
  });
});
