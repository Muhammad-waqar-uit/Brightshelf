export default function ProductLoading() {
  return (
    <div
      className="product-detail-page"
      role="status"
      aria-busy="true"
      aria-label="Loading product"
    >
      <div className="loading-skeleton loading-skeleton--title" />
      <div className="loading-skeleton loading-skeleton--product" />
    </div>
  );
}
