import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { getSellerSales } from '@/lib/seller';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export default async function SellerSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const params = await searchParams;
  const parsedPage = Number(typeof params.page === 'string' ? params.page : '1');
  const page =
    Number.isInteger(parsedPage) && parsedPage > 0 && parsedPage <= 1000 ? parsedPage : 1;
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return (
      <section className="seller-page" aria-labelledby="seller-sales-title">
        <p className="eyebrow">Brightshelf marketplace</p>
        <h1 id="seller-sales-title">Seller sales</h1>
        <div className="feedback-card feedback-card--error" role="alert">
          <h2>Seller sales are unavailable</h2>
          <p>We could not verify your account. Please try again shortly.</p>
        </div>
      </section>
    );
  }
  if (!user) {
    return (
      <section className="seller-page" aria-labelledby="seller-sales-title">
        <p className="eyebrow">Brightshelf marketplace</p>
        <h1 id="seller-sales-title">Seller sales</h1>
        <div className="feedback-card">
          <h2>Sign in to view seller sales</h2>
          <Link className="button button--primary" href="/sign-in?next=%2Fseller%2Fsales">
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  try {
    const result = await getSellerSales(page);
    return (
      <section className="seller-page" aria-labelledby="seller-sales-title">
        <Link className="text-link" href="/seller">
          Back to seller dashboard
        </Link>
        <p className="eyebrow">Brightshelf marketplace</p>
        <h1 id="seller-sales-title">Seller sales</h1>
        <p className="seller-page__intro">
          This view includes only your own line items and payment states. Buyer contact and delivery
          details are not shared here.
        </p>
        {result.sales.length === 0 ? (
          <div className="feedback-card">
            <h2>No sales yet</h2>
            <p>Published listings will appear here after a buyer starts checkout.</p>
          </div>
        ) : (
          <div className="seller-listings">
            {result.sales.map((sale) => (
              <article className="seller-listing" key={sale.id}>
                <div className="seller-listing__heading">
                  <div>
                    <h2>{sale.productTitle}</h2>
                    <p>
                      Order {sale.orderId} - {new Date(sale.createdAt).toLocaleDateString('en-US')}
                    </p>
                  </div>
                  <span className="seller-listing__status">
                    {sellerSaleStatus(sale.paymentStatus, sale.status)}
                  </span>
                </div>
                <p className="seller-sale__amount">
                  {sale.quantity} x {formatCurrency(sale.unitPrice)} ={' '}
                  <strong>{formatCurrency(sale.lineTotal)}</strong>
                </p>
              </article>
            ))}
          </div>
        )}
        {result.page > 1 && (
          <Link className="button button--secondary" href={`/seller/sales?page=${result.page - 1}`}>
            Previous page
          </Link>
        )}
        {result.hasMore && (
          <Link className="button button--secondary" href={`/seller/sales?page=${result.page + 1}`}>
            Next page
          </Link>
        )}
        <p className="seller-page__notice">
          This is a line-item summary only. Seller payouts, fulfillment, and buyer addresses are not
          provided.
        </p>
      </section>
    );
  } catch (error: unknown) {
    const message =
      error instanceof ApiError && error.status === 401
        ? 'Your session expired. Sign in again to view seller sales.'
        : 'Seller sales are temporarily unavailable. Please try again later.';
    return (
      <section className="seller-page" aria-labelledby="seller-sales-title">
        <p className="eyebrow">Brightshelf marketplace</p>
        <h1 id="seller-sales-title">Seller sales</h1>
        <div className="feedback-card feedback-card--error" role="alert">
          <h2>Seller sales could not be loaded</h2>
          <p>{message}</p>
        </div>
      </section>
    );
  }

  function sellerSaleStatus(paymentStatus: string, orderStatus: string): string {
    if (paymentStatus === 'PAID') return 'paid';
    if (paymentStatus === 'PENDING') return 'payment pending';
    if (paymentStatus === 'FAILED') return 'payment failed';
    if (paymentStatus === 'CANCELED') return 'canceled';
    return orderStatus.toLowerCase();
  }
}
