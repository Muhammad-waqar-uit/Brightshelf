'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';

type CheckoutResult =
  { status: 'success'; checkoutUrl: string } | { status: 'error'; message: string };

const checkoutInputSchema = z.object({
  checkoutKey: z.string().uuid(),
  address: z.object({
    name: z.string().trim().min(1).max(120),
    line1: z.string().trim().min(1).max(160),
    line2: z.string().trim().max(160).optional(),
    city: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().min(1).max(24),
    country: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase()),
  }),
});

function getApiUrl(): string {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    throw new Error('API_URL is not configured');
  }
  return apiUrl;
}

function getCheckoutInput(formData: FormData) {
  return checkoutInputSchema.safeParse({
    checkoutKey: formData.get('checkoutKey'),
    address: {
      name: formData.get('name'),
      line1: formData.get('line1'),
      line2: formData.get('line2') || undefined,
      city: formData.get('city'),
      region: formData.get('region'),
      postalCode: formData.get('postalCode'),
      country: formData.get('country'),
    },
  });
}

export async function startStripeCheckoutAction(formData: FormData): Promise<CheckoutResult> {
  const parsed = getCheckoutInput(formData);
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Check your delivery details and try again.',
    };
  }

  const session = (await cookies()).get('session')?.value;
  if (!session) {
    return {
      status: 'error',
      message: 'Your session has expired. Sign in again; your cart is still saved.',
    };
  }

  try {
    const response = await fetch(new URL('/api/checkout/session', getApiUrl()), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `session=${session}`,
      },
      body: JSON.stringify({
        checkoutKey: parsed.data.checkoutKey,
        address: {
          ...parsed.data.address,
          line2: parsed.data.address.line2 ?? '',
        },
      }),
      cache: 'no-store',
    });
    if (response.status === 401) {
      return {
        status: 'error',
        message: 'Your session has expired. Sign in again; your cart is still saved.',
      };
    }
    if (!response.ok) {
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        return {
          status: 'error',
          message:
            body.error?.message ?? 'Secure checkout could not start. Your cart is unchanged.',
        };
      } catch {
        return {
          status: 'error',
          message: 'The checkout service returned an invalid response. Your cart is unchanged.',
        };
      }
    }

    const body = (await response.json()) as { checkoutUrl?: unknown };
    const url = z.string().url().safeParse(body.checkoutUrl);
    if (!url.success) {
      return {
        status: 'error',
        message:
          'The checkout service returned an invalid payment link. Check your orders before retrying.',
      };
    }
    const checkoutUrl = new URL(url.data);
    if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com') {
      return {
        status: 'error',
        message: 'The checkout service returned an untrusted payment link.',
      };
    }
    return { status: 'success', checkoutUrl: checkoutUrl.toString() };
  } catch {
    return {
      status: 'error',
      message:
        'We could not reach the checkout service. Your cart is still saved; try again shortly.',
    };
  }
}

export async function cancelStripeCheckoutAction(
  orderId: unknown,
): Promise<
  { status: 'canceled' | 'paid' | 'pending' | 'failed' } | { status: 'error'; message: string }
> {
  const parsedId = z.string().min(1).max(32).safeParse(orderId);
  if (!parsedId.success) {
    return { status: 'error', message: 'The canceled checkout could not be identified.' };
  }

  try {
    const session = (await cookies()).get('session')?.value;
    if (!session) {
      return {
        status: 'error',
        message: 'Your session expired. Sign in before managing this order.',
      };
    }
    const response = await fetch(
      new URL(`/api/checkout/${encodeURIComponent(parsedId.data)}/cancel`, getApiUrl()),
      {
        method: 'POST',
        headers: { cookie: `session=${session}` },
        cache: 'no-store',
      },
    );
    if (!response.ok) {
      return {
        status: 'error',
        message:
          'Checkout cancellation could not be confirmed. Your reservation remains protected.',
      };
    }
    const result = z
      .object({
        status: z.enum(['canceled', 'paid', 'pending', 'failed']),
      })
      .safeParse(await response.json());
    if (!result.success) {
      return {
        status: 'error',
        message: 'The checkout service returned an invalid cancellation result.',
      };
    }
    return result.data;
  } catch {
    return {
      status: 'error',
      message: 'We could not reach the checkout service. Your stock reservation remains protected.',
    };
  }
}
