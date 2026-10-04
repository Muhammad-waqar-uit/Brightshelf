import { cookies } from 'next/headers';
import { ApiError, apiFetch } from '@/lib/api';

export interface SellerProfile {
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface SellerListing {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  listingStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  thumbnailUrl: string | null;
  images: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SellerSale {
  id: string;
  orderId: string;
  productTitle: string;
  sellerName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

async function sellerApiFetch<T>(path: string, session: string): Promise<T> {
  return apiFetch<T>(path, {
    headers: { cookie: `session=${session}` },
    cache: 'no-store',
  });
}

export async function getSellerDashboard() {
  const session = (await cookies()).get('session')?.value;
  if (!session) {
    throw new ApiError(401);
  }

  let profile: SellerProfile | null;
  try {
    const result = await sellerApiFetch<{ profile: SellerProfile }>('/api/seller/profile', session);
    profile = result.profile;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) {
      return { profile: null, products: [] as SellerListing[] };
    }
    throw error;
  }

  const result = await sellerApiFetch<{ products: SellerListing[] }>(
    '/api/seller/products?limit=50',
    session,
  );
  return { profile, products: result.products };
}

export async function getSellerSales(page = 1) {
  const session = (await cookies()).get('session')?.value;
  if (!session) {
    throw new ApiError(401);
  }
  const result = await sellerApiFetch<{
    sales: SellerSale[];
    page: number;
    limit: number;
    hasMore: boolean;
  }>(`/api/seller/sales?page=${page}&limit=20`, session);
  return result;
}
