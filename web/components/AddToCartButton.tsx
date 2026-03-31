"use client";

import { useState, useEffect } from "react";
import { useCartStore, extractAsin } from "@/lib/cart-store";

type Props = {
  id: number;
  brand: string;
  name: string;
  image_url?: string;
  amazon_url?: string;
  price_usd?: number;
  size?: "sm" | "lg";
};

export function AddToCartButton({
  id,
  brand,
  name,
  image_url,
  amazon_url,
  price_usd,
  size = "sm",
}: Props) {
  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);
  const [mounted, setMounted] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => setMounted(true), []);

  const asin = extractAsin(amazon_url);

  if (!asin) {
    if (!amazon_url) return <span className="badge">Unavailable</span>;
    const safeHref =
      amazon_url.startsWith("http://") || amazon_url.startsWith("https://")
        ? amazon_url
        : `https://${amazon_url}`;
    return (
      <a
        className="button-link"
        href={safeHref}
        target="_blank"
        rel="nofollow sponsored noopener noreferrer"
      >
        View on Amazon
      </a>
    );
  }

  const inCart = mounted && items.some((i) => i.id === id);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    addItem({ id, brand, name, image_url, asin: asin!, price_usd });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  }

  return (
    <button
      className={`add-to-cart-btn ${size === "lg" ? "add-to-cart-lg" : ""} ${inCart ? "in-cart" : ""} ${justAdded ? "just-added" : ""}`}
      onClick={handleClick}
      aria-label={inCart ? `${brand} ${name} in cart` : `Add ${brand} ${name} to cart`}
    >
      {inCart ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{justAdded ? "Added!" : "In Cart"}</span>
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <span>Add to Cart</span>
        </>
      )}
    </button>
  );
}
