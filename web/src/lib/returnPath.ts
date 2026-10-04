export function safeReturnPath(value: unknown, fallback = '/'): string {
  if (
    typeof value !== 'string' ||
    value.length > 200 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, 'https://brightshelf.invalid');
    if (parsed.origin !== 'https://brightshelf.invalid') {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
