import { describe, expect, it } from 'vitest';
import { createDemoProducts, demoProductSource } from './demoCatalog';

describe('synthetic demo catalogue', () => {
  it('creates 300 uniquely keyed fictional products without external images', () => {
    const products = createDemoProducts();

    expect(products).toHaveLength(300);
    expect(new Set(products.map((product) => product.sourceId)).size).toBe(300);
    expect(products.every((product) => product.source === demoProductSource)).toBe(true);
    expect(
      products.every((product) => product.thumbnailUrl === null && product.images.length === 0),
    ).toBe(true);
    expect(
      products.every(
        (product) =>
          product.description.includes('Fictional Brightshelf demonstration') &&
          product.description.includes('not available for purchase'),
      ),
    ).toBe(true);
    expect(new Set(products.map((product) => product.category)).size).toBe(10);
  });

  it('is deterministic and keeps every illustrative price positive and finite', () => {
    const firstRun = createDemoProducts();
    const secondRun = createDemoProducts();

    expect(firstRun).toEqual(secondRun);
    expect(firstRun.every((product) => Number.isFinite(product.price) && product.price > 0)).toBe(
      true,
    );
  });
});
