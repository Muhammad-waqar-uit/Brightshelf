import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__content">
        <Link className="brand-mark brand-mark--footer" href="/">
          bright<span>shelf</span>
        </Link>
        <p>Thoughtful finds for everyday living.</p>
        <nav aria-label="Footer navigation">
          <Link href="/">Home</Link>
          <Link href="/search">Discover</Link>
          <Link href="/cart">Cart</Link>
          <Link href="/sign-in">Account</Link>
        </nav>
        <small>Brightshelf demo store</small>
      </div>
    </footer>
  );
}
