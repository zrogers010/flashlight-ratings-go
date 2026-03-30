"use client";

import { useEffect, useState } from "react";
import { useCompareStore } from "@/lib/compare-store";

type Props = {
  id: number;
  brand: string;
  name: string;
  image_url?: string;
};

export function CompareToggle({ id, brand, name, image_url }: Props) {
  const items = useCompareStore((s) => s.items);
  const add = useCompareStore((s) => s.add);
  const remove = useCompareStore((s) => s.remove);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const isActive = items.some((i) => i.id === id);
  const isFull = items.length >= 5 && !isActive;

  return (
    <label
      className={`compare-toggle-inline ${isActive ? "active" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        className="compare-checkbox"
        checked={isActive}
        disabled={isFull}
        onChange={() => {
          if (isActive) {
            remove(id);
          } else if (!isFull) {
            add({ id, brand, name, image_url });
          }
        }}
      />
      <span>{isActive ? "Added" : "Compare"}</span>
    </label>
  );
}
