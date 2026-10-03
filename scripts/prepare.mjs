if (process.env.NODE_ENV === 'production' || process.env.CI || process.env.VERCEL === '1') {
  console.log('Skipping Husky hook installation in production or CI.');
} else {
  const { default: husky } = await import('husky');
  const error = husky();

  if (error) {
    throw new Error(error);
  }
}
