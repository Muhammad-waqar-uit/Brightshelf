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
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProductResponse {
  product: StoreProduct;
}

export interface ProductSearchParams {
  q?: string;
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  page?: string;
  limit?: number;
}

export function getProducts(params: ProductSearchParams = {}): Promise<ProductListResponse> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.category) query.set('category', params.category);
  if (params.minPrice) query.set('minPrice', params.minPrice);
  if (params.maxPrice) query.set('maxPrice', params.maxPrice);
  if (params.sort) query.set('sort', params.sort);
  if (params.page) query.set('page', params.page);
  if (params.limit !== undefined) query.set('limit', String(params.limit));

  return apiFetch<ProductListResponse>(`/products?${query.toString()}`);
}

export function getHomeProducts(): Promise<ProductListResponse> {
  return apiFetch<ProductListResponse>('/products?limit=8');
}

export function getProduct(id: string): Promise<ProductResponse> {
  return apiFetch<ProductResponse>(`/products/${encodeURIComponent(id)}`);
}
