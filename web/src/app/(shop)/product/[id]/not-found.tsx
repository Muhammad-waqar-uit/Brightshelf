import Link from 'next/link';

export default function ProductNotFound() {
  return (
    <div className="product-detail-page">
      <div className="feedback-card">
        <h1>Product not found</h1>
        <p>This product may have been removed or the link may be incorrect.</p>
        <Link className="button button--primary" href="/search">
          Browse products
        </Link>
      </div>
    </div>
  );
}
