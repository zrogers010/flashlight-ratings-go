"use client";

import { useEffect, useRef } from "react";

type BeamVizProps = {
  lumens?: number;
  candela?: number;
  beamDistanceM?: number;
  beamPattern?: string;
  maxDistance?: number;
  width?: number;
  height?: number;
};

function computeBeamAngle(
  lumens?: number,
  candela?: number,
  beamPattern?: string
): number {
  if (lumens && candela && candela > 0) {
    const halfAngle = Math.acos(1 - lumens / (2 * Math.PI * candela));
    const degrees = (halfAngle * 180) / Math.PI;
    return Math.min(Math.max(degrees * 2, 8), 140);
  }
  switch (beamPattern?.toLowerCase()) {
    case "throw":
      return 15;
    case "flood":
      return 110;
    case "hybrid":
    default:
      return 50;
  }
}

export function BeamViz({
  lumens,
  candela,
  beamDistanceM,
  beamPattern,
  maxDistance = 700,
  width = 180,
  height = 160,
}: BeamVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const beamAngle = computeBeamAngle(lumens, candela, beamPattern);
    const dist = beamDistanceM || 100;
    const normalizedDist = Math.min(dist / maxDistance, 1);
    const intensity = candela
      ? Math.min(candela / 120000, 1)
      : lumens
        ? Math.min(lumens / 5000, 1)
        : 0.5;

    const originX = 10;
    const originY = height / 2;
    const maxReach = (width - 20) * normalizedDist;
    const halfAngleRad = ((beamAngle / 2) * Math.PI) / 180;
    const spread = Math.tan(halfAngleRad) * maxReach;
    const clampedSpread = Math.min(spread, height / 2 - 4);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + maxReach, originY - clampedSpread);
    ctx.lineTo(originX + maxReach, originY + clampedSpread);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(originX, originY, originX + maxReach, originY);
    const alpha = 0.15 + intensity * 0.55;
    gradient.addColorStop(0, `rgba(255, 200, 100, ${Math.min(alpha + 0.2, 0.9)})`);
    gradient.addColorStop(0.3, `rgba(255, 180, 80, ${alpha})`);
    gradient.addColorStop(0.7, `rgba(255, 160, 60, ${alpha * 0.5})`);
    gradient.addColorStop(1, `rgba(255, 140, 40, 0.02)`);
    ctx.fillStyle = gradient;
    ctx.fill();

    const hotspot = ctx.createRadialGradient(
      originX + 6,
      originY,
      0,
      originX + maxReach * 0.3,
      originY,
      maxReach * 0.35
    );
    hotspot.addColorStop(0, `rgba(255, 240, 200, ${intensity * 0.5})`);
    hotspot.addColorStop(1, "rgba(255, 240, 200, 0)");
    ctx.fillStyle = hotspot;
    ctx.fill();

    ctx.restore();

    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fillRect(originX, originY - 1, 3, 2);

    if (beamDistanceM) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.font = "10px var(--font-mono, monospace)";
      ctx.textAlign = "center";
      ctx.fillText(`${beamDistanceM}m`, originX + maxReach, height - 6);
    }
  }, [lumens, candela, beamDistanceM, beamPattern, maxDistance, width, height]);

  if (!lumens && !candela && !beamDistanceM) {
    return (
      <div className="beam-viz-empty" style={{ width, height }}>
        <span className="muted" style={{ fontSize: "0.75rem" }}>No beam data</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="beam-viz-canvas"
      style={{ width, height }}
    />
  );
}
