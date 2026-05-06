import { ImageResponse } from "next/og";
import {
  fetchFlashlightByID,
  fetchFlashlightBySlug,
  type FlashlightDetail,
} from "@/lib/api";

export const runtime = "nodejs";
export const revalidate = 3600;

export const alt = "Side-by-side flashlight comparison";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function fmt(v?: number) {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString();
}

function topScore(d: FlashlightDetail): number {
  return Math.max(
    d.tactical_score || 0,
    d.edc_score || 0,
    d.value_score || 0,
    d.throw_score || 0,
    d.flood_score || 0,
  );
}

function isNumericID(s: string): boolean {
  return /^\d+$/.test(s);
}

async function resolveOne(handle: string): Promise<FlashlightDetail> {
  if (isNumericID(handle)) return fetchFlashlightByID(handle);
  return fetchFlashlightBySlug(handle);
}

// Same param-extraction shape as the page, kept duplicated rather than
// shared because Next 14's image route handler runs in a separate module
// graph; pulling the helper would force an extra import boundary for ~6
// lines of code.
function extractHalves(params: Record<string, string>): { a: string; b: string } | null {
  if (params["a"] && params["b"]) return { a: params["a"], b: params["b"] };
  for (const value of Object.values(params)) {
    if (typeof value === "string" && value.includes("-vs-")) {
      const idx = value.indexOf("-vs-");
      const a = value.slice(0, idx);
      const b = value.slice(idx + "-vs-".length);
      if (a && b) return { a, b };
    }
  }
  return null;
}

export default async function OpengraphImage({
  params,
}: {
  params: Record<string, string>;
}) {
  const halves = extractHalves(params);
  if (!halves) return fallback();

  let a: FlashlightDetail;
  let b: FlashlightDetail;
  try {
    [a, b] = await Promise.all([resolveOne(halves.a), resolveOne(halves.b)]);
  } catch {
    return fallback();
  }

  const scoreA = topScore(a);
  const scoreB = topScore(b);
  const winner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "tie";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
          color: "#e6edf3",
          padding: "50px 60px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            color: "#7ee787",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.08em",
            marginBottom: 30,
          }}
        >
          ◉ FLASHLIGHTRATINGS · HEAD-TO-HEAD
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "stretch", gap: 30 }}>
          <ProductPanel
            data={a}
            score={scoreA}
            isWinner={winner === "A"}
            isTie={winner === "tie"}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 60,
              fontWeight: 900,
              color: "#8b949e",
            }}
          >
            VS
          </div>

          <ProductPanel
            data={b}
            score={scoreB}
            isWinner={winner === "B"}
            isTie={winner === "tie"}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}

function ProductPanel({
  data,
  score,
  isWinner,
  isTie,
}: {
  data: FlashlightDetail;
  score: number;
  isWinner: boolean;
  isTie: boolean;
}) {
  const image = data.image_urls?.[0] || data.image_url;
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "#161b22",
        border: isWinner ? "3px solid #7ee787" : "1px solid #30363d",
        borderRadius: 24,
        padding: 28,
        position: "relative",
      }}
    >
      {isWinner && !isTie ? (
        <div
          style={{
            position: "absolute",
            top: -16,
            background: "#7ee787",
            color: "#0d1117",
            padding: "6px 20px",
            borderRadius: 999,
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: "0.08em",
          }}
        >
          WINNER
        </div>
      ) : null}

      {image ? (
        <div
          style={{
            width: 200,
            height: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <img
            src={image}
            alt=""
            width={200}
            height={200}
            style={{ objectFit: "contain", maxWidth: "100%", maxHeight: "100%" }}
          />
        </div>
      ) : null}

      <div
        style={{
          color: "#7ee787",
          fontSize: 18,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 4,
        }}
      >
        {data.brand}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 800,
          textAlign: "center",
          lineHeight: 1.1,
          marginBottom: 14,
        }}
      >
        {data.name}
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 18,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {data.max_lumens ? (
          <Pill>{`${fmt(data.max_lumens)} lm`}</Pill>
        ) : null}
        {data.beam_distance_m ? (
          <Pill>{`${fmt(data.beam_distance_m)}m`}</Pill>
        ) : null}
      </div>

      {score > 0 ? (
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: isWinner ? "#7ee787" : "#e6edf3",
              lineHeight: 1,
            }}
          >
            {score.toFixed(0)}
          </div>
          <div style={{ fontSize: 18, color: "#8b949e", marginLeft: 4 }}>
            /100
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Pill({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "#21262d",
        border: "1px solid #30363d",
        borderRadius: 999,
        padding: "6px 16px",
        fontSize: 18,
        fontWeight: 600,
        color: "#e6edf3",
      }}
    >
      {children}
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
          Flashlight Comparison
        </div>
      </div>
    ),
    { ...size },
  );
}
