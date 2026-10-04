'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { updateHeaderAuthState } from '@/app/(auth)/actions';
import { loadCart, mergeGuestCart } from '@/actions/cart';
import { getGuestCartMergeKey, readGuestCart, writeGuestCart } from '@/lib/cart';
import { CART_COUNT_EVENT, dispatchAccountCartSync, dispatchCartCount } from '@/lib/cartEvents';

const initialAuthState = { status: 'loading' } as const;

export default function HeaderAccount() {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const [authState, updateAuthState, pending] = useActionState(
    updateHeaderAuthState,
    initialAuthState,
  );
  const [cartCount, setCartCount] = useState<number | null>(null);
  const [cartSyncError, setCartSyncError] = useState<string | null>(null);
  const [cartSyncAttempt, setCartSyncAttempt] = useState(0);
  const completedSyncRef = useRef<string | null>(null);

  useEffect(() => {
    startTransition(() => {
      const formData = new FormData();
      formData.set('intent', 'load');
      updateAuthState(formData);
    });
    setProfileOpen(false);
  }, [pathname, updateAuthState]);

  useEffect(() => {
    if (authState.status === 'signed-out') {
      setCartSyncError(null);
      const syncKey = `signed-out:${pathname}`;
      if (completedSyncRef.current === syncKey) {
        return;
      }
      completedSyncRef.current = syncKey;
      let cancelled = false;

      async function refreshGuestCart() {
        try {
          const result = await loadCart(readGuestCart());
          if (!cancelled) {
            setCartCount(result.quote.itemCount);
            dispatchCartCount(result.quote.itemCount);
          }
        } catch {
          if (!cancelled) {
            setCartSyncError('Your saved cart count could not be refreshed.');
          }
        }
      }

      void refreshGuestCart();
      return () => {
        cancelled = true;
      };
    }

    if (authState.status !== 'signed-in') {
      return;
    }

    const syncKey = `${authState.email}:${cartSyncAttempt}`;
    if (completedSyncRef.current === syncKey) {
      return;
    }
    completedSyncRef.current = syncKey;
    let cancelled = false;

    async function syncCart() {
      setCartSyncError(null);
      try {
        const guestItems = readGuestCart();
        if (guestItems.length > 0) {
          const idempotencyKey = getGuestCartMergeKey(guestItems);
          const mergeResult = await mergeGuestCart(guestItems, idempotencyKey);
          if (!mergeResult) {
            throw new Error('The account session is not available.');
          }
          writeGuestCart([]);
          if (cancelled) {
            return;
          }
          setCartCount(mergeResult.quote.itemCount);
          dispatchAccountCartSync(mergeResult);
          dispatchCartCount(mergeResult.quote.itemCount);
        } else {
          const result = await loadCart([]);
          if (cancelled) {
            return;
          }
          setCartCount(result.quote.itemCount);
          dispatchCartCount(result.quote.itemCount);
        }
      } catch {
        if (!cancelled) {
          setCartSyncError('Your saved cart could not be synced.');
        }
      }
    }

    void syncCart();
    return () => {
      cancelled = true;
    };
  }, [authState, cartSyncAttempt]);

  useEffect(() => {
    function handleCartCount(event: Event) {
      const detail = (event as CustomEvent<{ itemCount: number }>).detail;
      setCartCount(detail.itemCount);
    }

    window.addEventListener(CART_COUNT_EVENT, handleCartCount);
    return () => window.removeEventListener(CART_COUNT_EVENT, handleCartCount);
  }, []);

  useEffect(() => {
    if (!profileOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !profileRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProfileOpen(false);
        profileButtonRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileOpen]);

  if (authState.status === 'signed-in') {
    return (
      <div className="header-account">
        {cartSyncError && (
          <span className="header-account__error header-account__cart-error" role="alert">
            {cartSyncError}{' '}
            <button
              className="text-button"
              type="button"
              onClick={() => setCartSyncAttempt((attempt) => attempt + 1)}
            >
              Retry
            </button>
          </span>
        )}
        <div className="profile-popover" ref={profileRef}>
          <button
            aria-controls="profile-popover-content"
            aria-expanded={profileOpen}
            aria-haspopup="dialog"
            aria-label={`Profile for ${authState.email}`}
            className="profile-popover__trigger"
            onClick={() => setProfileOpen((open) => !open)}
            ref={profileButtonRef}
            type="button"
          >
            <span aria-hidden="true" className="profile-popover__avatar">
              {authState.email.charAt(0).toUpperCase()}
            </span>
            <span className="profile-popover__trigger-label">Profile</span>
          </button>
          {profileOpen && (
            <section
              aria-label="Profile"
              className="profile-popover__panel"
              id="profile-popover-content"
              role="dialog"
            >
              <p className="profile-popover__eyebrow">Signed in as</p>
              <p className="profile-popover__email">{authState.email}</p>
              <Link className="profile-popover__link" href="/seller">
                Seller dashboard
              </Link>
              <Link className="profile-popover__link" href="/account/security">
                Account security
              </Link>
              {authState.message && (
                <p className="header-account__error" role="alert">
                  {authState.message}
                </p>
              )}
              <form action={updateAuthState} className="profile-popover__signout-form">
                <input name="intent" type="hidden" value="logout" />
                <button className="profile-popover__signout" type="submit" disabled={pending}>
                  {pending ? 'Signing out...' : 'Sign out'}
                </button>
              </form>
              <form action={updateAuthState} className="profile-popover__signout-form">
                <input name="intent" type="hidden" value="logout-everywhere" />
                <button className="profile-popover__signout" type="submit" disabled={pending}>
                  Sign out everywhere
                </button>
              </form>
            </section>
          )}
        </div>
        <Link href="/cart" aria-label={cartCount === null ? 'Cart' : `Cart, ${cartCount} items`}>
          Cart{cartCount !== null && <span className="cart-count-badge">{cartCount}</span>}
        </Link>
      </div>
    );
  }

  if (authState.status === 'error') {
    return (
      <div className="header-account">
        <span className="header-account__error" role="status">
          {authState.message ?? 'Account status unavailable'}
        </span>
        <Link href="/sign-in">Sign in</Link>
        <Link href="/cart" aria-label={cartCount === null ? 'Cart' : `Cart, ${cartCount} items`}>
          Cart{cartCount !== null && <span className="cart-count-badge">{cartCount}</span>}
        </Link>
      </div>
    );
  }

  if (authState.status === 'loading') {
    return (
      <div className="header-account" aria-label="Checking account">
        <span>Account</span>
        <Link href="/cart" aria-label="Cart">
          Cart
        </Link>
      </div>
    );
  }

  return (
    <div className="header-account">
      <Link href="/sign-in">Sign in</Link>
      <Link href="/cart" aria-label={cartCount === null ? 'Cart' : `Cart, ${cartCount} items`}>
        Cart{cartCount !== null && <span className="cart-count-badge">{cartCount}</span>}
      </Link>
    </div>
  );
}
