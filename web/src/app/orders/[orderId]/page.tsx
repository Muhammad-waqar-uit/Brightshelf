import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { getOrderDetails } from '@/lib/orders';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export default async function OrderDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ checkout?: string | string[] }>;
}) {
  const { orderId } = await params;
  const { checkout } = await searchParams;
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return (
      <section className="orders-page" aria-labelledby="order-title">
        <p className="eyebrow">Your account</p>
        <h1 id="order-title">Order details</h1>
        <div className="feedback-card feedback-card--error" role="alert">
          <h2>We could not verify your account</h2>
          <p>Order details are temporarily unavailable. Please try again later.</p>
          <Link className="text-link" href="/orders">
            Back to your orders
          </Link>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="orders-page" aria-labelledby="order-title">
        <p className="eyebrow">Your account</p>
        <h1 id="order-title">Order details</h1>
        <div className="feedback-card">
          <h2>Sign in to view this order</h2>
          <Link
            className="button button--primary"
            href={`/sign-in?next=${encodeURIComponent(`/orders/${orderId}`)}`}
          >
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  try {
    const order = await getOrderDetails(orderId);
    return (
      <section className="orders-page order-detail-page" aria-labelledby="order-title">
        <Link className="text-link" href="/orders">
          Back to your orders
        </Link>
        <p className="eyebrow">Order payment</p>
        <h1 id="order-title">Order {order.id}</h1>
        <p className="order-detail__placed">
          Placed {new Date(order.createdAt).toLocaleString('en-US')} - {order.status.toLowerCase()}
        </p>
        {order.paymentStatus === 'PENDING' && (
          <div className="feedback-card" role="status">
            <h2>{checkout === 'success' ? 'Confirming your payment' : 'Payment is pending'}</h2>
            <p>
              Stripe has not confirmed this order yet. This page shows the saved order status, not
              the browser redirect. Refresh this page in a moment to check for confirmation.
            </p>
          </div>
        )}
        {order.paymentStatus === 'PAID' && (
          <div className="feedback-card" role="status">
            <h2>Payment confirmed</h2>
            <p>Your test-mode payment was confirmed by Stripe.</p>
          </div>
        )}
        {(order.paymentStatus === 'CANCELED' || order.paymentStatus === 'FAILED') && (
          <div className="feedback-card" role="status">
            <h2>{order.paymentStatus === 'CANCELED' ? 'Checkout canceled' : 'Payment failed'}</h2>
            <p>Your cart was kept. You can return to it and start a new checkout.</p>
            <Link className="button button--secondary" href="/cart">
              Return to cart
            </Link>
          </div>
        )}
        <div className="order-detail-layout">
          <section className="checkout-card" aria-labelledby="order-items-title">
            <h2 id="order-items-title">Items</h2>
            <ul className="order-items">
              {order.items.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.productTitle}</strong>
                    <span>
                      Quantity {item.quantity} - {formatCurrency(item.unitPrice)} each
                    </span>
                  </div>
                  <strong>{formatCurrency(item.lineTotal)}</strong>
                </li>
              ))}
            </ul>
          </section>
          <aside className="checkout-summary" aria-labelledby="order-summary-title">
            <h2 id="order-summary-title">Order summary</h2>
            <p>
              <span>Subtotal</span>
              <strong>{formatCurrency(order.subtotal)}</strong>
            </p>
            <p>
              <span>Shipping</span>
              <strong>{formatCurrency(order.shipping)}</strong>
            </p>
            <p className="checkout-summary__total">
              <span>Total</span>
              <strong>{formatCurrency(order.total)}</strong>
            </p>
            <p className="cart-summary__note">
              Payment method:{' '}
              {order.paymentMethod === 'STRIPE'
                ? 'Stripe hosted Checkout (test mode)'
                : 'simulated demo order; no payment was collected'}
            </p>
            <h3>Delivery address</h3>
            <address>
              {order.shippingAddress.name}
              <br />
              {order.shippingAddress.line1}
              <br />
              {order.shippingAddress.line2 && (
                <>
                  {order.shippingAddress.line2}
                  <br />
                </>
              )}
              {order.shippingAddress.city}, {order.shippingAddress.region}{' '}
              {order.shippingAddress.postalCode}
              <br />
              {order.shippingAddress.country}
            </address>
          </aside>
        </div>
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return (
      <section className="orders-page" aria-labelledby="order-title">
        <p className="eyebrow">Your account</p>
        <h1 id="order-title">Order details</h1>
        <div className="feedback-card feedback-card--error" role="alert">
          <h2>We could not load this order</h2>
          <p>The order service is unavailable. Please try again later.</p>
          <Link className="text-link" href="/orders">
            Back to your orders
          </Link>
        </div>
      </section>
    );
  }
}
