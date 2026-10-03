import { GuestCart } from '@/components/GuestCart';

export default function CartPage() {
  return (
    <section className="cart-page" aria-labelledby="cart-title">
      <p className="eyebrow">Your everyday finds</p>
      <h1 id="cart-title">Your cart</h1>
      <GuestCart />
    </section>
  );
}
