import { GuestCart } from '@/components/GuestCart';
import { DemoCatalogNotice } from '@/components/DemoCatalogNotice';

export default function CartPage() {
  return (
    <section className="cart-page" aria-labelledby="cart-title">
      <DemoCatalogNotice />
      <div className="cart-page__intro">
        <p className="eyebrow">Your everyday finds</p>
        <h1 id="cart-title">Your cart</h1>
        <p>Review your items, update quantities, and continue when you are ready.</p>
      </div>
      <GuestCart />
    </section>
  );
}
