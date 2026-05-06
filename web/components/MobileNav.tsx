"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const panel = (
    <>
      {open && <div className="mobile-backdrop" onClick={close} />}
      <nav className={`mobile-nav ${open ? "open" : ""}`} aria-label="Mobile navigation">
        <Link href="/flashlights" onClick={close}>Flashlights</Link>
        <Link href="/reviews" onClick={close}>Reviews</Link>
        <Link href="/brands" onClick={close}>Brands</Link>
        <Link href="/compare" onClick={close}>Compare</Link>
        <Link href="/find-yours" onClick={close}>Find Yours</Link>
        <Link href="/guides" onClick={close}>Guides</Link>
        <hr />
        <Link href="/best-flashlights/edc" onClick={close} className="mobile-sub">Everyday Carry</Link>
        <Link href="/best-flashlights/tactical" onClick={close} className="mobile-sub">Tactical</Link>
        <Link href="/best-flashlights/camping" onClick={close} className="mobile-sub">Camping &amp; Outdoors</Link>
        <Link href="/best-flashlights/survival" onClick={close} className="mobile-sub">Survival</Link>
        <Link href="/best-flashlights/diving" onClick={close} className="mobile-sub">Diving &amp; Maritime</Link>
        <Link href="/best-flashlights/search-rescue" onClick={close} className="mobile-sub">Search &amp; Rescue</Link>
        <Link href="/best-flashlights/value" onClick={close} className="mobile-sub">Best Value</Link>
      </nav>
    </>
  );

  return (
    <>
      <button
        className="hamburger"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        <span className={`hamburger-bar ${open ? "open" : ""}`} />
      </button>
      {mounted && createPortal(panel, document.body)}
    </>
  );
}
