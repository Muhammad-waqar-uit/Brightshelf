import { cookies } from 'next/headers';
import { ApiError, apiFetch } from '@/lib/api';
import type { GuestCartQuote } from '@/lib/cart';

export interface OrderItem {
  id: string;
  productId: string | null;
  productTitle: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface StoreOrder {
  id: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  shipping: number;
  total: number;
  shippingAddress: {
    name: string;
    line1: string;
    line2: string | null;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
  createdAt: string;
  items: OrderItem[];
}

export interface OrderListItem {
  id: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
  itemCount: number;
}

async function sessionCookie(): Promise<string | null> {
  const session = (await cookies()).get('session')?.value;
  return session ? `session=${session}` : null;
}

async function orderApiFetch<T>(path: string, session: string): Promise<T> {
  return apiFetch<T>(path, {
    headers: { cookie: session },
    cache: 'no-store',
  });
}

export async function getCheckoutCart(): Promise<GuestCartQuote> {
  const session = await sessionCookie();
  if (!session) {
    throw new ApiError(401);
  }
  return orderApiFetch<GuestCartQuote>('/api/cart', session);
}

export async function getOrdersPage(cursor?: string) {
  const session = await sessionCookie();
  if (!session) {
    throw new ApiError(401);
  }
  const query = new URLSearchParams({ limit: '20' });
  if (cursor) {
    query.set('cursor', cursor);
  }
  return orderApiFetch<{ orders: OrderListItem[]; nextCursor: string | null }>(
    `/api/orders?${query.toString()}`,
    session,
  );
}

export async function getOrderDetails(orderId: string): Promise<StoreOrder> {
  const session = await sessionCookie();
  if (!session) {
    throw new ApiError(401);
  }
  const result = await orderApiFetch<{ order: StoreOrder }>(
    `/api/orders/${encodeURIComponent(orderId)}`,
    session,
  );
  return result.order;
}
