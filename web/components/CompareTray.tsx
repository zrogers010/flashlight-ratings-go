"use client";

import { useEffect, useState } from "react";
import { useCompareStore } from "@/lib/compare-store";
import { CompareOverlayTrigger } from "./CompareOverlay";

export function CompareTray() {
  const items = useCompareStore((s) => s.items);
  const remove = useCompareStore((s) => s.remove);
  const clear = useCompareStore((s) => s.clear);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || items.length === 0) return null;

  return (
    <div className="compare-tray">
      <div className="compare-tray-inner">
        <div className="compare-tray-items">
          {items.map((item) => (
            <div key={item.id} className="compare-tray-item">
              <div className="compare-tray-thumb">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} />
                ) : (
                  <span className="compare-tray-placeholder" />
                )}
              </div>
              <span className="compare-tray-name">{item.brand} {item.name}</span>
              <button
                className="compare-tray-remove"
                onClick={() => remove(item.id)}
                aria-label={`Remove ${item.name} from comparison`}
              >
                ×
              </button>
            </div>
          ))}
          {items.length < 4 && (
            <span className="compare-tray-hint muted">
              {items.length < 2 ? `Add ${2 - items.length} more to compare` : `${4 - items.length} slots left`}
            </span>
          )}
        </div>
        <div className="compare-tray-actions">
          <button className="btn btn-ghost btn-sm" onClick={clear}>
            Clear
          </button>
          <CompareOverlayTrigger>
            Compare {items.length}
          </CompareOverlayTrigger>
        </div>
      </div>
    </div>
  );
}
