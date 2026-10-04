import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { inventoryImportSchema } from '../src/lib/inventoryImport';

const prisma = new PrismaClient();
const maxImportFileBytes = 10 * 1024 * 1024;

function getImportFilePath(): string {
  const argument = process.argv.find((value) => value.startsWith('--file='));
  const filePath = argument?.slice('--file='.length);
  if (!filePath) {
    throw new Error('Provide --file=<path-to-inventory.json>.');
  }
  if (!process.argv.includes('--confirm-inventory-import')) {
    throw new Error('Pass --confirm-inventory-import to apply this inventory update.');
  }
  return resolve(filePath);
}

async function importInventory(): Promise<void> {
  const filePath = getImportFilePath();
  const file = await readFile(filePath);
  if (file.byteLength > maxImportFileBytes) {
    throw new Error('Inventory import file exceeds the 10 MiB limit.');
  }

  let json: unknown;
  try {
    json = JSON.parse(file.toString('utf8'));
  } catch {
    throw new Error('Inventory import file must contain valid JSON.');
  }
  const inventory = inventoryImportSchema.parse(json);
  const productIds = inventory.products.map(({ sourceId }) => sourceId);

  await prisma.$transaction(
    async (transaction) => {
      const existingProducts = await transaction.product.findMany({
        where: { source: inventory.source, sourceId: { in: productIds } },
        select: { id: true, sellerId: true },
      });
      if (existingProducts.some((product) => product.sellerId !== null)) {
        throw new Error('Inventory source IDs cannot overwrite seller-owned listings.');
      }

      const pendingOrderItems = await transaction.orderItem.findMany({
        where: {
          productId: { in: existingProducts.map(({ id }) => id) },
          order: { status: 'PENDING_PAYMENT', paymentMethod: 'STRIPE' },
        },
        select: { productId: true },
      });
      if (pendingOrderItems.length > 0) {
        throw new Error('Resolve pending checkouts before importing updated inventory stock.');
      }

      for (let offset = 0; offset < inventory.products.length; offset += 25) {
        const batch = inventory.products.slice(offset, offset + 25);
        await Promise.all(
          batch.map(({ sourceId, ...product }) =>
            transaction.product.upsert({
              where: {
                source_sourceId: { source: inventory.source, sourceId },
              },
              create: {
                ...product,
                source: inventory.source,
                sourceId,
                thumbnailUrl: product.thumbnailUrl ?? null,
                images: product.images,
                brand: product.brand ?? null,
                listingStatus: 'PUBLISHED',
                sellerId: null,
              },
              update: {
                ...product,
                thumbnailUrl: product.thumbnailUrl ?? null,
                images: product.images,
                brand: product.brand ?? null,
                listingStatus: 'PUBLISHED',
              },
            }),
          ),
        );
      }
    },
    { timeout: 60_000 },
  );

  console.log(
    `Imported or updated ${inventory.products.length} products from ${inventory.source}.`,
  );
}

importInventory()
  .catch((error: unknown) => {
    console.error('Inventory import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
