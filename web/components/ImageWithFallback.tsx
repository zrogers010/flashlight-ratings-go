"use client";

import { useState } from "react";

function isBrokenPlaceholder(url: string) {
  return url.includes("._SCLZZZZZZZ_");
}

export function ImageWithFallback({
  src,
  alt,
  loading,
}: {
  src?: string;
  alt: string;
  loading?: "eager" | "lazy";
}) {
  const [failed, setFailed] = useState(false);
  const usable = src && !isBrokenPlaceholder(src);

  if (!usable || failed) {
    return <div className="image-fallback">{alt}</div>;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading ?? "lazy"}
      onError={() => setFailed(true)}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth <= 2 || img.naturalHeight <= 2) {
          setFailed(true);
        }
      }}
    />
  );
}
