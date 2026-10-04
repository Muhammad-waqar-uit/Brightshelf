import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface ShippingAddressInput {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

function money(decimal: Prisma.Decimal): number {
  return Math.round(decimal.toNumber() * 100) / 100;
}

function serializeOrder(order: {
  id: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: Prisma.Decimal;
  shipping: Prisma.Decimal;
  total: Prisma.Decimal;
  shippingName: string;
  shippingAddressLine1: string;
  shippingAddressLine2: string | null;
  shippingCity: string;
  shippingRegion: string;
  shippingPostalCode: string;
  shippingCountry: string;
  createdAt: Date;
  items: {
    id: string;
    productId: string | null;
    productTitle: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    sellerName?: string | null;
  }[];
}) {
  return {
    id: order.id,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotal: money(order.subtotal),
    shipping: money(order.shipping),
    total: money(order.total),
    shippingAddress: {
      name: order.shippingName,
      line1: order.shippingAddressLine1,
      line2: order.shippingAddressLine2,
      city: order.shippingCity,
      region: order.shippingRegion,
      postalCode: order.shippingPostalCode,
      country: order.shippingCountry,
    },
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productTitle: item.productTitle,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      lineTotal: money(item.lineTotal),
      sellerName: item.sellerName ?? null,
    })),
  };
}

export interface OrderListInput {
  cursor?: string;
  limit: number;
}

export async function listOrders(userId: string, input: OrderListInput) {
  const rows = await prisma.order.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: input.limit + 1,
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      total: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  });
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  return {
    orders: page.map((order) => ({
      id: order.id,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      total: money(order.total),
      createdAt: order.createdAt.toISOString(),
      itemCount: order._count.items,
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function getOrder(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { items: true },
  });
  return order ? serializeOrder(order) : null;
}

export async function listSellerSales(sellerId: string, page: number, limit: number) {
  const rows = await prisma.orderItem.findMany({
    where: { sellerId },
    orderBy: [{ order: { createdAt: 'desc' } }, { id: 'desc' }],
    skip: (page - 1) * limit,
    take: limit + 1,
    select: {
      id: true,
      productTitle: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      sellerName: true,
      order: {
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
        },
      },
    },
  });
  const hasMore = rows.length > limit;
  const sales = (hasMore ? rows.slice(0, limit) : rows).map((item) => ({
    id: item.id,
    orderId: item.order.id,
    productTitle: item.productTitle,
    sellerName: item.sellerName,
    quantity: item.quantity,
    unitPrice: money(item.unitPrice),
    lineTotal: money(item.lineTotal),
    status: item.order.status,
    paymentStatus: item.order.paymentStatus,
    createdAt: item.order.createdAt.toISOString(),
  }));
  return { sales, page, limit, hasMore };
}
