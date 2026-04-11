"use client";

import { useState } from "react";
import Image from "next/image";

function isBrokenPlaceholder(url: string) {
  return url.includes("._SCLZZZZZZZ_");
}

const OPTIMIZABLE_HOSTS = [
  ".media-amazon.com",
  ".ssl-images-amazon.com",
  ".amazonaws.com",
  ".fenixlighting.com",
  ".streamlight.com",
  ".olightstore.com",
  ".olicdn.com",
  ".skilhunt.com",
  ".nitecore.co.uk",
  ".nitecore.co.nz",
  ".acebeam.com",
  ".bigcommerce.com",
  ".staticdj.com",
  ".shopify.com",
  ".ly200-cdn.com",
];

function isOptimizable(url: string) {
  try {
    const host = new URL(url).hostname;
    return OPTIMIZABLE_HOSTS.some((h) => host.endsWith(h));
  } catch {
    return false;
  }
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

  if (isOptimizable(src)) {
    return (
      <Image
        src={src}
        alt={alt}
        width={400}
        height={400}
        loading={loading ?? "lazy"}
        sizes="(max-width: 600px) 280px, 360px"
        style={{ objectFit: "contain", width: "100%", height: "auto" }}
        onError={() => setFailed(true)}
      />
    );
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
