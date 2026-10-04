import AuthForm from '@/components/AuthForm';
import GoogleSignInLink from '@/components/GoogleSignInLink';
import PasskeySignInButton from '@/components/PasskeySignInButton';
import Link from 'next/link';
import { safeReturnPath } from '@/lib/returnPath';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const returnTo = safeReturnPath(next);

  return (
    <section className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to Brightshelf</h1>
        <p className="auth-card__intro">
          Choose a one-time code or sign-in link sent to your email.
        </p>
        {error === 'google' && (
          <p className="auth-form__message auth-form__message--error" role="alert">
            Google sign-in could not be completed. Please try again or use email.
          </p>
        )}
        {error === 'link' && (
          <p className="auth-form__message auth-form__message--error" role="alert">
            This sign-in link is invalid, expired, or already used. Request a new one.
          </p>
        )}
        <PasskeySignInButton returnTo={returnTo} />
        <GoogleSignInLink returnTo={returnTo} />
        <AuthForm returnTo={returnTo} />
        <p className="auth-card__switch">
          New to Brightshelf? <Link href="/register">Create an account</Link>
        </p>
      </div>
    </section>
  );
}
