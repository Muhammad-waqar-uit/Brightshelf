'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelStripeCheckoutAction } from '@/actions/orders';

type CancellationState =
  | { status: 'loading' }
  | { status: 'canceled' | 'paid' | 'pending' | 'failed' }
  | { status: 'error'; message: string };

export function CheckoutCancellation({ orderId }: { orderId: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<CancellationState>({ status: 'loading' });

  useEffect(() => {
    async function confirmCancellation() {
      const result = await cancelStripeCheckoutAction(orderId);
      setState(result);
      if (result.status === 'canceled' || result.status === 'paid' || result.status === 'failed') {
        router.refresh();
      }
    }
    void confirmCancellation();
  }, [orderId, router]);

  async function retryCancellation() {
    const result = await cancelStripeCheckoutAction(orderId);
    setState(result);
    if (result.status === 'canceled' || result.status === 'paid' || result.status === 'failed') {
      router.refresh();
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="feedback-card" role="status">
        Confirming checkout cancellation and releasing reserved stock...
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="feedback-card feedback-card--error" role="alert">
        <p>{state.message}</p>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void retryCancellation()}
        >
          Retry cancellation check
        </button>
      </div>
    );
  }
  if (state.status === 'canceled') {
    return (
      <div className="feedback-card" role="status">
        Checkout was canceled. Reserved stock has been released and your cart is still saved.
      </div>
    );
  }
  if (state.status === 'paid') {
    return (
      <div className="feedback-card" role="status">
        Stripe confirmed payment before cancellation. Check your order history for the saved status.
      </div>
    );
  }
  if (state.status === 'pending') {
    return (
      <div className="feedback-card" role="status">
        Stripe is still confirming this order. Your reservation remains active; refresh your order
        page in a moment.
      </div>
    );
  }
  if (state.status === 'failed') {
    return (
      <div className="feedback-card" role="status">
        Checkout ended without payment. Your cart is still saved.
      </div>
    );
  }
  return null;
}
