export type SpecFormat = "number" | "boolean" | "string" | "currency" | "score";

export type SpecDef = {
  key: string;
  label: string;
  group: string;
  unit?: string;
  format: SpecFormat;
  higherIsBetter?: boolean;
  digits?: number;
};

export const SPEC_GROUPS = [
  { key: "price", label: "Price & Scores" },
  { key: "output", label: "Output & Beam" },
  { key: "runtime", label: "Runtime" },
  { key: "physical", label: "Physical" },
  { key: "battery", label: "Battery & Charging" },
  { key: "features", label: "Features" },
  { key: "emitter", label: "Emitter & Optics" },
  { key: "scores", label: "Category Scores" },
  { key: "amazon", label: "Amazon" },
];

export const SPEC_DEFS: SpecDef[] = [
  // Price & Scores
  { key: "price_usd", label: "Price", group: "price", format: "currency", higherIsBetter: false, digits: 0 },
  { key: "msrp_usd", label: "MSRP", group: "price", format: "currency", higherIsBetter: false, digits: 0 },

  // Output & Beam
  { key: "max_lumens", label: "Max Lumens", group: "output", unit: "lm", format: "number", higherIsBetter: true },
  { key: "sustained_lumens", label: "Sustained Lumens", group: "output", unit: "lm", format: "number", higherIsBetter: true },
  { key: "max_candela", label: "Peak Candela", group: "output", unit: "cd", format: "number", higherIsBetter: true },
  { key: "beam_distance_m", label: "Beam Distance", group: "output", unit: "m", format: "number", higherIsBetter: true },
  { key: "beam_pattern", label: "Beam Pattern", group: "output", format: "string" },
  { key: "waterproof_rating", label: "IP Rating", group: "output", format: "string" },
  { key: "impact_resistance_m", label: "Impact Resistance", group: "output", unit: "m", format: "number", higherIsBetter: true, digits: 1 },

  // Runtime
  { key: "runtime_high_min", label: "Runtime (High)", group: "runtime", unit: "min", format: "number", higherIsBetter: true },
  { key: "runtime_medium_min", label: "Runtime (Med)", group: "runtime", unit: "min", format: "number", higherIsBetter: true },
  { key: "runtime_low_min", label: "Runtime (Low)", group: "runtime", unit: "min", format: "number", higherIsBetter: true },
  { key: "runtime_turbo_min", label: "Runtime (Turbo)", group: "runtime", unit: "min", format: "number", higherIsBetter: true },
  { key: "runtime_500_min", label: "Runtime (500lm)", group: "runtime", unit: "min", format: "number", higherIsBetter: true },
  { key: "turbo_stepdown_sec", label: "Turbo Stepdown", group: "runtime", unit: "s", format: "number", higherIsBetter: true },

  // Physical
  { key: "weight_g", label: "Weight", group: "physical", unit: "g", format: "number", higherIsBetter: false, digits: 0 },
  { key: "length_mm", label: "Length", group: "physical", unit: "mm", format: "number", higherIsBetter: false, digits: 0 },
  { key: "head_diameter_mm", label: "Head Diameter", group: "physical", unit: "mm", format: "number", digits: 1 },
  { key: "body_diameter_mm", label: "Body Diameter", group: "physical", unit: "mm", format: "number", digits: 1 },
  { key: "body_material", label: "Body Material", group: "physical", format: "string" },

  // Battery & Charging
  { key: "battery_types", label: "Battery Type", group: "battery", format: "string" },
  { key: "recharge_type", label: "Charging", group: "battery", format: "string" },
  { key: "usb_c_rechargeable", label: "USB-C", group: "battery", format: "boolean" },
  { key: "battery_replaceable", label: "Replaceable Battery", group: "battery", format: "boolean" },
  { key: "battery_included", label: "Battery Included", group: "battery", format: "boolean" },
  { key: "battery_rechargeable", label: "Rechargeable Battery", group: "battery", format: "boolean" },

  // Features
  { key: "switch_type", label: "Switch Type", group: "features", format: "string" },
  { key: "has_strobe", label: "Strobe Mode", group: "features", format: "boolean" },
  { key: "has_memory_mode", label: "Memory Mode", group: "features", format: "boolean" },
  { key: "has_lockout", label: "Lockout", group: "features", format: "boolean" },
  { key: "has_moonlight_mode", label: "Moonlight Mode", group: "features", format: "boolean" },
  { key: "has_magnetic_tailcap", label: "Magnetic Tailcap", group: "features", format: "boolean" },
  { key: "has_pocket_clip", label: "Pocket Clip", group: "features", format: "boolean" },

  // Emitter & Optics
  { key: "led_model", label: "LED / Emitter", group: "emitter", format: "string" },
  { key: "cri", label: "CRI", group: "emitter", format: "number", higherIsBetter: true },
  { key: "cct_min_k", label: "CCT Min", group: "emitter", unit: "K", format: "number" },
  { key: "cct_max_k", label: "CCT Max", group: "emitter", unit: "K", format: "number" },

  // Category Scores
  { key: "tactical_score", label: "Tactical Score", group: "scores", format: "score", higherIsBetter: true, digits: 1 },
  { key: "edc_score", label: "EDC Score", group: "scores", format: "score", higherIsBetter: true, digits: 1 },
  { key: "value_score", label: "Value Score", group: "scores", format: "score", higherIsBetter: true, digits: 1 },
  { key: "throw_score", label: "Throw Score", group: "scores", format: "score", higherIsBetter: true, digits: 1 },
  { key: "flood_score", label: "Flood Score", group: "scores", format: "score", higherIsBetter: true, digits: 1 },

  // Amazon
  { key: "amazon_rating_count", label: "Amazon Reviews", group: "amazon", format: "number", higherIsBetter: true },
  { key: "amazon_average_rating", label: "Amazon Rating", group: "amazon", format: "number", higherIsBetter: true, digits: 1 },
  { key: "release_year", label: "Release Year", group: "amazon", format: "number" },
];

export function formatSpecValue(
  value: unknown,
  spec: SpecDef
): string {
  if (value === undefined || value === null) return "—";

  switch (spec.format) {
    case "boolean":
      return value ? "Yes" : "No";
    case "currency": {
      const n = Number(value);
      if (Number.isNaN(n)) return "—";
      return `$${n.toLocaleString(undefined, { minimumFractionDigits: spec.digits ?? 0, maximumFractionDigits: spec.digits ?? 0 })}`;
    }
    case "score": {
      const n = Number(value);
      if (!n || Number.isNaN(n)) return "—";
      return n.toFixed(spec.digits ?? 1);
    }
    case "number": {
      const n = Number(value);
      if (Number.isNaN(n)) return "—";
      const formatted = n.toLocaleString(undefined, {
        minimumFractionDigits: spec.digits ?? 0,
        maximumFractionDigits: spec.digits ?? 0,
      });
      return spec.unit ? `${formatted} ${spec.unit}` : formatted;
    }
    case "string":
    default: {
      if (Array.isArray(value)) return value.join(", ") || "—";
      return String(value) || "—";
    }
  }
}

export function findBestIndex(
  values: unknown[],
  spec: SpecDef
): number | undefined {
  if (spec.higherIsBetter === undefined) return undefined;
  if (spec.format === "boolean" || spec.format === "string") return undefined;

  let bestIdx: number | undefined;
  let bestVal: number | undefined;
  const higher = spec.higherIsBetter;

  values.forEach((v, i) => {
    const n = Number(v);
    if (v === undefined || v === null || Number.isNaN(n)) return;
    if (bestVal === undefined || (higher ? n > bestVal : n < bestVal)) {
      bestVal = n;
      bestIdx = i;
    }
  });

  const defined = values.filter((v) => v !== undefined && v !== null && !Number.isNaN(Number(v)));
  if (defined.length < 2) return undefined;
  return bestIdx;
}
