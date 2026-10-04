export default function CheckoutLoading() {
  return (
    <section className="cart-page checkout-page" aria-label="Loading checkout" aria-busy="true">
      <div className="loading-skeleton loading-skeleton--product" />
    </section>
  );
}
