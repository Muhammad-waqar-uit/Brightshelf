'use client';

import { startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAuthenticationOptions, verifyAuthentication } from '@/app/account/security/actions';
import { getPasskeyErrorMessage, supportsPasskeys } from '@/lib/passkeys';

export default function PasskeySignInButton({ returnTo = '/' }: { returnTo?: string }) {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    setSupported(supportsPasskeys());
  }, []);

  async function signIn() {
    if (!supportsPasskeys()) {
      setSupported(false);
      setMessage('Passkeys are not supported in this browser. Continue with email or Google.');
      setIsError(true);
      return;
    }

    setPending(true);
    setMessage(null);
    setIsError(false);
    try {
      const optionsResult = await getAuthenticationOptions();
      if (!optionsResult.ok) {
        setMessage(optionsResult.message);
        setIsError(true);
        return;
      }

      const assertion = await startAuthentication({
        optionsJSON: optionsResult.value as PublicKeyCredentialRequestOptionsJSON,
      });
      const verification = await verifyAuthentication(assertion);
      if (!verification.ok) {
        setMessage(verification.message);
        setIsError(true);
        return;
      }

      router.push(returnTo);
    } catch (error: unknown) {
      setMessage(getPasskeyErrorMessage(error, 'sign-in'));
      setIsError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="passkey-action">
      <button
        className="button button--secondary passkey-action__button"
        type="button"
        onClick={signIn}
        disabled={pending || supported === false}
        aria-busy={pending}
      >
        {pending
          ? 'Waiting for passkey...'
          : supported === false
            ? 'Passkeys unavailable'
            : 'Sign in with a passkey'}
      </button>
      {supported === false && (
        <p className="passkey-action__hint" role="status">
          This browser does not support passkeys. Continue with email or Google below.
        </p>
      )}
      {message && (
        <p
          className={
            isError ? 'auth-form__message auth-form__message--error' : 'auth-form__message'
          }
          role={isError ? 'alert' : 'status'}
          aria-live={isError ? 'assertive' : 'polite'}
        >
          {message}
        </p>
      )}
    </div>
  );
}
