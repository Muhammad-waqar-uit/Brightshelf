'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { quoteGuestCart } from '@/actions/cart';
import {
  type GuestCartEntry,
  type GuestCartQuote,
  readGuestCart,
  writeGuestCart,
} from '@/lib/cart';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function GuestCart() {
  const [entries, setEntries] = useState<GuestCartEntry[]>([]);
  const [quote, setQuote] = useState<GuestCartQuote | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async (items: GuestCartEntry[]) => {
    setErrorMessage(null);
    setPending(true);
    try {
      const nextQuote = await quoteGuestCart(items);
      setEntries(items);
      setQuote(nextQuote);
      setReady(true);
    } catch {
      setErrorMessage('Your cart could not be refreshed. Please try again.');
      setReady(true);
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    try {
      const savedItems = readGuestCart();
      setEntries(savedItems);
      if (savedItems.length === 0) {
        setQuote({ items: [], unavailableProductIds: [], itemCount: 0, subtotal: 0 });
        setReady(true);
        return;
      }

      void refresh(savedItems);
    } catch {
      setErrorMessage(
        'Saved cart data could not be read. Remove the invalid saved cart to continue.',
      );
      setReady(true);
    }
  }, [refresh]);

  useEffect(() => {
    function handleStorageUpdate() {
      try {
        void refresh(readGuestCart());
      } catch {
        setErrorMessage(
          'Saved cart data could not be read. Remove the invalid saved cart to continue.',
        );
      }
    }

    window.addEventListener('storage', handleStorageUpdate);
    return () => {
      window.removeEventListener('storage', handleStorageUpdate);
    };
  }, [refresh]);

  async function updateCart(nextItems: GuestCartEntry[]) {
    setPending(true);
    try {
      const nextQuote = await quoteGuestCart(nextItems);
      writeGuestCart(nextItems);
      setEntries(nextItems);
      setQuote(nextQuote);
      setErrorMessage(null);
    } catch {
      setErrorMessage('Your cart could not be updated. Please try again.');
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
    void updateCart(entries.filter((item) => item.productId !== productId));
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
            onClick={() => {
              try {
                void refresh(readGuestCart());
              } catch {
                setErrorMessage('Saved cart data could not be read. Clear it to start a new cart.');
              }
            }}
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

  const quotedItems = quote?.items ?? [];
  const unavailableIds = quote?.unavailableProductIds ?? [];
  if (entries.length === 0) {
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

  return (
    <div className="cart-layout">
      <section className="cart-items" aria-label="Cart items">
        {errorMessage && (
          <div className="feedback-card feedback-card--error" role="alert">
            <p>{errorMessage}</p>
          </div>
        )}
        {quotedItems.map(({ product, quantity, lineTotal }) => (
          <article className="cart-item" key={product.id}>
            {product.thumbnailUrl ? (
              <img className="cart-item__image" src={product.thumbnailUrl} alt="" />
            ) : (
              <div className="cart-item__image cart-item__image--empty" aria-hidden="true">
                Image unavailable
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
              <p>This item is no longer available.</p>
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
          Prices are checked against the current catalogue. Checkout will be available in a later
          step.
        </p>
      </aside>
    </div>
  );
}
