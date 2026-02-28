"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

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

      {open && <div className="mobile-backdrop" onClick={close} />}

      <nav className={`mobile-nav ${open ? "open" : ""}`} aria-label="Mobile navigation">
        <Link href="/best-flashlights" onClick={close}>Best Flashlights</Link>
        <Link href="/rankings" onClick={close}>Rankings</Link>
        <Link href="/find-yours" onClick={close}>Find Yours</Link>
        <Link href="/compare" onClick={close}>Compare</Link>
        <Link href="/guides" onClick={close}>Guides</Link>
        <hr />
        <Link href="/best-flashlights/tactical" onClick={close} className="mobile-sub">Tactical</Link>
        <Link href="/best-flashlights/edc" onClick={close} className="mobile-sub">EDC</Link>
        <Link href="/best-flashlights/camping" onClick={close} className="mobile-sub">Camping</Link>
        <Link href="/best-flashlights/value" onClick={close} className="mobile-sub">Best Value</Link>
      </nav>
    </>
  );
}
