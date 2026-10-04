'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { startStripeCheckoutAction } from '@/actions/orders';
import type { GuestCartQuote } from '@/lib/cart';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function CheckoutForm({ quote }: { quote: GuestCartQuote }) {
  const [checkoutKey, setCheckoutKey] = useState('');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setCheckoutKey(window.crypto.randomUUID());
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);
    try {
      const formData = new FormData(event.currentTarget);
      const result = await startStripeCheckoutAction(formData);
      if (result.status === 'success') {
        window.location.assign(result.checkoutUrl);
        return;
      }
      setErrorMessage(result.message);
    } catch {
      setErrorMessage(
        'We could not reach secure checkout. Your cart has not been cleared; please retry shortly.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="checkout-layout" onSubmit={handleSubmit}>
      <ol className="checkout-steps" aria-label="Checkout progress">
        <li className="checkout-steps__current" aria-current="step">
          <span>1</span> Delivery details
        </li>
        <li>
          <span>2</span> Secure payment
        </li>
      </ol>

      <div className="checkout-fields">
        <section className="checkout-card" aria-labelledby="delivery-title">
          <div className="checkout-card__heading">
            <span className="checkout-card__step">01</span>
            <div>
              <h2 id="delivery-title">Delivery address</h2>
              <p>Where should your order be sent?</p>
            </div>
          </div>
          <div className="checkout-form-grid">
            <div className="checkout-field checkout-field--wide">
              <label htmlFor="checkout-name">Full name</label>
              <input id="checkout-name" name="name" autoComplete="name" maxLength={120} required />
            </div>
            <div className="checkout-field checkout-field--wide">
              <label htmlFor="checkout-line1">Address line 1</label>
              <input
                id="checkout-line1"
                name="line1"
                autoComplete="address-line1"
                maxLength={160}
                required
              />
            </div>
            <div className="checkout-field checkout-field--wide">
              <label htmlFor="checkout-line2">
                Address line 2 <span>(optional)</span>
              </label>
              <input
                id="checkout-line2"
                name="line2"
                autoComplete="address-line2"
                maxLength={160}
              />
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-city">City</label>
              <input
                id="checkout-city"
                name="city"
                autoComplete="address-level2"
                maxLength={100}
                required
              />
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-region">State or region</label>
              <input
                id="checkout-region"
                name="region"
                autoComplete="address-level1"
                maxLength={100}
                required
              />
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-postal">Postal code</label>
              <input
                id="checkout-postal"
                name="postalCode"
                autoComplete="postal-code"
                maxLength={24}
                required
              />
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-country">Country code</label>
              <input
                id="checkout-country"
                name="country"
                autoComplete="country"
                minLength={2}
                maxLength={2}
                defaultValue="US"
                aria-describedby="checkout-country-hint"
                required
              />
              <small id="checkout-country-hint">Enter the 2-letter country code.</small>
            </div>
          </div>
        </section>

        <section className="checkout-card checkout-card--payment" aria-labelledby="payment-title">
          <div className="checkout-card__heading">
            <span className="checkout-card__step">02</span>
            <div>
              <h2 id="payment-title">Secure payment</h2>
              <p>Payment is completed on Stripe.</p>
            </div>
          </div>
          <p className="checkout-payment__description">
            Continue to Stripe&apos;s secure checkout to choose an available payment method. Your
            payment details are entered on Stripe, not stored by Brightshelf.
          </p>
          <p className="checkout-payment__notice">
            Test mode only. Do not enter real payment details. Shipping and tax are not included.
          </p>
        </section>
      </div>

      <aside className="checkout-summary" aria-labelledby="checkout-summary-title">
        <div className="checkout-summary__heading">
          <div>
            <p className="eyebrow">Your purchase</p>
            <h2 id="checkout-summary-title">Order summary</h2>
          </div>
          <span>
            {quote.itemCount} {quote.itemCount === 1 ? 'item' : 'items'}
          </span>
        </div>
        <ul className="checkout-summary__items">
          {quote.items.map(({ product, quantity, lineTotal }) => (
            <li key={product.id}>
              <div className="checkout-summary__product">
                <span>{product.title}</span>
                <small>
                  {quantity} × {formatCurrency(product.price)}
                </small>
                {product.sellerName && <small>Sold by {product.sellerName}</small>}
              </div>
              <strong>{formatCurrency(lineTotal)}</strong>
            </li>
          ))}
        </ul>
        <div className="checkout-summary__totals">
          <p>
            <span>Subtotal</span>
            <strong>{formatCurrency(quote.subtotal)}</strong>
          </p>
          <p>
            <span>Shipping</span>
            <strong>Free</strong>
          </p>
        </div>
        <p className="checkout-summary__total">
          <span>Total</span>
          <strong>{formatCurrency(quote.subtotal)}</strong>
        </p>
        <p className="checkout-summary__reassurance">
          Final prices and stock are confirmed before payment. You will review payment details on
          Stripe.
        </p>
        {errorMessage && (
          <p className="checkout-summary__error" role="alert">
            {errorMessage}
          </p>
        )}
        <input name="checkoutKey" type="hidden" value={checkoutKey} />
        <button
          className="button button--primary checkout-summary__submit"
          type="submit"
          disabled={pending || !checkoutKey}
        >
          {pending ? 'Starting secure checkout...' : 'Continue to secure payment'}
        </button>
        <Link className="checkout-summary__back" href="/cart">
          Return to cart
        </Link>
      </aside>
    </form>
  );
}
