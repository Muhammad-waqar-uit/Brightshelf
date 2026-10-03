'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { quoteGuestCart } from '@/actions/cart';
import { readGuestCart, writeGuestCart } from '@/lib/cart';

export function AddToCart({ productId }: { productId: string }) {
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setAdded(false);

    try {
      const currentItems = readGuestCart();
      const existing = currentItems.find((item) => item.productId === productId);
      if (!existing && currentItems.length >= 50) {
        setMessage('Your cart can contain up to 50 different items.');
        return;
      }

      const nextQuantity = (existing?.quantity ?? 0) + quantity;
      if (nextQuantity > 99) {
        setMessage('You can add up to 99 of this item.');
        return;
      }

      const nextItems = existing
        ? currentItems.map((item) =>
            item.productId === productId ? { ...item, quantity: nextQuantity } : item,
          )
        : [...currentItems, { productId, quantity }];

      const quote = await quoteGuestCart(nextItems);
      if (quote.unavailableProductIds.includes(productId)) {
        setMessage('This product is no longer available to add.');
        return;
      }

      writeGuestCart(nextItems);
      setAdded(true);
      setMessage('Added to your cart.');
    } catch {
      setMessage('We could not update your cart. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="add-to-cart">
      <form className="add-to-cart__form" onSubmit={handleSubmit}>
        <label htmlFor={`quantity-${productId}`}>Quantity</label>
        <input
          id={`quantity-${productId}`}
          type="number"
          min={1}
          max={99}
          step={1}
          value={quantity}
          onChange={(event) => setQuantity(Number(event.currentTarget.value))}
          required
        />
        <button className="button button--primary" type="submit" disabled={pending}>
          {pending ? 'Adding...' : 'Add to cart'}
        </button>
      </form>
      {message && (
        <p
          className={
            added ? 'add-to-cart__message' : 'add-to-cart__message add-to-cart__message--error'
          }
          role="status"
        >
          {message}
        </p>
      )}
      {added && (
        <Link className="text-link" href="/cart">
          View cart
        </Link>
      )}
    </div>
  );
}
