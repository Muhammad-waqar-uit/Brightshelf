export default function SearchLoading() {
  return (
    <div className="search-page" role="status" aria-busy="true" aria-label="Loading product search">
      <div className="loading-skeleton loading-skeleton--title" />
      <div className="loading-skeleton loading-skeleton--panel" />
      <div className="loading-skeleton loading-skeleton--products" />
    </div>
  );
}
