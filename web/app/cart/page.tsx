"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useCartStore, type CartItem } from "@/lib/cart-store";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";

const AMAZON_TAG =
  process.env.NEXT_PUBLIC_AMAZON_TAG || "flashlightrat-20";

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function CartItemRow({ item }: { item: CartItem }) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  return (
    <div className="cart-item">
      <div className="cart-item-image">
        <ImageWithFallback
          src={item.image_url}
          alt={`${item.brand} ${item.name}`}
        />
      </div>

      <div className="cart-item-details">
        <Link href={`/flashlights/${item.id}`} className="cart-item-name">
          {item.brand} {item.name}
        </Link>
        {item.price_usd != null && item.price_usd > 0 && (
          <span className="cart-item-price">
            ~${fmt(item.price_usd, 2)}
          </span>
        )}
      </div>

      <div className="cart-item-qty">
        <button
          className="qty-btn"
          onClick={() => updateQuantity(item.id, item.quantity - 1)}
          aria-label="Decrease quantity"
        >
          −
        </button>
        <span className="qty-value">{item.quantity}</span>
        <button
          className="qty-btn"
          onClick={() => updateQuantity(item.id, item.quantity + 1)}
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>

      <div className="cart-item-subtotal">
        {item.price_usd != null && item.price_usd > 0
          ? `~$${fmt(item.price_usd * item.quantity, 2)}`
          : "—"}
      </div>

      <button
        className="cart-item-remove"
        onClick={() => removeItem(item.id)}
        aria-label={`Remove ${item.brand} ${item.name}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default function CartPage() {
  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const totalItems = useCartStore((s) => s.totalItems);
  const [mounted, setMounted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <section className="grid">
        <div className="panel" style={{ textAlign: "center", padding: 60 }}>
          <p className="muted">Loading cart...</p>
        </div>
      </section>
    );
  }

  const estimatedTotal = items.reduce(
    (sum, i) => sum + (i.price_usd ?? 0) * i.quantity,
    0
  );
  const hasEstimate = items.some((i) => i.price_usd != null && i.price_usd > 0);

  if (items.length === 0) {
    return (
      <section className="grid">
        <div className="panel cart-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: 16 }}>
            <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <h1>Your Cart is Empty</h1>
          <p className="muted" style={{ marginBottom: 20 }}>
            Browse our catalog and add flashlights to your cart.
          </p>
          <Link href="/flashlights" className="button-link">
            Browse Flashlights
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="grid">
      <div className="cart-header">
        <h1>Your Cart</h1>
        <span className="muted">{totalItems()} {totalItems() === 1 ? "item" : "items"}</span>
      </div>

      <div className="cart-layout">
        <div className="cart-items">
          {items.map((item) => (
            <CartItemRow key={item.id} item={item} />
          ))}
          <div className="cart-actions-row">
            <button className="btn btn-ghost btn-sm" onClick={clear}>
              Clear Cart
            </button>
            <Link href="/flashlights" className="btn btn-ghost btn-sm">
              Continue Shopping
            </Link>
          </div>
        </div>

        <aside className="cart-summary">
          <h3>Order Summary</h3>

          <div className="cart-summary-lines">
            {items.map((item) => (
              <div key={item.id} className="cart-summary-line">
                <span>
                  {item.brand} {item.name}
                  {item.quantity > 1 && <span className="muted"> ×{item.quantity}</span>}
                </span>
                <span>
                  {item.price_usd != null && item.price_usd > 0
                    ? `~$${fmt(item.price_usd * item.quantity, 2)}`
                    : "—"}
                </span>
              </div>
            ))}
          </div>

          {hasEstimate && (
            <div className="cart-summary-total">
              <span>Estimated Total</span>
              <span>~${fmt(estimatedTotal, 2)}</span>
            </div>
          )}

          <p className="cart-disclaimer">
            Prices shown are estimates. Final pricing, taxes, and availability are determined by Amazon at checkout.
          </p>

          <form
            ref={formRef}
            method="GET"
            action="https://www.amazon.com/gp/aws/cart/add.html"
          >
            <input type="hidden" name="AssociateTag" value={AMAZON_TAG} />
            {items.map((item, idx) => (
              <div key={item.id}>
                <input
                  type="hidden"
                  name={`ASIN.${idx + 1}`}
                  value={item.asin}
                />
                <input
                  type="hidden"
                  name={`Quantity.${idx + 1}`}
                  value={item.quantity}
                />
              </div>
            ))}
            <button
              type="submit"
              className="button-link cart-checkout-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              Checkout on Amazon
            </button>
          </form>

          <p className="cart-amazon-note">
            You will be redirected to Amazon to complete your purchase.
          </p>
        </aside>
      </div>

      <AmazonDisclosure />
    </section>
  );
}
