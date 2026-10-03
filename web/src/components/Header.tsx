import Link from 'next/link';

const navigation = [
  { href: '/', label: 'Home' },
  { href: '/search', label: 'Discover' },
  { href: '/orders', label: 'Orders' },
];

export default function Header() {
  return (
    <header className="site-header">
      <div className="site-header__main">
        <Link className="brand-mark" href="/" aria-label="Brightshelf home">
          bright<span>shelf</span>
        </Link>

        <form className="site-search" action="/search" role="search">
          <label className="sr-only" htmlFor="site-search-input">
            Search products
          </label>
          <input id="site-search-input" name="q" type="search" placeholder="Search the shelves" />
          <button className="site-search__submit" type="submit">
            Search
          </button>
        </form>

        <div className="site-header__account">
          <Link href="/sign-in">Sign in</Link>
          <Link href="/cart">Cart</Link>
        </div>
      </div>

      <nav className="site-nav" aria-label="Main navigation">
        {navigation.map((item) => (
          <Link href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
        <Link href="/register">Create account</Link>
      </nav>
    </header>
  );
}
