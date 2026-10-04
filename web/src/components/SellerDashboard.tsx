'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  activateSellerAction,
  createSellerListingAction,
  setSellerListingStatusAction,
  updateSellerListingAction,
} from '@/actions/seller';
import type { SellerListing, SellerProfile } from '@/lib/seller';

type Feedback = { kind: 'success' | 'error'; message: string } | null;

function listingInput(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    title: String(data.get('title') ?? ''),
    description: String(data.get('description') ?? ''),
    category: String(data.get('category') ?? ''),
    price: String(data.get('price') ?? ''),
    stock: Number(data.get('stock')),
    thumbnailUrl: String(data.get('thumbnailUrl') ?? ''),
    images: String(data.get('images') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

function ListingFields({ listing }: { listing?: SellerListing }) {
  const prefix = listing?.id ?? 'new';
  return (
    <>
      <label htmlFor={`${prefix}-title`}>Product name</label>
      <input
        id={`${prefix}-title`}
        name="title"
        maxLength={160}
        defaultValue={listing?.title}
        required
      />
      <label htmlFor={`${prefix}-description`}>Description</label>
      <textarea
        id={`${prefix}-description`}
        name="description"
        maxLength={5000}
        rows={4}
        defaultValue={listing?.description}
        required
      />
      <div className="seller-form__row">
        <div>
          <label htmlFor={`${prefix}-category`}>Category</label>
          <input
            id={`${prefix}-category`}
            name="category"
            maxLength={80}
            defaultValue={listing?.category}
            required
          />
        </div>
        <div>
          <label htmlFor={`${prefix}-price`}>Price (USD)</label>
          <input
            id={`${prefix}-price`}
            name="price"
            type="number"
            min="0.01"
            max="999999.99"
            step="0.01"
            defaultValue={listing ? listing.price.toFixed(2) : ''}
            required
          />
        </div>
        <div>
          <label htmlFor={`${prefix}-stock`}>Available stock</label>
          <input
            id={`${prefix}-stock`}
            name="stock"
            type="number"
            min="0"
            max="1000000"
            step="1"
            defaultValue={listing?.stock ?? 1}
            required
          />
        </div>
      </div>
      <div className="seller-form__row">
        <div>
          <label htmlFor={`${prefix}-thumbnailUrl`}>Thumbnail URL (HTTPS)</label>
          <input
            id={`${prefix}-thumbnailUrl`}
            name="thumbnailUrl"
            type="url"
            defaultValue={listing?.thumbnailUrl ?? ''}
            placeholder="https://example.com/image.jpg"
          />
        </div>
      </div>
      <label htmlFor={`${prefix}-images`}>
        Additional images (HTTPS URLs, comma-separated, max 8)
      </label>
      <input
        id={`${prefix}-images`}
        name="images"
        type="text"
        defaultValue={listing?.images?.join(', ') ?? ''}
        placeholder="https://example.com/img1.jpg, https://example.com/img2.jpg"
      />
    </>
  );
}

export function SellerDashboard({
  profile,
  products,
}: {
  profile: SellerProfile | null;
  products: SellerListing[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function handleActivate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);
    const data = new FormData(event.currentTarget);
    const result = await activateSellerAction({
      displayName: String(data.get('displayName') ?? ''),
    });
    setPending(false);
    setFeedback(
      result.ok
        ? { kind: 'success', message: 'Your seller profile is ready.' }
        : { kind: 'error', message: result.message },
    );
    if (result.ok) router.push('/seller');
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);
    const form = event.currentTarget;
    const result = await createSellerListingAction(listingInput(form));
    setPending(false);
    setFeedback(
      result.ok
        ? { kind: 'success', message: 'Draft listing saved.' }
        : { kind: 'error', message: result.message },
    );
    if (result.ok) {
      form.reset();
      router.refresh();
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>, productId: string) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);
    const result = await updateSellerListingAction(productId, listingInput(event.currentTarget));
    setPending(false);
    setFeedback(
      result.ok
        ? { kind: 'success', message: 'Listing changes saved.' }
        : { kind: 'error', message: result.message },
    );
    if (result.ok) router.refresh();
  }

  async function handleStatus(productId: string, action: 'publish' | 'unpublish' | 'archive') {
    setPending(true);
    setFeedback(null);
    const result = await setSellerListingStatusAction(productId, action);
    setPending(false);
    const pastTense = {
      publish: 'published',
      unpublish: 'unpublished',
      archive: 'archived',
    }[action];
    setFeedback(
      result.ok
        ? { kind: 'success', message: `Listing ${pastTense}.` }
        : { kind: 'error', message: result.message },
    );
    if (result.ok) router.refresh();
  }

  if (!profile) {
    return (
      <div className="seller-card">
        <h2>Create your seller profile</h2>
        <p>Choose the public name buyers will see on your published listings.</p>
        <form className="seller-form" onSubmit={handleActivate}>
          <label htmlFor="seller-display-name">Seller display name</label>
          <input id="seller-display-name" name="displayName" maxLength={80} required />
          <button className="button button--primary" type="submit" disabled={pending}>
            {pending ? 'Saving...' : 'Activate seller profile'}
          </button>
        </form>
        {feedback && (
          <p
            className={
              feedback.kind === 'error'
                ? 'seller-feedback seller-feedback--error'
                : 'seller-feedback'
            }
            role={feedback.kind === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="seller-dashboard">
      <section className="seller-card" aria-labelledby="seller-listings-title">
        <div className="seller-dashboard__heading">
          <div>
            <p className="eyebrow">Seller profile</p>
            <h2 id="seller-listings-title">{profile.displayName}</h2>
          </div>
          <span>
            {products.length} {products.length === 1 ? 'listing' : 'listings'}
          </span>
        </div>
        <Link className="text-link seller-dashboard__sales-link" href="/seller/sales">
          View seller sales
        </Link>
        <details className="seller-create">
          <summary className="button button--secondary">Create a listing</summary>
          <form className="seller-form" onSubmit={handleCreate}>
            <ListingFields />
            <button className="button button--primary" type="submit" disabled={pending}>
              {pending ? 'Saving...' : 'Save draft'}
            </button>
          </form>
        </details>
      </section>

      {feedback && (
        <p
          className={
            feedback.kind === 'error' ? 'seller-feedback seller-feedback--error' : 'seller-feedback'
          }
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      )}

      {products.length === 0 ? (
        <div className="feedback-card">
          <h2>No listings yet</h2>
          <p>Create a draft, add inventory, and publish it when it is ready.</p>
        </div>
      ) : (
        <div className="seller-listings">
          {products.map((product) => (
            <article className="seller-listing" key={product.id}>
              <div className="seller-listing__preview">
                {product.thumbnailUrl ? (
                  <img
                    src={product.thumbnailUrl}
                    alt={product.title}
                    className="seller-listing__image"
                    loading="lazy"
                  />
                ) : (
                  <div className="seller-listing__image-placeholder">No image</div>
                )}
              </div>
              <div className="seller-listing__heading">
                <div>
                  <h2>{product.title}</h2>
                  <p>
                    {product.category} | ${product.price.toFixed(2)} | {product.stock} in stock
                  </p>
                </div>
                <span
                  className={`seller-listing__status seller-listing__status--${product.listingStatus.toLowerCase()}`}
                >
                  {product.listingStatus.toLowerCase()}
                </span>
              </div>
              {product.listingStatus !== 'ARCHIVED' && (
                <details className="seller-listing__edit">
                  <summary>Edit listing</summary>
                  <form
                    className="seller-form"
                    onSubmit={(event) => handleUpdate(event, product.id)}
                  >
                    <ListingFields listing={product} />
                    <button className="button button--secondary" type="submit" disabled={pending}>
                      Save changes
                    </button>
                  </form>
                </details>
              )}
              <div className="seller-listing__actions">
                {product.listingStatus === 'DRAFT' && (
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={pending}
                    onClick={() => void handleStatus(product.id, 'publish')}
                  >
                    Publish
                  </button>
                )}
                {product.listingStatus === 'PUBLISHED' && (
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={pending}
                    onClick={() => void handleStatus(product.id, 'unpublish')}
                  >
                    Unpublish
                  </button>
                )}
                {product.listingStatus !== 'ARCHIVED' && (
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={pending}
                    onClick={() => void handleStatus(product.id, 'archive')}
                  >
                    Archive
                  </button>
                )}
                {product.listingStatus === 'PUBLISHED' && (
                  <a className="text-link" href={`/product/${encodeURIComponent(product.id)}`}>
                    View listing
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="seller-page__notice">
        Payments are collected by Brightshelf in test mode only. Seller payouts and fulfillment are
        not provided.
      </p>
    </div>
  );
}
