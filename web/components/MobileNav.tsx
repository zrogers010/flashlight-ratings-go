"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        className="hamburger"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
        aria-expanded={open}
      >
        {open ? "✕" : "☰"}
      </button>
      {open && (
        <nav className="nav open">
          <Link href="/best-flashlights">Best Flashlights</Link>
          <Link href="/find-yours">Find Yours</Link>
          <Link href="/compare">Compare</Link>
          <Link href="/rankings">Rankings</Link>
          <Link href="/guides">Guides</Link>
        </nav>
      )}
    </>
  );
}
