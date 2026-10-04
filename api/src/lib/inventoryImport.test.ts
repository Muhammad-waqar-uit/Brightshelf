import { describe, expect, it } from 'vitest';
import { inventoryImportSchema } from './inventoryImport';

const validInventory = {
  source: 'approved-inventory-feed',
  products: [
    {
      sourceId: 'lamp-001',
      title: 'Desk lamp',
      description: 'A lamp from an approved inventory feed.',
      category: 'Lighting',
      price: 24.5,
      thumbnailUrl: 'https://images.example.test/lamp.jpg',
      images: ['https://images.example.test/lamp.jpg'],
      brand: 'Northlight',
      stock: 12,
    },
  ],
};

describe('inventoryImportSchema', () => {
  it('accepts bounded real-inventory records with HTTPS images and available stock', () => {
    expect(inventoryImportSchema.parse(validInventory)).toMatchObject(validInventory);
  });

  it('rejects the synthetic demo source and duplicate external IDs', () => {
    expect(
      inventoryImportSchema.safeParse({
        ...validInventory,
        source: 'brightshelf-synthetic-demo',
      }).success,
    ).toBe(false);
    expect(
      inventoryImportSchema.safeParse({
        ...validInventory,
        products: [validInventory.products[0], validInventory.products[0]],
      }).success,
    ).toBe(false);
  });

  it.each([
    { price: 24.555 },
    { stock: -1 },
    { thumbnailUrl: 'http://images.example.test/lamp.jpg' },
    { images: ['javascript:alert(1)'] },
    { unexpected: true },
  ])('rejects unsafe or invalid product fields: %o', (overrides) => {
    const product = { ...validInventory.products[0], ...overrides };
    expect(
      inventoryImportSchema.safeParse({
        ...validInventory,
        products: [product],
      }).success,
    ).toBe(false);
  });
});
