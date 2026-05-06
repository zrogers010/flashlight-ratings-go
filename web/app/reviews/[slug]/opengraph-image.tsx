import { ImageResponse } from "next/og";
import { fetchFlashlightBySlug } from "@/lib/api";

export const runtime = "nodejs";
export const revalidate = 3600;

export const alt = "Flashlight review with score and key specs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function fmt(v?: number) {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString();
}

function topScore(d: {
  tactical_score?: number;
  edc_score?: number;
  value_score?: number;
  throw_score?: number;
  flood_score?: number;
}): number {
  return Math.max(
    d.tactical_score || 0,
    d.edc_score || 0,
    d.value_score || 0,
    d.throw_score || 0,
    d.flood_score || 0,
  );
}

function bestForLabel(d: {
  tactical_score?: number;
  edc_score?: number;
  value_score?: number;
  throw_score?: number;
  flood_score?: number;
}): string {
  const picks = [
    { label: "Tactical", v: d.tactical_score || 0 },
    { label: "EDC", v: d.edc_score || 0 },
    { label: "Value", v: d.value_score || 0 },
    { label: "Throw", v: d.throw_score || 0 },
    { label: "Flood", v: d.flood_score || 0 },
  ];
  picks.sort((a, b) => b.v - a.v);
  return picks[0]?.label || "General Use";
}

export default async function OpengraphImage({
  params,
}: {
  params: { slug: string };
}) {
  let data;
  try {
    data = await fetchFlashlightBySlug(params.slug);
  } catch {
    return fallback();
  }

  const score = topScore(data);
  const best = bestForLabel(data);
  const image = data.image_urls?.[0] || data.image_url;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
          color: "#e6edf3",
          padding: "60px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 36,
            left: 60,
            display: "flex",
            alignItems: "center",
            color: "#7ee787",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          ◉ FLASHLIGHTRATINGS
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            paddingTop: 50,
            paddingRight: image ? 40 : 0,
          }}
        >
          <div
            style={{
              color: "#7ee787",
              fontSize: 24,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 12,
            }}
          >
            {data.brand}
          </div>
          <div
            style={{
              fontSize: 78,
              fontWeight: 800,
              lineHeight: 1.05,
              marginBottom: 30,
              letterSpacing: "-0.02em",
            }}
          >
            {data.name}
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 30, flexWrap: "wrap" }}>
            {data.max_lumens ? (
              <Pill label={`${fmt(data.max_lumens)} lm`} />
            ) : null}
            {data.beam_distance_m ? (
              <Pill label={`${fmt(data.beam_distance_m)}m throw`} />
            ) : null}
            {data.waterproof_rating ? (
              <Pill label={data.waterproof_rating} />
            ) : null}
          </div>

          {score > 0 ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              <div
                style={{
                  fontSize: 84,
                  fontWeight: 900,
                  color: "#7ee787",
                  lineHeight: 1,
                }}
              >
                {score.toFixed(0)}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 20, color: "#8b949e" }}>/100</div>
                <div style={{ fontSize: 22, color: "#e6edf3", marginTop: 4 }}>
                  Best for {best}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {image ? (
          <div
            style={{
              width: 380,
              height: 380,
              alignSelf: "center",
              borderRadius: 24,
              overflow: "hidden",
              background: "#21262d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={image}
              alt=""
              width={380}
              height={380}
              style={{ objectFit: "contain", maxWidth: "100%", maxHeight: "100%" }}
            />
          </div>
        ) : null}
      </div>
    ),
    { ...size },
  );
}

function Pill({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "#21262d",
        border: "1px solid #30363d",
        borderRadius: 999,
        padding: "10px 22px",
        fontSize: 24,
        fontWeight: 600,
        color: "#e6edf3",
      }}
    >
      {label}
    </div>
  );
}

function fallback() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0d1117",
          color: "#e6edf3",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ color: "#7ee787", fontSize: 28, marginBottom: 20 }}>
          ◉ FLASHLIGHTRATINGS
        </div>
        <div style={{ fontSize: 64, fontWeight: 800 }}>
          Flashlight Review
        </div>
      </div>
    ),
    { ...size },
  );
}
