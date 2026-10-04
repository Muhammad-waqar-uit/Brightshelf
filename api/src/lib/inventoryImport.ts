import { z } from 'zod';
import { demoProductSource } from './demoCatalog';

const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:');

const inventoryProductSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(160),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(5000),
    category: z.string().trim().min(1).max(100),
    price: z
      .number()
      .finite()
      .positive()
      .max(999999.99)
      .refine((value) => Number(value.toFixed(2)) === value),
    thumbnailUrl: httpsUrl.nullable().optional(),
    images: z.array(httpsUrl).max(8).default([]),
    brand: z.string().trim().max(100).nullable().optional(),
    stock: z.number().int().min(0).max(1_000_000),
  })
  .strict();

export const inventoryImportSchema = z
  .object({
    source: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((source) => source !== demoProductSource),
    products: z.array(inventoryProductSchema).min(1).max(1000),
  })
  .strict()
  .superRefine((inventory, context) => {
    const sourceIds = inventory.products.map(({ sourceId }) => sourceId);
    if (new Set(sourceIds).size !== sourceIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Inventory sourceId values must be unique within the import file.',
        path: ['products'],
      });
    }
  });

export type InventoryImport = z.infer<typeof inventoryImportSchema>;
