"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function HeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQ = pathname === "/flashlights" ? searchParams.get("q") || "" : "";
  const [value, setValue] = useState(urlQ);

  useEffect(() => {
    setValue(urlQ);
  }, [urlQ]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = value.trim();
    if (!q) {
      router.push("/flashlights");
      return;
    }
    const params = new URLSearchParams();
    params.set("q", q);
    router.push(`/flashlights?${params.toString()}`);
  }

  return (
    <form className="header-search" role="search" onSubmit={onSubmit}>
      <label htmlFor="site-search" className="sr-only">
        Search flashlights
      </label>
      <input
        id="site-search"
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search flashlights…"
        autoComplete="off"
        enterKeyHint="search"
      />
      <button type="submit" className="header-search-btn" aria-label="Search">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  );
}
