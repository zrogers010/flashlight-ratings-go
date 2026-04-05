"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CompareTable } from "./CompareTable";
import { useCompareStore } from "@/lib/compare-store";
import { fetchFlashlightByID, type FlashlightDetail } from "@/lib/api";

type CompareOverlayProps = {
  open: boolean;
  onClose: () => void;
};

function CompareSkeleton({ columnCount }: { columnCount: number }) {
  return (
    <div className="compare-overlay-skeleton" aria-busy="true" aria-label="Loading comparison">
      <div className="compare-controls" style={{ opacity: 0.5 }}>
        <span className="skeleton-line" style={{ width: 160, height: 14 }} />
      </div>
      <div className="table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th className="compare-row-label">
                <span className="skeleton-line" style={{ width: 48, height: 12 }} />
              </th>
              {Array.from({ length: columnCount }, (_, i) => (
                <th key={i} className="compare-model-head">
                  <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div className="skeleton-block" style={{ width: 80, height: 80, borderRadius: "var(--radius-md)" }} />
                    <div className="skeleton-line" style={{ width: 120, height: 16 }} />
                    <div className="skeleton-line" style={{ width: 80, height: 12 }} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, r) => (
              <tr key={r}>
                <td className="compare-row-label">
                  <span className="skeleton-line" style={{ width: "70%", height: 12 }} />
                </td>
                {Array.from({ length: columnCount }, (_, c) => (
                  <td key={c}>
                    <span className="skeleton-line" style={{ width: "60%", height: 12, margin: "0 auto", display: "block" }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CompareOverlay({ open, onClose }: CompareOverlayProps) {
  const items = useCompareStore((s) => s.items);
  const [mounted, setMounted] = useState(false);
  const [details, setDetails] = useState<FlashlightDetail[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemIdsKey = useMemo(() => items.map((i) => i.id).join(","), [items]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open && items.length < 2) {
      onClose();
    }
  }, [open, items.length, onClose]);

  useEffect(() => {
    if (!open) return;
    const rowItems = useCompareStore.getState().items;
    if (rowItems.length < 2) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetails(null);

    Promise.all(rowItems.map((item) => fetchFlashlightByID(String(item.id))))
      .then((results) => {
        if (cancelled) return;
        const byId = new Map(results.map((r) => [r.id, r]));
        const ordered: FlashlightDetail[] = [];
        for (const item of rowItems) {
          const d = byId.get(item.id);
          if (d) ordered.push(d);
        }
        setDetails(ordered);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Failed to load flashlights";
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, itemIdsKey]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!mounted || !open || items.length < 2) {
    return null;
  }

  const columnCount = items.length;

  return createPortal(
    <div
      className="compare-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-overlay-title"
    >
      <header
        className="compare-overlay-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexShrink: 0,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-strong)",
        }}
      >
        <h2 id="compare-overlay-title" style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
          Compare Flashlights
        </h2>
        <button
          type="button"
          className="compare-overlay-close"
          onClick={handleClose}
          aria-label="Close comparison"
          style={{
            all: "unset",
            cursor: "pointer",
            fontSize: "1.5rem",
            lineHeight: 1,
            color: "var(--text-tertiary)",
            padding: "4px 8px",
            borderRadius: "var(--radius-sm)",
          }}
        >
          ×
        </button>
      </header>
      <div className="compare-overlay-body" style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {loading && <CompareSkeleton columnCount={columnCount} />}
        {!loading && error && (
          <p className="muted" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && details && details.length > 0 && <CompareTable items={details} />}
      </div>
    </div>,
    document.body
  );
}

type CompareOverlayTriggerProps = {
  children?: ReactNode;
  className?: string;
};

export function CompareOverlayTrigger({
  children,
  className = "button-link btn-sm",
}: CompareOverlayTriggerProps) {
  const [open, setOpen] = useState(false);
  const items = useCompareStore((s) => s.items);
  const canCompare = items.length >= 2;

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={!canCompare}
        onClick={() => setOpen(true)}
      >
        {children ?? "Compare Now"}
      </button>
      <CompareOverlay open={open} onClose={() => setOpen(false)} />
    </>
  );
}
