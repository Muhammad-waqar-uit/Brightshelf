import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { getHomeProducts, type StoreProduct } from '@/lib/products';

function ProductCard({ product }: { product: StoreProduct }) {
  return (
    <article className="product-card">
      <Link
        className="product-card__image-link"
        href={`/product/${encodeURIComponent(product.id)}`}
      >
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
        <Link href={`/product/${encodeURIComponent(product.id)}`}>{product.title}</Link>
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

export default async function HomePage() {
  let products: StoreProduct[] = [];
  let errorMessage: string | null = null;

  try {
    ({ products } = await getHomeProducts());
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      errorMessage = `The catalog service returned an error (${error.status}).`;
    } else {
      errorMessage = 'The catalog service could not be reached.';
    }
  }

  const categories = [...new Set(products.map((product) => product.category))];

  return (
    <div className="store-home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__content">
          <p className="eyebrow">A little more room for good finds</p>
          <h1 id="home-title">Make space for everyday discoveries.</h1>
          <p>Useful things for your home, work, and wherever the day takes you.</p>
          <a className="button button--primary" href="#shop-by-category">
            Explore the shelves
          </a>
        </div>
        <div className="home-hero__art" aria-hidden="true">
          <span className="hero-shape hero-shape--one" />
          <span className="hero-shape hero-shape--two" />
          <span className="hero-shape hero-shape--three" />
        </div>
      </section>

      <section className="store-section" id="shop-by-category" aria-labelledby="category-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Find your next favorite</p>
            <h2 id="category-title">Shop by category</h2>
          </div>
        </div>
        {categories.length > 0 ? (
          <div className="category-grid">
            {categories.map((category) => (
              <Link
                className="category-card"
                href={`/search?category=${encodeURIComponent(category)}`}
                key={category}
              >
                <span>{category}</span>
                <span aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="section-note">Categories will appear here when the catalog is connected.</p>
        )}
      </section>

      <section className="store-section" aria-labelledby="featured-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Picked from the catalog</p>
            <h2 id="featured-title">Featured finds</h2>
          </div>
          <Link className="text-link" href="/search">
            Browse all products
          </Link>
        </div>

        {errorMessage ? (
          <div className="feedback-card feedback-card--error" role="status">
            <h3>Products are temporarily unavailable</h3>
            <p>{errorMessage} Please try again in a moment.</p>
            <a className="button button--secondary" href="/">
              Try again
            </a>
          </div>
        ) : products.length === 0 ? (
          <div className="feedback-card" role="status">
            <h3>The shelves are being set up</h3>
            <p>Products will show here after the catalog is connected.</p>
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
