"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

type Props = {
  event: string;
  params?: Record<string, string | number | boolean | undefined>;
  // Dedupe key — re-fires the event only when this changes. Useful on
  // server-rendered pages where the component remounts per navigation.
  dedupeKey?: string;
};

// Fires a single GA event on mount. Drop it into a server-rendered page to
// record a "view"-style conversion event (finder submission, compare view)
// without converting the whole page to a client component.
export function PageEventTracker({ event, params, dedupeKey }: Props) {
  const lastKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    const key = dedupeKey ?? JSON.stringify(params ?? {});
    if (lastKey.current === key) return;
    lastKey.current = key;
    trackEvent(event, params);
  }, [event, params, dedupeKey]);

  return null;
}
