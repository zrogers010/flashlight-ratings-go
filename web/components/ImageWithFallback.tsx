"use client";

import { useState } from "react";

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

  if (!src || failed) {
    return <div className="image-fallback">{alt}</div>;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading ?? "lazy"}
      onError={() => setFailed(true)}
    />
  );
}
