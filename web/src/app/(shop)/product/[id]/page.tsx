import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { getProduct, type StoreProduct } from '@/lib/products';
import { AddToCart } from '@/components/AddToCart';
import { DemoCatalogNotice } from '@/components/DemoCatalogNotice';

function ProductDetails({ product }: { product: StoreProduct }) {
  const primaryImage = product.thumbnailUrl ?? product.images[0] ?? null;
  const additionalImages = product.images.filter((image) => image !== primaryImage);

  return (
    <div className="product-detail">
      <div className="product-detail__gallery">
        <div className="product-detail__primary-image">
          {primaryImage ? (
            <img src={primaryImage} alt={product.title} />
          ) : (
            <div
              className="product-detail__image-placeholder"
              role="img"
              aria-label={product.title}
            >
              {product.sellerName
                ? 'No image supplied by seller'
                : 'No image in the demo catalogue'}
            </div>
          )}
        </div>
        {additionalImages.length > 0 && (
          <div className="product-detail__additional-images" aria-label="More product images">
            {additionalImages.map((image, index) => (
              <img
                key={image}
                src={image}
                alt={`${product.title}, image ${index + 2}`}
                loading="lazy"
              />
            ))}
          </div>
        )}
      </div>

      <section className="product-detail__information" aria-labelledby="product-title">
        <Link
          className="product-detail__category"
          href={`/search?category=${encodeURIComponent(product.category)}`}
        >
          {product.category}
        </Link>
        <h1 id="product-title">{product.title}</h1>
        {product.brand && <p className="product-detail__brand">Brand: {product.brand}</p>}
        <p className="product-detail__price">
          {new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(product.price)}
        </p>
        {product.sellerName && (
          <p className="product-detail__seller">Sold by {product.sellerName}</p>
        )}
        {product.sellerName && (
          <p className="product-detail__stock" role="status">
            {product.stock === 0 ? 'Currently out of stock' : `${product.stock} available`}
          </p>
        )}
        <div className="product-detail__description">
          <h2>About this product</h2>
          <p>{product.description}</p>
        </div>
        {product.sellerName ? (
          <AddToCart productId={product.id} stock={product.stock ?? 0} />
        ) : (
          <p className="product-detail__not-for-sale">
            Fictional catalogue example. This item is not for sale.
          </p>
        )}
      </section>
    </div>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { product } = await getProduct(id);
    return (
      <div className="product-detail-page">
        <DemoCatalogNotice />
        <Link className="product-detail__back-link" href="/search">
          Back to products
        </Link>
        <ProductDetails product={product} />
      </div>
    );
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    return (
      <div className="product-detail-page">
        <DemoCatalogNotice />
        <div className="feedback-card feedback-card--error" role="alert">
          <h1>We could not load this product</h1>
          <p>
            {error instanceof ApiError
              ? `The catalogue service returned an error (${error.status}).`
              : 'The catalogue service could not be reached.'}
          </p>
          <Link className="button button--secondary" href="/search">
            Back to products
          </Link>
        </div>
      </div>
    );
  }
}
