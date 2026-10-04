'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { loadCart, replaceCart } from '@/actions/cart';
import {
  type GuestCartEntry,
  type GuestCartQuote,
  readGuestCart,
  writeGuestCart,
} from '@/lib/cart';
import { ACCOUNT_CART_SYNC_EVENT, dispatchCartCount } from '@/lib/cartEvents';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function entriesFromQuote(quote: GuestCartQuote): GuestCartEntry[] {
  return quote.items.map(({ product, quantity }) => ({
    productId: product.id,
    quantity,
  }));
}

export function GuestCart() {
  const [entries, setEntries] = useState<GuestCartEntry[]>([]);
  const [quote, setQuote] = useState<GuestCartQuote | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [rejectedIds, setRejectedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setErrorMessage(null);
    setPending(true);
    try {
      const savedItems = readGuestCart();
      const result = await loadCart(savedItems);
      const nextEntries = result.signedIn ? entriesFromQuote(result.quote) : savedItems;
      setEntries(nextEntries);
      setQuote(result.quote);
      setSignedIn(result.signedIn);
      setRejectedIds(result.rejectedProductIds);
      setReady(true);
      dispatchCartCount(result.quote.itemCount);
    } catch {
      setErrorMessage('Your cart could not be refreshed. Please try again.');
      setReady(true);
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    try {
      void refresh();
    } catch {
      setErrorMessage('Saved cart data could not be read. Clear it to start a new cart.');
      setReady(true);
    }
  }, [refresh]);

  useEffect(() => {
    function handleStorageUpdate() {
      void refresh();
    }

    function handleAccountCartSync(event: Event) {
      const detail = (
        event as CustomEvent<{
          quote: GuestCartQuote;
          rejectedProductIds: string[];
        }>
      ).detail;
      setSignedIn(true);
      setQuote(detail.quote);
      setEntries(entriesFromQuote(detail.quote));
      setRejectedIds(detail.rejectedProductIds);
      setErrorMessage(null);
      setReady(true);
      dispatchCartCount(detail.quote.itemCount);
    }

    window.addEventListener('storage', handleStorageUpdate);
    window.addEventListener(ACCOUNT_CART_SYNC_EVENT, handleAccountCartSync);
    return () => {
      window.removeEventListener('storage', handleStorageUpdate);
      window.removeEventListener(ACCOUNT_CART_SYNC_EVENT, handleAccountCartSync);
    };
  }, [refresh]);

  async function updateCart(nextItems: GuestCartEntry[]) {
    setPending(true);
    setErrorMessage(null);
    try {
      const result = await replaceCart(nextItems);
      if (!result.signedIn) {
        writeGuestCart(nextItems);
      } else {
        writeGuestCart([]);
      }
      const nextEntries = result.signedIn ? entriesFromQuote(result.quote) : nextItems;
      setEntries(nextEntries);
      setQuote(result.quote);
      setSignedIn(result.signedIn);
      setRejectedIds(result.rejectedProductIds);
      dispatchCartCount(result.quote.itemCount);
    } catch {
      setErrorMessage(
        'Your cart could not be updated. The saved items were kept; please try again.',
      );
    } finally {
      setPending(false);
    }
  }

  function setItemQuantity(productId: string, quantity: number) {
    if (quantity < 1 || quantity > 99) {
      return;
    }

    void updateCart(
      entries.map((item) => (item.productId === productId ? { ...item, quantity } : item)),
    );
  }

  function removeItem(productId: string) {
    setRejectedIds((current) => current.filter((id) => id !== productId));
    void updateCart(entries.filter((item) => item.productId !== productId));
  }

  function clearCart() {
    void updateCart([]);
  }

  if (!ready) {
    return (
      <div className="feedback-card" role="status">
        <p>Loading your cart...</p>
      </div>
    );
  }

  if (quote === null && errorMessage) {
    return (
      <div className="feedback-card feedback-card--error" role="alert">
        <h2>We could not load your cart</h2>
        <p>{errorMessage} Saved cart entries have not been removed.</p>
        <div className="cart-error__actions">
          <button
            className="button button--secondary"
            type="button"
            disabled={pending}
            onClick={() => void refresh()}
          >
            Try again
          </button>
          <button
            className="text-button"
            type="button"
            disabled={pending}
            onClick={() => {
              writeGuestCart([]);
              setEntries([]);
              setQuote({ items: [], unavailableProductIds: [], itemCount: 0, subtotal: 0 });
              setErrorMessage(null);
              dispatchCartCount(0);
            }}
          >
            Clear saved cart
          </button>
        </div>
        {entries.length > 0 && (
          <ul className="cart-error__saved-items">
            {entries.map((item) => (
              <li key={item.productId}>
                Saved item {item.productId}, quantity {item.quantity}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const unavailableIds = [...new Set([...(quote?.unavailableProductIds ?? []), ...rejectedIds])];
  if (entries.length === 0 && unavailableIds.length === 0) {
    return (
      <div className="feedback-card">
        <h2>Your cart is empty</h2>
        <p>Explore the shelves and add something useful for your day.</p>
        <Link className="button button--primary" href="/search">
          Browse products
        </Link>
      </div>
    );
  }

  const quotedItems = quote?.items ?? [];
  const hasIneligibleItems = quotedItems.some(({ product }) => product.isSyntheticDemo);
  const ownListingIds = quotedItems
    .filter(({ product }) => product.isOwnListing)
    .map(({ product }) => product.id);

  return (
    <div className="cart-layout">
      <section className="cart-items" aria-label="Cart items">
        {errorMessage && (
          <div className="feedback-card feedback-card--error" role="alert">
            <p>{errorMessage}</p>
          </div>
        )}
        {unavailableIds.length > 0 && (
          <div className="feedback-card feedback-card--error" role="alert">
            <p>
              Some items could not be kept in your cart because they are no longer available or
              exceeded cart limits. Remove them to continue.
            </p>
          </div>
        )}
        {quotedItems.map(({ product, quantity, lineTotal }) => (
          <article className="cart-item" key={product.id}>
            {product.thumbnailUrl ? (
              <img className="cart-item__image" src={product.thumbnailUrl} alt="" />
            ) : (
              <div className="cart-item__image cart-item__image--empty" aria-hidden="true">
                {product.sellerName
                  ? 'No image supplied by seller'
                  : product.isSyntheticDemo
                    ? 'Demo item - no image'
                    : 'No image'}
              </div>
            )}
            <div className="cart-item__details">
              <Link
                className="cart-item__title"
                href={`/product/${encodeURIComponent(product.id)}`}
              >
                {product.title}
              </Link>
              <p>{formatCurrency(product.price)} each</p>
              <p className="cart-item__seller">
                {product.isSyntheticDemo
                  ? 'Fictional demo item, not for sale'
                  : `Sold by ${product.sellerName}`}
              </p>
              {product.isOwnListing && (
                <p className="cart-item__own-listing">Your listing - not available for purchase</p>
              )}
              <div className="cart-item__actions">
                <div className="quantity-control" aria-label={`Quantity for ${product.title}`}>
                  <button
                    type="button"
                    aria-label={`Decrease quantity of ${product.title}`}
                    disabled={pending || quantity <= 1}
                    onClick={() => setItemQuantity(product.id, quantity - 1)}
                  >
                    -
                  </button>
                  <span>{quantity}</span>
                  <button
                    type="button"
                    aria-label={`Increase quantity of ${product.title}`}
                    disabled={pending || quantity >= 99}
                    onClick={() => setItemQuantity(product.id, quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <button
                  className="text-button"
                  type="button"
                  disabled={pending}
                  onClick={() => removeItem(product.id)}
                >
                  Remove
                </button>
              </div>
            </div>
            <strong className="cart-item__total">{formatCurrency(lineTotal)}</strong>
          </article>
        ))}
        {unavailableIds.map((productId) => (
          <article className="cart-item cart-item--unavailable" key={productId}>
            <div className="cart-item__details">
              <p>This item could not be retained in your cart.</p>
              <button
                className="text-button"
                type="button"
                disabled={pending}
                onClick={() => removeItem(productId)}
              >
                Remove unavailable item
              </button>
            </div>
          </article>
        ))}
      </section>

      <aside className="cart-summary" aria-labelledby="cart-summary-title">
        <h2 id="cart-summary-title">Order summary</h2>
        <p>
          <span>Items ({quote?.itemCount ?? 0})</span>
          <strong>{quote ? formatCurrency(quote.subtotal) : 'Unavailable'}</strong>
        </p>
        <p className="cart-summary__note">
          {signedIn
            ? 'Your cart is saved to your account.'
            : 'Your guest cart is saved in this browser.'}{' '}
          Prices are checked against the current catalogue. Final prices are recalculated at
          checkout.
        </p>
        {entries.length > 0 && hasIneligibleItems && (
          <p className="cart-summary__notice" role="status">
            Synthetic demo items are examples only and cannot be purchased. Remove them before
            checkout.
          </p>
        )}
        {entries.length > 0 && ownListingIds.length > 0 && (
          <p className="cart-summary__notice" role="status">
            You cannot purchase your own listings. Remove them to continue, or use a different buyer
            account.
          </p>
        )}
        {entries.length > 0 && !hasIneligibleItems && ownListingIds.length === 0 && (
          <Link className="button button--primary cart-summary__checkout" href="/checkout">
            Proceed to secure checkout
          </Link>
        )}
        <button
          className="button button--secondary cart-summary__clear"
          type="button"
          disabled={pending || (entries.length === 0 && unavailableIds.length === 0)}
          onClick={clearCart}
        >
          {pending ? 'Updating cart...' : 'Clear cart'}
        </button>
      </aside>
    </div>
  );
}
