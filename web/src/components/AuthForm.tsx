'use client';

import { useActionState } from 'react';
import { submitAuthForm, type AuthFormState } from '@/app/(auth)/actions';

const initialState: AuthFormState = {
  step: 'email',
  method: 'code',
};

function SubmitButton({
  method,
  pending,
  step,
}: {
  method: AuthFormState['method'];
  pending: boolean;
  step: AuthFormState['step'];
}) {
  const label =
    step === 'code'
      ? 'Verify code and continue'
      : method === 'link' && step === 'link-sent'
        ? 'Send another sign-in link'
        : method === 'link'
          ? 'Email me a sign-in link'
          : 'Send sign-in code';

  return (
    <button className="button button--primary auth-card__submit" type="submit" disabled={pending}>
      {pending ? 'Please wait...' : label}
    </button>
  );
}

export default function AuthForm({ returnTo = '/' }: { returnTo?: string }) {
  const [state, formAction, pending] = useActionState(submitAuthForm, initialState);

  return (
    <form action={formAction} className="auth-form">
      <input name="step" type="hidden" value={state.step} />
      <input name="returnTo" type="hidden" value={returnTo} />
      {state.step !== 'email' && <input name="method" type="hidden" value={state.method} />}
      <label htmlFor="auth-email">Email address</label>
      <input
        autoComplete="email"
        autoFocus
        id="auth-email"
        name="email"
        required
        type="email"
        defaultValue={state.email}
        readOnly={state.step !== 'email'}
      />

      {state.step === 'email' && (
        <>
          <label htmlFor="auth-method">Sign-in method</label>
          <select defaultValue={state.method} id="auth-method" name="method">
            <option value="code">One-time code</option>
            <option value="link">Sign-in link</option>
          </select>
        </>
      )}

      {state.step === 'code' && (
        <>
          <label htmlFor="auth-code">Six-digit sign-in code</label>
          <input
            autoComplete="one-time-code"
            autoFocus
            id="auth-code"
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            name="code"
            pattern="[0-9]{6}"
            required
            type="text"
          />
        </>
      )}

      {state.message && (
        <p
          className={
            state.error ? 'auth-form__message auth-form__message--error' : 'auth-form__message'
          }
          role={state.error ? 'alert' : 'status'}
          aria-live={state.error ? 'assertive' : 'polite'}
        >
          {state.message}
        </p>
      )}

      {state.developmentCode && (
        <p className="auth-form__development-code">
          Development code: <strong>{state.developmentCode}</strong>
        </p>
      )}

      {state.developmentLink && (
        <a className="button button--secondary auth-card__submit" href={state.developmentLink}>
          Continue with development sign-in link
        </a>
      )}

      <SubmitButton method={state.method} pending={pending} step={state.step} />
    </form>
  );
}
