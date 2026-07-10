import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BuyOnAmazonButton } from "@/components/BuyOnAmazonButton";
import { ScoreBadge } from "@/components/ScoreBadge";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { AmazonDisclosure } from "@/components/AmazonDisclosure";
import { ArticleStructuredData, BreadcrumbStructuredData } from "@/components/StructuredData";
import { AuthorByline } from "@/components/AuthorByline";
import {
  fetchFlashlightBySlug,
  fetchAllSlugs,
  fetchFlashlights,
  type FlashlightDetail,
  type FlashlightItem,
} from "@/lib/api";
import { getPriceFreshness } from "@/lib/price-freshness";

export const revalidate = 3600;

// Pre-render the entire catalog at build time so /reviews/[slug] is served
// from the static cache for every product. ISR will revalidate each page
// every `revalidate` seconds. fetchAllSlugs hits the API once at build,
// then every page is essentially free for Googlebot to crawl.
export async function generateStaticParams() {
  try {
    const slugs = await fetchAllSlugs();
    return slugs
      .filter((s) => s.slug)
      .map((s) => ({ slug: s.slug }));
  } catch {
    return [];
  }
}

function fmt(v?: number, digits = 0) {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function bestForLabel(data: FlashlightDetail) {
  const picks = [
    { label: "Tactical", value: data.tactical_score || 0 },
    { label: "EDC", value: data.edc_score || 0 },
    { label: "Value", value: data.value_score || 0 },
    { label: "Throw", value: data.throw_score || 0 },
    { label: "Flood", value: data.flood_score || 0 },
  ];
  picks.sort((a, b) => b.value - a.value);
  return picks[0]?.label || "General Use";
}

function topScore(data: FlashlightDetail) {
  return Math.max(
    data.overall_score || 0,
    data.tactical_score || 0,
    data.edc_score || 0,
    data.value_score || 0,
    data.throw_score || 0,
    data.flood_score || 0
  );
}

function generateStrengths(data: FlashlightDetail): string[] {
  const out: string[] = [];
  if ((data.max_candela || 0) >= 80000) out.push(`With ${fmt(data.max_candela)} candela, this is an elite-tier thrower that can illuminate targets at extreme distances — ideal for search-and-rescue or property security.`);
  else if ((data.max_candela || 0) >= 40000) out.push(`${fmt(data.max_candela)} candela of peak intensity delivers strong throw performance, reaching objects ${fmt(data.beam_distance_m)} meters away with a focused hotspot.`);
  if ((data.max_lumens || 0) >= 4000) out.push(`At ${fmt(data.max_lumens)} lumens on turbo, this flashlight produces an enormous amount of light — enough to illuminate an entire backyard or trail with ease.`);
  else if ((data.max_lumens || 0) >= 2000) out.push(`${fmt(data.max_lumens)} lumens provides bright, capable output suitable for most demanding situations, from tactical use to outdoor exploration.`);
  if ((data.runtime_medium_min || 0) >= 600) out.push(`An impressive ${fmt(data.runtime_medium_min)}-minute runtime on medium mode means you can run this light for ${(data.runtime_medium_min! / 60).toFixed(0)}+ hours before needing a recharge — outstanding for extended outings.`);
  else if ((data.runtime_medium_min || 0) >= 240) out.push(`${fmt(data.runtime_medium_min)} minutes of medium-mode runtime (${(data.runtime_medium_min! / 60).toFixed(1)} hours) provides solid endurance for full-evening use.`);
  if (data.usb_c_rechargeable) out.push(`Built-in USB-C charging eliminates the need for a separate charger. Just plug in with a standard cable — the same one you use for your phone.`);
  if (data.waterproof_rating === "IPX8" || data.waterproof_rating === "IP68") out.push(`${data.waterproof_rating} submersion rating means this light can handle being fully submerged in water — a must-have for outdoor, tactical, and maritime applications.`);
  if ((data.value_score || 0) >= 85) out.push(`Our algorithm rates this a ${fmt(data.value_score, 1)}/100 for value — meaning you're getting significantly more performance per dollar than most alternatives in its class.`);
  if (data.has_moonlight_mode) out.push(`The moonlight mode (sub-1 lumen) is perfect for checking maps at night, reading in a tent, or navigating without destroying your dark-adapted vision.`);
  if (data.has_magnetic_tailcap) out.push(`A magnetic tailcap lets you stick this light to any ferrous surface for hands-free illumination — great for working under a car hood or in electrical panels.`);
  if ((data.impact_resistance_m || 0) >= 1.5) out.push(`Impact-tested to ${fmt(data.impact_resistance_m, 1)} meters, this light is built to survive drops and rough handling in the field.`);
  if (data.has_lockout) out.push(`Electronic lockout prevents accidental activation in a bag or pocket — no more dead batteries from phantom drain.`);
  return out.slice(0, 5);
}

function generateWeaknesses(data: FlashlightDetail): string[] {
  const out: string[] = [];
  if ((data.weight_g || 0) > 200) out.push(`At ${fmt(data.weight_g)}g, this is a heavier light — acceptable for duty use or a pack, but too heavy for lightweight EDC pocket carry.`);
  else if ((data.weight_g || 0) > 140) out.push(`${fmt(data.weight_g)}g puts this on the heavier side of pocket lights. Noticeable in a front pocket over extended carry.`);
  if ((data.length_mm || 0) > 170) out.push(`At ${fmt(data.length_mm, 1)}mm long, this won't disappear in a pocket. It's sized more like a small baton than an EDC light.`);
  else if ((data.length_mm || 0) > 140) out.push(`${fmt(data.length_mm, 1)}mm length is manageable but longer than compact EDC lights — may poke out of shallower pockets.`);
  if (!data.has_lockout) out.push(`No electronic lockout feature means you'll need to physically lock out the tail cap (if possible) to prevent accidental activation.`);
  if (!data.has_pocket_clip) out.push(`No pocket clip is included — you'll need a holster or aftermarket clip for secure carry.`);
  if ((data.runtime_high_min || 0) > 0 && (data.runtime_high_min || 0) < 60) out.push(`Only ${fmt(data.runtime_high_min)} minutes on high mode is limited. You'll be stepping down to medium frequently on longer outings.`);
  if (!data.usb_c_rechargeable && !data.battery_rechargeable) out.push(`No built-in charging means you'll need a separate battery charger, adding cost and inconvenience for new users.`);
  if (!data.has_memory_mode) out.push(`No mode memory — the light resets to a default mode on every power cycle instead of remembering your last brightness.`);
  if ((data.max_lumens || 0) < 500) out.push(`${fmt(data.max_lumens)} lumens is modest by modern standards. This light prioritizes other qualities over raw output.`);
  return out.slice(0, 4);
}

function generateUseCaseParagraphs(data: FlashlightDetail): { heading: string; text: string }[] {
  const name = `${data.brand} ${data.name}`;
  const sections: { heading: string; text: string }[] = [];
  const tags = data.use_case_tags || [];
  const bestFor = bestForLabel(data);

  if (tags.includes("tactical") || bestFor === "Tactical") {
    sections.push({
      heading: "Tactical & Law Enforcement",
      text: `The ${name} earns a ${fmt(data.tactical_score, 1)}/100 tactical score. ${(data.max_lumens || 0) >= 1000 ? `Its ${fmt(data.max_lumens)}-lumen output can temporarily disorient a subject and illuminate threats at distance.` : `While not the brightest, it offers reliability and ergonomics suited for duty.`} ${data.has_strobe ? `The strobe mode adds a disorienting tactical option.` : ``} ${data.has_tail_switch ? `A tail switch enables instinctive cigar-grip activation preferred by most tactical users.` : ``}`.trim(),
    });
  }

  if (tags.includes("edc") || bestFor === "EDC") {
    sections.push({
      heading: "Everyday Carry",
      text: `Scoring ${fmt(data.edc_score, 1)}/100 in our EDC category, the ${name} ${(data.weight_g || 0) <= 100 ? `weighs just ${fmt(data.weight_g)}g — barely noticeable in a pocket.` : `weighs ${fmt(data.weight_g)}g, which is reasonable for daily carry.`} ${data.has_pocket_clip ? `The included pocket clip allows deep-carry positioning.` : ``} ${data.has_moonlight_mode ? `A moonlight mode provides just enough light for close-range tasks without disturbing others.` : ``}`.trim(),
    });
  }

  if (tags.includes("camping") || tags.includes("hiking")) {
    sections.push({
      heading: "Camping & Outdoors",
      text: `For camping and trail use, the ${name} offers ${(data.runtime_medium_min || 0) >= 240 ? `impressive ${(data.runtime_medium_min! / 60).toFixed(1)}-hour runtime on medium` : `adequate runtime on medium mode`}. ${data.waterproof_rating ? `Its ${data.waterproof_rating} rating handles rain and splashes with ease.` : ``} ${data.has_magnetic_tailcap ? `The magnetic tailcap converts it into a camp lantern when stuck to a metal surface.` : ``}`.trim(),
    });
  }

  if (tags.includes("throw") || bestFor === "Throw") {
    sections.push({
      heading: "Long-Range & Search",
      text: `With ${fmt(data.max_candela)} candela and a ${fmt(data.beam_distance_m)}m rated throw, the ${name} is built for reaching out into the distance. ${(data.throw_score || 0) >= 80 ? `Our algorithm rates its throw capability at ${fmt(data.throw_score, 1)}/100 — placing it among the best throwers in our database.` : `It scores ${fmt(data.throw_score, 1)}/100 for throw performance.`}`.trim(),
    });
  }

  if (tags.includes("value") || bestFor === "Value") {
    sections.push({
      heading: "Budget & Value",
      text: `At ${data.price_usd ? `$${fmt(data.price_usd, 2)}` : `its price point`}, the ${name} scores ${fmt(data.value_score, 1)}/100 on our value index, meaning you're getting more lumens, throw, and features per dollar than most competitors. ${data.usb_c_rechargeable ? `USB-C charging eliminates the expense of a separate charger.` : ``} ${data.battery_included ? `A battery is included in the box, so there's no additional purchase needed.` : ``}`.trim(),
    });
  }

  if (sections.length === 0) {
    sections.push({
      heading: "General Use",
      text: `The ${name} is a well-rounded flashlight suitable for a variety of situations. With ${fmt(data.max_lumens)} lumens and ${fmt(data.beam_distance_m)}m of throw, it handles everyday tasks, outdoor activities, and emergency preparedness with competence.`,
    });
  }

  return sections;
}

function generateCompetitorContext(data: FlashlightDetail, catalog: FlashlightItem[]): FlashlightItem[] {
  const sameBrand = catalog.filter((x) => x.brand === data.brand && x.id !== data.id);
  const samePrice = catalog
    .filter((x) => x.id !== data.id && x.price_usd && data.price_usd)
    .sort(
      (a, b) =>
        Math.abs((a.price_usd || 0) - (data.price_usd || 0)) -
        Math.abs((b.price_usd || 0) - (data.price_usd || 0))
    );

  const picked = new Map<number, FlashlightItem>();
  for (const item of sameBrand.slice(0, 2)) picked.set(item.id, item);
  for (const item of samePrice) {
    if (picked.size >= 4) break;
    if (!picked.has(item.id)) picked.set(item.id, item);
  }
  return [...picked.values()].slice(0, 4);
}

// reviewDates derives stable publish + modified dates for a review.
//
//   datePublished: pinned to the site/catalog bootstrap date below — a
//                  single stable value for every review. We deliberately
//                  do NOT use product release year here: that's when the
//                  flashlight launched, not when the article was published,
//                  and surfacing it as "Published 2020" in the byline both
//                  misleads readers and triggers Google's stale-content
//                  signals.
//   dateModified:  the most recent Amazon sync timestamp (when prices,
//                  ratings, and stock state were last refreshed), falling
//                  back to the bootstrap date when no sync has run yet.
//
// Both are emitted as ISO-8601 (YYYY-MM-DD), which is what schema.org
// expects and what Google surfaces in "Reviewed [date]" rich results.
//
// The visible byline only shows the "Updated" date — there's no honest
// per-article published date to render, and the freshness signal is what
// matters for SEO.
const REVIEW_BOOTSTRAP_DATE = "2026-01-01";

function reviewDates(data: FlashlightDetail): { publishedAt: string; updatedAt: string } {
  const publishedAt = REVIEW_BOOTSTRAP_DATE;
  const updatedAt = data.amazon_last_synced_at
    ? data.amazon_last_synced_at.split("T")[0]
    : publishedAt;
  return { publishedAt, updatedAt };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const data = await fetchFlashlightBySlug(slug);
    const name = `${data.brand} ${data.name}`;
    const score = topScore(data);
    return {
      title: `${name} Breakdown — ${fmt(data.max_lumens)} Lumens, ${fmt(data.beam_distance_m)}m Throw${score > 0 ? ` (${score.toFixed(0)}/100)` : ""}`,
      description: `In-depth analysis of the ${name}: ${fmt(data.max_lumens)} lumens, ${fmt(data.max_candela)} candela, ${fmt(data.beam_distance_m)}m throw. ${data.battery_types?.join("/") || ""} battery, ${data.waterproof_rating || "N/A"} rated. Score: ${score > 0 ? score.toFixed(1) : "N/A"}/100. See how it compares.`,
      alternates: { canonical: `/reviews/${slug}` },
      openGraph: {
        title: `${name} — In-Depth Breakdown & Analysis`,
        description: `${fmt(data.max_lumens)} lumens · ${fmt(data.beam_distance_m)}m throw · Best for ${bestForLabel(data)} · Score ${score.toFixed(0)}/100`,
        // OG image is rendered by `opengraph-image.tsx` in this route folder
        // (per-product custom image with score, photo, and key specs).
      },
    };
  } catch {
    return notFound();
  }
}

export default async function BreakdownArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let data: FlashlightDetail;
  try {
    data = await fetchFlashlightBySlug(slug);
  } catch {
    return notFound();
  }

  const catalog = await fetchFlashlights({ pageSize: 200 });
  const name = `${data.brand} ${data.name}`;
  const score = topScore(data);
  const bestFor = bestForLabel(data);
  const strengths = generateStrengths(data);
  const weaknesses = generateWeaknesses(data);
  const useCases = generateUseCaseParagraphs(data);
  const competitors = generateCompetitorContext(data, catalog.items);

  const rawImages = data.image_urls?.length
    ? data.image_urls
    : data.image_url
      ? [data.image_url]
      : [];
  const images = [...new Set(rawImages)]
    .filter((u) => !u.includes("._SCLZZZZZZZ_"))
    .slice(0, 3);

  const batteryLabel = data.battery_types?.length
    ? data.battery_types.join(" / ")
    : "Unknown";
  const rechargeLabel = data.recharge_type || (data.usb_c_rechargeable ? "USB-C" : "None");

  const { publishedAt, updatedAt } = reviewDates(data);
  const SITE_URL = process.env.SITE_URL || "https://flashlightratings.com";
  const priceFresh = getPriceFreshness(data.price_last_updated_at);

  return (
    <article className="grid review-article">
      <ArticleStructuredData
        url={`${SITE_URL}/reviews/${slug}`}
        headline={`${name} Breakdown: Performance, Specs & Value Analysis`}
        description={`Data-driven analysis of the ${name} — ${fmt(data.max_lumens)} lumens, ${fmt(data.beam_distance_m)}m throw. Scores, specs, and comparisons.`}
        imageUrls={data.image_urls?.length ? data.image_urls : data.image_url ? [data.image_url] : undefined}
        publishedAt={publishedAt}
        updatedAt={updatedAt}
        reviewedItem={{ name: data.name, brand: data.brand }}
      />
      <BreadcrumbStructuredData
        items={[
          { name: "Reviews", href: "/reviews" },
          { name: `${name} Breakdown` },
        ]}
      />

      <Breadcrumbs
        items={[
          { label: "Reviews", href: "/reviews" },
          { label: `${name}` },
        ]}
      />

      <AuthorByline updatedAt={updatedAt} />

      {/* ── Hero ─────────────────────────────── */}
      <header className="panel hero review-hero">
        <div className="review-hero-content">
          <p className="kicker">
            <Link
              href={`/brands/${data.brand_slug || data.brand.toLowerCase()}`}
              style={{ color: "inherit", textDecoration: "none" }}
            >
              {data.brand}
            </Link>{" "}
            · In-Depth Breakdown
          </p>
          <h1>{name}</h1>
          <p className="review-subtitle">
            {fmt(data.max_lumens)} lumens · {fmt(data.beam_distance_m)}m throw ·{" "}
            {batteryLabel} · {data.waterproof_rating || "N/A"} rated
          </p>
          <div className="review-hero-badges">
            {score > 0 && <ScoreBadge score={score} size="lg" />}
            <div>
              <p className="review-score-label">
                FlashlightRatings Score:{" "}
                <strong>{score > 0 ? score.toFixed(1) : "N/A"}</strong>/100
              </p>
              <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
                Best for {bestFor}
              </p>
            </div>
          </div>
          <div className="review-hero-actions">
            <BuyOnAmazonButton
              amazon_url={data.amazon_url}
              price_usd={data.price_usd}
              size="lg"
              priceUpdatedAt={data.price_last_updated_at}
            />
            <Link
              href={`/flashlights/${data.id}`}
              className="btn btn-ghost btn-sm"
            >
              View Full Specs →
            </Link>
          </div>
        </div>
        {images.length > 0 && (
          <div className="review-hero-image">
            <ImageWithFallback
              src={images[0]}
              alt={`${name} product photo`}
              loading="eager"
            />
          </div>
        )}
      </header>

      {/* ── Disclaimer ───────────────────────── */}
      <aside className="review-disclaimer">
        Analysis based on manufacturer specs, algorithmic scoring, and
        aggregated customer data. Not a hands-on review.
      </aside>

      {/* ── Quick Specs ──────────────────────── */}
      <div className="panel">
        <h2 style={{ marginBottom: 16 }}>At a Glance</h2>
        <div className="review-spec-grid">
          <div className="review-spec-item">
            <span className="review-spec-value">{fmt(data.max_lumens)}</span>
            <span className="review-spec-label">Max Lumens</span>
          </div>
          <div className="review-spec-item">
            <span className="review-spec-value">{fmt(data.max_candela)}</span>
            <span className="review-spec-label">Peak Candela</span>
          </div>
          <div className="review-spec-item">
            <span className="review-spec-value">{fmt(data.beam_distance_m)}m</span>
            <span className="review-spec-label">Throw Distance</span>
          </div>
          <div className="review-spec-item">
            <span className="review-spec-value">{data.waterproof_rating || "—"}</span>
            <span className="review-spec-label">IP Rating</span>
          </div>
          <div className="review-spec-item">
            <span className="review-spec-value">{fmt(data.weight_g)}g</span>
            <span className="review-spec-label">Weight</span>
          </div>
          <div className="review-spec-item">
            <span className="review-spec-value">
              {data.price_usd ? `$${fmt(data.price_usd, 2)}` : "—"}
            </span>
            <span className="review-spec-label">Price</span>
            {priceFresh && (
              <span
                className={`review-spec-freshness review-spec-freshness--${priceFresh.tone}`}
              >
                {priceFresh.tone === "stale"
                  ? priceFresh.label
                  : priceFresh.label.replace(/^Last checked /, "")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Score Breakdown ──────────────────── */}
      <ScoreBreakdown
        scores={{
          overall: data.overall_score,
          tactical: data.tactical_score,
          edc: data.edc_score,
          value: data.value_score,
          throw: data.throw_score,
          flood: data.flood_score,
        }}
        breakdown={data.metric_breakdown}
      />

      {/* ── Strengths & Weaknesses ────────── */}
      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div className="panel">
          <h2 style={{ marginBottom: 16 }}>Strengths & Trade-offs</h2>
          <div className="verdict-grid">
            <div>
              <h3
                style={{
                  color: "var(--score-high)",
                  fontSize: "0.9rem",
                  marginBottom: 10,
                }}
              >
                Strengths
              </h3>
              <ul className="verdict-list pros">
                {strengths.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3
                style={{
                  color: "var(--score-mid)",
                  fontSize: "0.9rem",
                  marginBottom: 10,
                }}
              >
                Trade-offs
              </h3>
              <ul className="verdict-list cons">
                {weaknesses.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Use Case Deep Dive ───────────── */}
      <div className="panel">
        <h2 style={{ marginBottom: 16 }}>Use Case Analysis</h2>
        {useCases.map((section) => (
          <div key={section.heading} className="review-use-case">
            <h3>{section.heading}</h3>
            <p>{section.text}</p>
          </div>
        ))}
      </div>

      {/* ── Hardware & Build ─────────────── */}
      <div className="panel">
        <h2 style={{ marginBottom: 16 }}>Hardware & Build Quality</h2>
        <div className="review-hw-grid">
          <div>
            <h3 style={{ fontSize: "0.9rem", marginBottom: 12 }}>Power System</h3>
            <p>
              The {name} runs on <strong>{batteryLabel}</strong> batteries with{" "}
              <strong>{rechargeLabel}</strong> recharging.
              {data.battery_included
                ? " A battery is included in the box."
                : ""}
              {data.battery_replaceable
                ? " The battery is user-replaceable."
                : ""}
            </p>
          </div>
          <div>
            <h3 style={{ fontSize: "0.9rem", marginBottom: 12 }}>Construction</h3>
            <p>
              {data.body_material
                ? `Built from ${data.body_material.toLowerCase()}, `
                : ""}
              the {data.name} weighs {fmt(data.weight_g)}g and measures{" "}
              {fmt(data.length_mm, 1)}mm in length.
              {data.head_diameter_mm
                ? ` The head diameter is ${fmt(data.head_diameter_mm, 1)}mm.`
                : ""}
              {data.impact_resistance_m
                ? ` Impact resistance is rated at ${fmt(data.impact_resistance_m, 1)} meters.`
                : ""}
            </p>
          </div>
          <div>
            <h3 style={{ fontSize: "0.9rem", marginBottom: 12 }}>Emitter</h3>
            <p>
              {data.led_model
                ? `The ${data.led_model} LED`
                : "The LED emitter"}
              {" "}produces up to {fmt(data.max_lumens)} lumens.
              {data.cri ? ` CRI is rated at ${data.cri}.` : ""}
              {data.beam_pattern
                ? ` The beam pattern is ${data.beam_pattern.toLowerCase()}.`
                : ""}
            </p>
          </div>
        </div>
      </div>

      {/* ── Runtime Analysis ─────────────── */}
      {data.modes && data.modes.length > 0 && (
        <div className="panel">
          <h2 style={{ marginBottom: 8 }}>Runtime & Mode Analysis</h2>
          <p className="muted" style={{ marginBottom: 16, fontSize: "0.88rem" }}>
            The {name} offers {data.modes.length} output modes. Here&apos;s how
            each performs:
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Output</th>
                  <th>Runtime</th>
                  <th>Candela</th>
                  <th>Throw</th>
                </tr>
              </thead>
              <tbody>
                {data.modes.map((mode) => (
                  <tr key={mode.name}>
                    <td style={{ fontWeight: 600 }}>{mode.name}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {fmt(mode.output_lumens)} lm
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {mode.runtime_min
                        ? mode.runtime_min >= 60
                          ? `${(mode.runtime_min / 60).toFixed(1)}h`
                          : `${mode.runtime_min}m`
                        : "—"}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {fmt(mode.candela)}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {fmt(mode.beam_distance_m)}m
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.turbo_stepdown_sec ? (
            <p className="muted" style={{ marginTop: 12, fontSize: "0.85rem" }}>
              Turbo mode steps down after approximately{" "}
              {data.turbo_stepdown_sec >= 60
                ? `${(data.turbo_stepdown_sec / 60).toFixed(1)} minutes`
                : `${data.turbo_stepdown_sec} seconds`}{" "}
              to manage heat and protect the LED.
            </p>
          ) : null}
        </div>
      )}

      {/* ── Amazon Customer Sentiment ────── */}
      {data.amazon_average_rating && data.amazon_rating_count ? (
        <div className="panel">
          <h2 style={{ marginBottom: 8 }}>What Buyers Say</h2>
          <p className="muted" style={{ marginBottom: 16, fontSize: "0.88rem" }}>
            Based on {fmt(data.amazon_rating_count)} Amazon customer ratings.
          </p>
          <div className="review-amazon-box">
            <div className="review-amazon-rating">
              <span className="review-amazon-stars">
                {fmt(data.amazon_average_rating, 1)}
              </span>
              <span className="muted">/ 5.0</span>
            </div>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              {data.amazon_average_rating >= 4.5
                ? `With a ${fmt(data.amazon_average_rating, 1)}/5 average across ${fmt(data.amazon_rating_count)} ratings, buyers overwhelmingly recommend this flashlight.`
                : data.amazon_average_rating >= 4.0
                  ? `A solid ${fmt(data.amazon_average_rating, 1)}/5 average from ${fmt(data.amazon_rating_count)} buyers indicates strong customer satisfaction.`
                  : `${fmt(data.amazon_rating_count)} buyers have rated this flashlight ${fmt(data.amazon_average_rating, 1)}/5 on Amazon.`}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Images ───────────────────────────── */}
      {images.length > 1 && (
        <div className="image-strip">
          {images.slice(1).map((src, idx) => (
            <div key={`${src}-${idx}`} className="image-card">
              <ImageWithFallback
                src={src}
                alt={`${name} — image ${idx + 2}`}
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Bottom Line ──────────────────────── */}
      <div className="panel review-bottom-line">
        <h2>Bottom Line</h2>
        <p>
          The {name} is{" "}
          {score >= 80
            ? "an outstanding flashlight that earns high marks across the board"
            : score >= 65
              ? "a solid performer that delivers good value in its category"
              : "a capable light with specific strengths for the right buyer"}
          . Its best fit is <strong>{bestFor.toLowerCase()}</strong> use, where
          it scores{" "}
          {fmt(
            bestFor === "Tactical"
              ? data.tactical_score
              : bestFor === "EDC"
                ? data.edc_score
                : bestFor === "Value"
                  ? data.value_score
                  : bestFor === "Throw"
                    ? data.throw_score
                    : data.flood_score,
            1
          )}
          /100.
          {data.price_usd
            ? ` At $${fmt(data.price_usd, 2)}, ${(data.value_score || 0) >= 75 ? "it represents strong value for money." : "pricing is in line with competitors in this segment."}`
            : ""}
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 16,
            flexWrap: "wrap",
          }}
        >
          <BuyOnAmazonButton
            amazon_url={data.amazon_url}
            price_usd={data.price_usd}
            size="lg"
            priceUpdatedAt={data.price_last_updated_at}
          />
          <Link
            href={`/flashlights/${data.id}`}
            className="btn btn-ghost"
            style={{ textDecoration: "none" }}
          >
            Full Spec Sheet →
          </Link>
          <Link
            href={`/compare?ids=${data.id}${competitors[0] ? `,${competitors[0].id}` : ""}`}
            className="btn btn-ghost"
            style={{ textDecoration: "none" }}
          >
            Compare Models
          </Link>
        </div>
      </div>

      {/* ── Competitors ──────────────────────── */}
      {competitors.length > 0 && (
        <div className="panel">
          <h2 style={{ marginBottom: 8 }}>Worth Comparing</h2>
          <p className="muted" style={{ marginBottom: 16, fontSize: "0.88rem" }}>
            Similar models by price or brand you should also consider.
          </p>
          <div className="review-competitor-grid">
            {competitors.map((alt) => (
              <Link
                key={alt.id}
                href={`/reviews/${alt.slug}`}
                className="review-competitor-card"
              >
                <div className="review-competitor-name">
                  {alt.brand} {alt.name}
                </div>
                <div className="review-competitor-specs">
                  <span>{fmt(alt.max_lumens)} lm</span>
                  <span>{fmt(alt.beam_distance_m)}m</span>
                  {alt.price_usd ? (
                    <span>${fmt(alt.price_usd, 2)}</span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <AmazonDisclosure />

      {data.amazon_url && (
        <div className="sticky-buy-bar sticky-buy-bar--review" role="region" aria-label="Quick buy">
          <div className="sticky-buy-bar-item">
            <span className="sticky-buy-bar-label">{name}</span>
            <BuyOnAmazonButton
              amazon_url={data.amazon_url}
              price_usd={data.price_usd}
              size="sm"
              priceUpdatedAt={data.price_last_updated_at}
            />
          </div>
        </div>
      )}
    </article>
  );
}
