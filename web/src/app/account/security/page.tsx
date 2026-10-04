import Link from 'next/link';
import { PasskeyManager } from '@/components/PasskeyManager';
import { getCurrentUser } from '@/lib/auth';
import { listPasskeys } from './actions';

export default async function AccountSecurityPage() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return (
      <section className="account-security-page" aria-labelledby="security-title">
        <p className="eyebrow">Account</p>
        <h1 id="security-title">Security</h1>
        <div className="feedback-card feedback-card--error" role="alert">
          <h2>Account security is unavailable</h2>
          <p>We could not verify your account. Please try again shortly.</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="account-security-page" aria-labelledby="security-title">
        <p className="eyebrow">Account</p>
        <h1 id="security-title">Security</h1>
        <div className="feedback-card">
          <h2>Sign in to manage passkeys</h2>
          <p>Passkeys are managed from your signed-in Brightshelf account.</p>
          <Link className="button button--primary" href="/sign-in?next=%2Faccount%2Fsecurity">
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  const result = await listPasskeys();
  return (
    <section className="account-security-page" aria-labelledby="security-title">
      <p className="eyebrow">Account security</p>
      <h1 id="security-title">Passkeys</h1>
      <p className="account-security-page__intro">
        Add a passkey for faster sign-in. Email and Google remain available as account recovery
        methods.
      </p>
      <PasskeyManager
        initialPasskeys={result.ok ? result.value : []}
        loadError={result.ok ? undefined : result.message}
      />
    </section>
  );
}
