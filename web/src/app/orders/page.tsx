import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { getOrdersPage } from '@/lib/orders';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function paymentLabel(paymentStatus: string, orderStatus: string): string {
  if (paymentStatus === 'PENDING') return 'Payment pending';
  if (paymentStatus === 'PAID') return 'Paid';
  if (paymentStatus === 'CANCELED') return 'Canceled';
  if (paymentStatus === 'FAILED') return 'Payment failed';
  if (orderStatus === 'PLACED') return 'Demo order';
  return orderStatus.toLowerCase();
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return (
      <section className="orders-page" aria-labelledby="orders-title">
        <p className="eyebrow">Your account</p>
        <h1 id="orders-title">Your orders</h1>
        <div className="feedback-card feedback-card--error" role="alert">
          <h2>We could not verify your account</h2>
          <p>Order history is temporarily unavailable. Please try again later.</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="orders-page" aria-labelledby="orders-title">
        <p className="eyebrow">Your account</p>
        <h1 id="orders-title">Your orders</h1>
        <div className="feedback-card">
          <h2>Sign in to view your orders</h2>
          <p>Orders are private to the account that placed them.</p>
          <Link className="button button--primary" href="/sign-in?next=%2Forders">
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  const { cursor } = await searchParams;
  try {
    const result = await getOrdersPage(cursor);
    if (result.orders.length === 0) {
      return (
        <section className="orders-page" aria-labelledby="orders-title">
          <p className="eyebrow">Your account</p>
          <h1 id="orders-title">Your orders</h1>
          <div className="feedback-card">
            <h2>No orders yet</h2>
            <p>Your orders will appear here after checkout.</p>
            <Link className="button button--primary" href="/search">
              Browse products
            </Link>
          </div>
        </section>
      );
    }

    return (
      <section className="orders-page" aria-labelledby="orders-title">
        <p className="eyebrow">Your account</p>
        <h1 id="orders-title">Your orders</h1>
        <div className="orders-list">
          {result.orders.map((order) => (
            <article className="order-list-card" key={order.id}>
              <div>
                <h2>
                  <Link href={`/orders/${encodeURIComponent(order.id)}`}>Order {order.id}</Link>
                </h2>
                <p>{new Date(order.createdAt).toLocaleDateString('en-US')}</p>
              </div>
              <div>
                <span>
                  {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
                </span>
                <strong>{formatCurrency(order.total)}</strong>
              </div>
              <span className="order-status">
                {paymentLabel(order.paymentStatus, order.status)}
              </span>
            </article>
          ))}
        </div>
        {result.nextCursor && (
          <Link
            className="button button--secondary orders-next"
            href={`/orders?cursor=${encodeURIComponent(result.nextCursor)}`}
          >
            Load older orders
          </Link>
        )}
      </section>
    );
  } catch (error: unknown) {
    const message =
      error instanceof ApiError && error.status === 401
        ? 'Your session has expired. Sign in again to view your orders.'
        : 'We could not load your orders. Please try again later.';
    return (
      <section className="orders-page" aria-labelledby="orders-title">
        <p className="eyebrow">Your account</p>
        <h1 id="orders-title">Your orders</h1>
        <div className="feedback-card feedback-card--error" role="alert">
          <h2>Order history is unavailable</h2>
          <p>{message}</p>
        </div>
      </section>
    );
  }
}
