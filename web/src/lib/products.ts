import { apiFetch } from './api';

export interface StoreProduct {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  thumbnailUrl: string | null;
  images: string[];
  brand: string | null;
}

export interface ProductListResponse {
  products: StoreProduct[];
}

export function getHomeProducts(): Promise<ProductListResponse> {
  return apiFetch<ProductListResponse>('/products?limit=8');
}
