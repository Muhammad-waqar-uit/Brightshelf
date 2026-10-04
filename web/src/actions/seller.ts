'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';

type SellerActionResult = { ok: true } | { ok: false; message: string };

const profileSchema = z.object({ displayName: z.string().trim().min(1).max(80) }).strict();
const listingSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(5000),
    category: z.string().trim().min(1).max(80),
    price: z.string().regex(/^\d{1,6}(?:\.\d{1,2})?$/),
    stock: z.number().int().min(0).max(1_000_000),
  })
  .strict();

function getApiUrl(): string {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    throw new Error('API_URL is not configured');
  }
  return apiUrl;
}

async function sellerRequest(
  path: string,
  method: 'POST' | 'PATCH',
  input: unknown,
): Promise<SellerActionResult> {
  try {
    const session = (await cookies()).get('session')?.value;
    if (!session) {
      return { ok: false, message: 'Your session has expired. Sign in and try again.' };
    }
    const response = await fetch(new URL(path, getApiUrl()), {
      method,
      headers: { 'Content-Type': 'application/json', cookie: `session=${session}` },
      body: JSON.stringify(input),
      cache: 'no-store',
    });
    if (!response.ok) {
      let message = 'We could not save this seller change. Please review it and try again.';
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        if (body.error?.message) {
          message = body.error.message;
        }
      } catch {
        message = 'The seller service returned an invalid response. Please try again.';
      }
      return { ok: false, message };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'Seller tools are unavailable. Your changes were not saved.',
    };
  }
}

export async function activateSellerAction(input: unknown): Promise<SellerActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Enter a seller name.' };
  }
  return sellerRequest('/api/seller/profile', 'POST', parsed.data);
}

export async function createSellerListingAction(input: unknown): Promise<SellerActionResult> {
  const parsed = listingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the listing details.' };
  }
  return sellerRequest('/api/seller/products', 'POST', {
    title: parsed.data.title,
    description: parsed.data.description,
    category: parsed.data.category,
    priceCents: Math.round(Number(parsed.data.price) * 100),
    stock: parsed.data.stock,
  });
}

export async function updateSellerListingAction(
  productId: string,
  input: unknown,
): Promise<SellerActionResult> {
  const parsed = listingSchema.safeParse(input);
  const id = z.string().min(1).max(128).safeParse(productId);
  if (!id.success || !parsed.success) {
    return {
      ok: false,
      message: parsed.success ? 'Invalid listing ID.' : 'Check the listing details.',
    };
  }
  return sellerRequest(`/api/seller/products/${encodeURIComponent(id.data)}`, 'PATCH', {
    title: parsed.data.title,
    description: parsed.data.description,
    category: parsed.data.category,
    priceCents: Math.round(Number(parsed.data.price) * 100),
    stock: parsed.data.stock,
  });
}

export async function setSellerListingStatusAction(
  productId: string,
  action: 'publish' | 'unpublish' | 'archive',
): Promise<SellerActionResult> {
  const id = z.string().min(1).max(128).safeParse(productId);
  const statusAction = z.enum(['publish', 'unpublish', 'archive']).safeParse(action);
  if (!id.success || !statusAction.success) {
    return { ok: false, message: 'Invalid listing action.' };
  }
  return sellerRequest(
    `/api/seller/products/${encodeURIComponent(id.data)}/${statusAction.data}`,
    'POST',
    {},
  );
}
