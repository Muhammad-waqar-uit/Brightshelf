export function supportsPasskeys(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.get === 'function' &&
    typeof navigator.credentials?.create === 'function'
  );
}

export function getPasskeyErrorMessage(error: unknown, action: 'sign-in' | 'registration'): string {
  const name =
    typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
      ? error.name
      : '';
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return action === 'sign-in'
      ? 'Passkey sign-in was canceled. Retry or continue with email or Google.'
      : 'Passkey registration was canceled. Retry or continue using email or Google.';
  }
  if (name === 'NotFoundError') {
    return 'No matching passkey was found. Retry or continue with email or Google.';
  }
  if (name === 'SecurityError') {
    return 'This passkey cannot be used from this site. Check the site origin or use email or Google.';
  }
  return action === 'sign-in'
    ? 'Passkey sign-in could not be completed. Retry or use email or Google.'
    : 'Passkey registration could not be completed. Retry or use email or Google.';
}
