'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { useEffect, useState } from 'react';
import {
  getRegistrationOptions,
  listPasskeys,
  removePasskey,
  renamePasskey,
  verifyRegistration,
  type PasskeySummary,
} from '@/app/account/security/actions';
import { getPasskeyErrorMessage, supportsPasskeys } from '@/lib/passkeys';

function formatDate(value: string | null): string {
  if (!value) {
    return 'Not used yet';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function PasskeyItem({
  passkey,
  onRename,
  onRemove,
  pending,
}: {
  passkey: PasskeySummary;
  onRename: (id: string, label: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  pending: boolean;
}) {
  const [label, setLabel] = useState(passkey.label);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  async function saveLabel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onRename(passkey.id, label);
  }

  return (
    <li className="passkey-list__item">
      <form className="passkey-list__rename" onSubmit={saveLabel}>
        <label htmlFor={`passkey-label-${passkey.id}`}>Passkey name</label>
        <input
          id={`passkey-label-${passkey.id}`}
          value={label}
          maxLength={80}
          onChange={(event) => setLabel(event.target.value)}
          required
        />
        <button className="button button--secondary" type="submit" disabled={pending}>
          Save name
        </button>
      </form>
      <dl className="passkey-list__details">
        <div>
          <dt>Device</dt>
          <dd>
            {passkey.deviceType === 'multiDevice' ? 'Synced passkey' : 'Single-device passkey'}
          </dd>
        </div>
        <div>
          <dt>Last used</dt>
          <dd>{formatDate(passkey.lastUsedAt)}</dd>
        </div>
      </dl>
      {!confirmingRemoval ? (
        <button
          className="text-button passkey-list__remove"
          type="button"
          onClick={() => setConfirmingRemoval(true)}
          disabled={pending}
        >
          Remove passkey
        </button>
      ) : (
        <div className="passkey-list__confirmation" aria-label={`Remove ${passkey.label}`}>
          <p>Remove this passkey from your account?</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void onRemove(passkey.id)}
            disabled={pending}
          >
            {pending ? 'Removing...' : 'Confirm removal'}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setConfirmingRemoval(false)}
            disabled={pending}
          >
            Keep passkey
          </button>
        </div>
      )}
    </li>
  );
}

export function PasskeyManager({
  initialPasskeys,
  loadError,
}: {
  initialPasskeys: PasskeySummary[];
  loadError?: string;
}) {
  const [passkeys, setPasskeys] = useState(initialPasskeys);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [label, setLabel] = useState('This device');
  const [message, setMessage] = useState(loadError ?? '');
  const [isError, setIsError] = useState(Boolean(loadError));
  const needsReauthentication = Boolean(loadError?.includes('Re-authenticate'));

  useEffect(() => {
    setSupported(supportsPasskeys());
  }, []);

  async function refreshPasskeys(): Promise<boolean> {
    const result = await listPasskeys();
    if (!result.ok) {
      setMessage(result.message);
      setIsError(true);
      return false;
    }
    setPasskeys(result.value);
    return true;
  }

  async function addPasskey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supportsPasskeys()) {
      setSupported(false);
      setMessage('Passkeys are not supported in this browser. Use email or Google to sign in.');
      setIsError(true);
      return;
    }

    setPending(true);
    setMessage('');
    setIsError(false);
    try {
      const options = await getRegistrationOptions();
      if (!options.ok) {
        setMessage(options.message);
        setIsError(true);
        return;
      }
      const registration = await startRegistration({ optionsJSON: options.value });
      const result = await verifyRegistration(registration, label);
      if (!result.ok) {
        setMessage(result.message);
        setIsError(true);
        return;
      }

      setMessage('Passkey added to your account.');
      setIsError(false);
      setLabel('This device');
      await refreshPasskeys();
    } catch (error: unknown) {
      setMessage(getPasskeyErrorMessage(error, 'registration'));
      setIsError(true);
    } finally {
      setPending(false);
    }
  }

  async function savePasskeyLabel(id: string, nextLabel: string) {
    setPending(true);
    setMessage('');
    setIsError(false);
    const result = await renamePasskey(id, nextLabel);
    if (!result.ok) {
      setMessage(result.message);
      setIsError(true);
    } else {
      setMessage('Passkey name updated.');
      await refreshPasskeys();
    }
    setPending(false);
  }

  async function deletePasskey(id: string) {
    setPending(true);
    setMessage('');
    setIsError(false);
    const result = await removePasskey(id);
    if (!result.ok) {
      setMessage(result.message);
      setIsError(true);
    } else {
      setMessage('Passkey removed.');
      await refreshPasskeys();
    }
    setPending(false);
  }

  return (
    <div className="passkey-manager">
      {needsReauthentication ? (
        <p className="auth-form__message auth-form__message--error" role="alert">
          {message}{' '}
          <a href="/sign-in?next=%2Faccount%2Fsecurity">Sign in again with email or Google</a>, then
          retry.
        </p>
      ) : (
        <>
          <section className="passkey-card" aria-labelledby="add-passkey-title">
            <h2 id="add-passkey-title">Add a passkey</h2>
            <p>
              Passkeys use your device screen lock or security key. Email and Google sign-in remain
              available for recovery.
            </p>
            <form className="passkey-add-form" onSubmit={addPasskey}>
              <label htmlFor="new-passkey-label">Name this passkey</label>
              <input
                id="new-passkey-label"
                value={label}
                maxLength={80}
                onChange={(event) => setLabel(event.target.value)}
                required
              />
              <button
                className="button button--primary"
                type="submit"
                disabled={pending || supported === false}
                aria-busy={pending}
              >
                {pending ? 'Waiting for your device...' : 'Add passkey'}
              </button>
            </form>
            {supported === false && (
              <p className="passkey-action__hint" role="status">
                This browser does not support passkeys. Use email or Google sign-in instead.
              </p>
            )}
          </section>

          <section className="passkey-card" aria-labelledby="passkey-list-title">
            <h2 id="passkey-list-title">Your passkeys</h2>
            {passkeys.length === 0 ? (
              <p>No passkeys are registered on this account.</p>
            ) : (
              <ul className="passkey-list">
                {passkeys.map((passkey) => (
                  <PasskeyItem
                    key={passkey.id}
                    passkey={passkey}
                    onRename={savePasskeyLabel}
                    onRemove={deletePasskey}
                    pending={pending}
                  />
                ))}
              </ul>
            )}
          </section>

          {message && (
            <p
              className={
                isError ? 'auth-form__message auth-form__message--error' : 'auth-form__message'
              }
              role={isError ? 'alert' : 'status'}
              aria-live={isError ? 'assertive' : 'polite'}
            >
              {message}
              {isError &&
                (message.includes('last passkey') || message.includes('Re-authenticate')) && (
                  <>
                    {' '}
                    <a href="/sign-in?next=%2Faccount%2Fsecurity">
                      Sign in again with email or Google
                    </a>
                    , then retry removal.
                  </>
                )}
            </p>
          )}
        </>
      )}
    </div>
  );
}
