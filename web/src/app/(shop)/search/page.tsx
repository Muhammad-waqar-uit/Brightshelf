import Link from 'next/link';
import type { ReactNode } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { ApiError } from '@/lib/api';
import { getProducts, type ProductSearchParams, type ProductListResponse } from '@/lib/products';

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pageHref(params: ProductSearchParams, page: number) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.category) query.set('category', params.category);
  if (params.minPrice) query.set('minPrice', params.minPrice);
  if (params.maxPrice) query.set('maxPrice', params.maxPrice);
  if (params.sort) query.set('sort', params.sort);
  if (page > 1) query.set('page', String(page));

  return `/search?${query.toString()}`;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const rawParams = await searchParams;
  const repeatedParameter = Object.values(rawParams).some(Array.isArray);
  const getValue = (key: string) =>
    typeof rawParams[key] === 'string' ? rawParams[key] : undefined;
  const params: ProductSearchParams = {
    q: getValue('q'),
    category: getValue('category'),
    minPrice: getValue('minPrice'),
    maxPrice: getValue('maxPrice'),
    sort: getValue('sort'),
    page: getValue('page'),
  };
  let result: ProductListResponse | null = null;
  let errorMessage: string | null = null;

  if (repeatedParameter) {
    errorMessage =
      'A search parameter was provided more than once. Remove the duplicate and retry.';
  } else {
    try {
      result = await getProducts(params);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 400) {
        errorMessage = 'Some search filters are invalid. Check the price range and sort order.';
      } else if (error instanceof ApiError) {
        errorMessage = `The catalogue service returned an error (${error.status}).`;
      } else {
        errorMessage = 'The catalogue service could not be reached.';
      }
    }
  }

  const currentPage = result?.pagination.page ?? 1;
  const totalPages = result?.pagination.totalPages ?? 0;
  const hasFilters = Boolean(params.q || params.category || params.minPrice || params.maxPrice);
  let heading = 'Browse products';
  if (params.category) {
    heading = `Products in ${params.category}`;
  } else if (params.q) {
    heading = `Results for "${params.q}"`;
  }
  let resultContent: ReactNode;

  if (errorMessage) {
    resultContent = (
      <div className="feedback-card feedback-card--error" role="alert">
        <h3>We could not load these products</h3>
        <p>{errorMessage}</p>
        <Link className="button button--secondary" href="/search">
          Clear filters and retry
        </Link>
      </div>
    );
  } else if (result && result.products.length > 0) {
    resultContent = (
      <>
        <div className="product-grid">
          {result.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        {totalPages > 1 && (
          <nav className="pagination" aria-label="Product result pages">
            {currentPage > 1 ? (
              <Link className="button button--secondary" href={pageHref(params, currentPage - 1)}>
                Previous page
              </Link>
            ) : (
              <span />
            )}
            <span>
              Page {currentPage} of {totalPages}
            </span>
            {currentPage < totalPages ? (
              <Link className="button button--secondary" href={pageHref(params, currentPage + 1)}>
                Next page
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </>
    );
  } else {
    resultContent = (
      <div className="feedback-card" role="status">
        <h3>
          {hasFilters ? 'No products match these filters' : 'The catalogue is being prepared'}
        </h3>
        <p>
          {hasFilters
            ? 'Try a broader search or remove one or more filters.'
            : 'Products will appear here once the catalogue is populated.'}
        </p>
        {hasFilters && (
          <Link className="text-link" href="/search">
            Clear filters
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="search-page">
      <header className="search-page__heading">
        <p className="eyebrow">Explore Brightshelf</p>
        <h1>{heading}</h1>
      </header>

      <form className="search-filters" action="/search" method="get">
        <div className="search-filters__field search-filters__field--wide">
          <label htmlFor="product-query">Search products</label>
          <input
            id="product-query"
            name="q"
            type="search"
            maxLength={100}
            defaultValue={params.q}
            placeholder="Try a product name or brand"
          />
        </div>
        <div className="search-filters__field">
          <label htmlFor="product-category">Category</label>
          <input
            id="product-category"
            name="category"
            type="text"
            maxLength={80}
            defaultValue={params.category}
            placeholder="Enter a category"
          />
        </div>
        <div className="search-filters__field">
          <label htmlFor="minimum-price">Minimum price</label>
          <input
            id="minimum-price"
            name="minPrice"
            type="number"
            min="0"
            max="99999999.99"
            step="0.01"
            defaultValue={params.minPrice}
          />
        </div>
        <div className="search-filters__field">
          <label htmlFor="maximum-price">Maximum price</label>
          <input
            id="maximum-price"
            name="maxPrice"
            type="number"
            min="0"
            max="99999999.99"
            step="0.01"
            defaultValue={params.maxPrice}
          />
        </div>
        <div className="search-filters__field">
          <label htmlFor="product-sort">Sort by</label>
          <select id="product-sort" name="sort" defaultValue={params.sort ?? 'newest'}>
            <option value="newest">Newest</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </div>
        <div className="search-filters__actions">
          <button className="button button--primary" type="submit">
            Apply filters
          </button>
          <Link className="text-link" href="/search">
            Clear filters
          </Link>
        </div>
      </form>

      <section className="search-results" aria-labelledby="results-title">
        <div className="search-results__heading">
          <h2 id="results-title">Products</h2>
          {result && (
            <p>
              {result.pagination.total} {result.pagination.total === 1 ? 'result' : 'results'}
            </p>
          )}
        </div>

        {resultContent}
      </section>
    </div>
  );
}
