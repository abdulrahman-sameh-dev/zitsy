import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { NavLink } from "@/components/storefront/nav-link";
import { loadCartCount } from "@/lib/cart/read";
import { searchAction } from "@/lib/search/actions";

function CartIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M6 6h15l-1.5 9h-13L4 3H2" />
      <circle cx="9" cy="20" r="1.4" transform="translate(0,-1)" />
      <circle cx="19" cy="20" r="1.4" transform="translate(0,-1)" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export async function Header() {
  const cartCount = await loadCartCount();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-4">
        <Logo href="/" className="shrink-0" />

        <nav className="flex items-center gap-0.5 sm:gap-1" aria-label="Primary">
          <NavLink href="/" exact hideOnMobile>
            Home
          </NavLink>
          <NavLink href="/shop">Shop</NavLink>
        </nav>

        <form
          action={searchAction}
          role="search"
          data-clarity-mask="true"
          className="ml-auto hidden w-full max-w-xs md:block lg:max-w-sm"
        >
          <label htmlFor="site-search" className="sr-only">
            Search products
          </label>
          <div className="flex items-center gap-2 rounded-full border border-line bg-canvas px-3.5 py-2 focus-within:border-brand-500">
            <SearchIcon />
            <input
              id="site-search"
              type="search"
              name="q"
              placeholder="Search products"
              autoComplete="off"
              className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link
            href="/track-order"
            className="hidden rounded-md px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:text-brand-700 lg:inline-flex"
          >
            Track order
          </Link>
          <Link
            href="/search"
            aria-label="Search products"
            className="flex h-10 w-10 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-800 md:hidden"
          >
            <SearchIcon />
          </Link>
          <Link
            href="/cart"
            aria-label={cartCount > 0 ? `Cart, ${cartCount} items` : "Cart, empty"}
            className="relative flex h-10 w-10 items-center justify-center rounded-md text-ink transition-colors hover:bg-brand-50 hover:text-brand-800"
          >
            <CartIcon />
            {cartCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-700 px-1 text-xs font-bold text-white"
              >
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
    </header>
  );
}