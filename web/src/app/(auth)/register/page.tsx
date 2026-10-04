import AuthForm from '@/components/AuthForm';
import GoogleSignInLink from '@/components/GoogleSignInLink';
import PasskeySignInButton from '@/components/PasskeySignInButton';
import Link from 'next/link';
import { safeReturnPath } from '@/lib/returnPath';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const returnTo = safeReturnPath(next);

  return (
    <section className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">A place for good finds</p>
        <h1>Create your Brightshelf account</h1>
        <p className="auth-card__intro">
          Start with your email. Choose a one-time code or sign-in link.
        </p>
        <PasskeySignInButton returnTo={returnTo} />
        <GoogleSignInLink returnTo={returnTo} />
        <AuthForm />
        <p className="auth-card__switch">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      </div>
    </section>
  );
}
