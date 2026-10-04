import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './returnPath';

describe('safeReturnPath', () => {
  it('keeps an internal path with its query and fragment', () => {
    expect(safeReturnPath('/checkout?source=cart#delivery')).toBe('/checkout?source=cart#delivery');
  });

  it.each(['https://example.com', '//example.com', '/\\example.com', '', null, 42])(
    'rejects unsafe or invalid destinations: %s',
    (value) => {
      expect(safeReturnPath(value, '/checkout')).toBe('/checkout');
    },
  );
});
