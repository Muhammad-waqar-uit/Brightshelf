import Link from 'next/link';
import type { StoreProduct } from '@/lib/products';

export function ProductCard({ product }: { product: StoreProduct }) {
  const productUrl = `/product/${encodeURIComponent(product.id)}`;

  return (
    <article className="product-card">
      <Link className="product-card__image-link" href={productUrl}>
        {product.thumbnailUrl ? (
          <img className="product-card__image" src={product.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <span className="product-card__image-placeholder" aria-hidden="true">
            Brightshelf
          </span>
        )}
        <span className="sr-only">View {product.title}</span>
      </Link>
      <p className="product-card__category">{product.category}</p>
      <h3>
        <Link href={productUrl}>{product.title}</Link>
      </h3>
      <p className="product-card__price">
        {new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(product.price)}
      </p>
    </article>
  );
}
