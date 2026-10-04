import Link from 'next/link';
import { SellerDashboard } from '@/components/SellerDashboard';
import { getCurrentUser } from '@/lib/auth';
import { getSellerDashboard } from '@/lib/seller';
import { ApiError } from '@/lib/api';

export default async function SellerPage() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return (
      <section className="seller-page" aria-labelledby="seller-title">
        <p className="eyebrow">Brightshelf marketplace</p>
        <h1 id="seller-title">Seller dashboard</h1>
        <div className="feedback-card feedback-card--error" role="alert">
          <h2>Seller tools are unavailable</h2>
          <p>We could not verify your account. Please try again shortly.</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="seller-page" aria-labelledby="seller-title">
        <p className="eyebrow">Brightshelf marketplace</p>
        <h1 id="seller-title">Seller dashboard</h1>
        <div className="feedback-card">
          <h2>Sign in to become a seller</h2>
          <p>Use your buyer account to create a seller profile and manage listings.</p>
          <Link className="button button--primary" href="/sign-in?next=%2Fseller">
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  try {
    const dashboard = await getSellerDashboard();
    return (
      <section className="seller-page" aria-labelledby="seller-title">
        <p className="eyebrow">Brightshelf marketplace</p>
        <h1 id="seller-title">Seller dashboard</h1>
        <p className="seller-page__intro">
          Manage your own product listings. Seller profiles are self-serve and do not confirm
          identity, tax status, or payout eligibility.
        </p>
        <SellerDashboard profile={dashboard.profile} products={dashboard.products} />
      </section>
    );
  } catch (error: unknown) {
    const message =
      error instanceof ApiError && error.status === 401
        ? 'Your session expired. Sign in again to manage listings.'
        : 'We could not load seller listings. Your saved listings have not changed.';
    return (
      <section className="seller-page" aria-labelledby="seller-title">
        <p className="eyebrow">Brightshelf marketplace</p>
        <h1 id="seller-title">Seller dashboard</h1>
        <div className="feedback-card feedback-card--error" role="alert">
          <h2>Seller tools are unavailable</h2>
          <p>{message}</p>
        </div>
      </section>
    );
  }
}
