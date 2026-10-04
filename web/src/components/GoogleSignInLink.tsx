export default function GoogleSignInLink({ returnTo = '/' }: { returnTo?: string }) {
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !process.env.GOOGLE_REDIRECT_URI ||
    !process.env.API_URL
  ) {
    return null;
  }

  const href = new URLSearchParams({ next: returnTo });
  return (
    <>
      <a
        className="button button--secondary auth-google-button"
        href={`/auth/google?${href.toString()}`}
      >
        Continue with Google
      </a>
      <p className="auth-divider">Or continue with email</p>
    </>
  );
}
