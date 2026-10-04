import Link from 'next/link';
import { CheckoutCancellation } from '@/components/CheckoutCancellation';
import { CheckoutForm } from '@/components/CheckoutForm';
import { DemoCatalogNotice } from '@/components/DemoCatalogNotice';
import { ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { getCheckoutCart } from '@/lib/orders';
import type { GuestCartQuote } from '@/lib/cart';

function CheckoutContent({ quote }: { quote: GuestCartQuote }) {
  if (quote.items.length === 0) {
    return (
      <div className="feedback-card">
        <h2>Your cart is empty</h2>
        <p>Add a published seller listing before starting secure checkout.</p>
        <Link className="button button--primary" href="/search">
          Browse products
        </Link>
      </div>
    );
  }
  if (
    quote.items.some(({ product }) => product.isSyntheticDemo && !product.syntheticCheckoutEnabled)
  ) {
    return (
      <div className="feedback-card" role="alert">
        <h2>Demo catalogue items cannot be purchased</h2>
        <p>Remove synthetic demo items from your cart to continue with seller listings.</p>
        <Link className="button button--secondary" href="/cart">
          Review your cart
        </Link>
      </div>
    );
  }
  if (quote.items.some(({ product }) => product.isOwnListing)) {
    return (
      <div className="feedback-card checkout-blocked" role="alert">
        <h2>You cannot buy your own listing</h2>
        <p>Remove your seller listing from the cart, or sign in with a different buyer account.</p>
        <Link className="button button--secondary" href="/cart">
          Review your cart
        </Link>
      </div>
    );
  }
  return <CheckoutForm quote={quote} />;
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string | string[]; order_id?: string | string[] }>;
}) {
  const params = await searchParams;
  const paymentCanceled = params.payment === 'canceled';
  const cancellationOrderId = typeof params.order_id === 'string' ? params.order_id : null;
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return (
      <section className="cart-page checkout-page" aria-labelledby="checkout-title">
        <DemoCatalogNotice />
        <div className="cart-page__intro checkout-page__intro">
          <p className="eyebrow">Secure test payment</p>
          <h1 id="checkout-title">Checkout</h1>
          <p>Confirm your delivery details and review your order before continuing to payment.</p>
        </div>
        {paymentCanceled && <CheckoutCancellation orderId={cancellationOrderId} />}
        <div className="feedback-card feedback-card--error" role="alert">
          <h2>We could not verify your account</h2>
          <p>Your cart has not been changed. Please try checkout again shortly.</p>
          <Link className="button button--secondary" href="/cart">
            Return to cart
          </Link>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="cart-page checkout-page" aria-labelledby="checkout-title">
        <DemoCatalogNotice />
        <div className="cart-page__intro checkout-page__intro">
          <p className="eyebrow">Secure test payment</p>
          <h1 id="checkout-title">Checkout</h1>
          <p>Confirm your delivery details and review your order before continuing to payment.</p>
        </div>
        {paymentCanceled && <CheckoutCancellation orderId={cancellationOrderId} />}
        <div className="feedback-card">
          <h2>Sign in to continue</h2>
          <p>Your guest cart is saved in this browser. Sign in to continue to secure checkout.</p>
          <Link className="button button--primary" href="/sign-in?next=%2Fcheckout">
            Sign in and continue
          </Link>
          <Link className="text-link" href="/cart">
            Return to cart
          </Link>
        </div>
      </section>
    );
  }

  try {
    const quote = await getCheckoutCart();
    return (
      <section className="cart-page checkout-page" aria-labelledby="checkout-title">
        <DemoCatalogNotice />
        <div className="cart-page__intro checkout-page__intro">
          <p className="eyebrow">Secure test payment</p>
          <h1 id="checkout-title">Checkout</h1>
          <p>Confirm your delivery details and review your order before continuing to payment.</p>
        </div>
        {paymentCanceled && <CheckoutCancellation orderId={cancellationOrderId} />}
        <CheckoutContent quote={quote} />
      </section>
    );
  } catch (error: unknown) {
    const message =
      error instanceof ApiError && error.status === 401
        ? 'Your session has expired. Sign in to continue; your cart is still saved.'
        : 'Checkout could not load your current cart. Your cart has not been changed.';
    return (
      <section className="cart-page checkout-page" aria-labelledby="checkout-title">
        <DemoCatalogNotice />
        <div className="cart-page__intro checkout-page__intro">
          <p className="eyebrow">Secure test payment</p>
          <h1 id="checkout-title">Checkout</h1>
          <p>Confirm your delivery details and review your order before continuing to payment.</p>
        </div>
        <div className="feedback-card feedback-card--error" role="alert">
          <h2>We could not load checkout</h2>
          <p>{message}</p>
          <Link className="button button--secondary" href="/cart">
            Return to cart
          </Link>
        </div>
      </section>
    );
  }
}
