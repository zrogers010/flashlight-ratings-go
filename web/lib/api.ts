export type RankingItem = {
  rank: number;
  score: number;
  profile: string;
  flashlight: {
    id: number;
    brand: string;
    name: string;
    slug: string;
    image_url?: string;
    amazon_url?: string;
  };
};

export type FlashlightItem = {
  id: number;
  brand: string;
  name: string;
  slug: string;
  model_code?: string;
  description?: string;
  image_url?: string;
  amazon_url?: string;
  max_lumens?: number;
  max_candela?: number;
  beam_distance_m?: number;
  runtime_high_min?: number;
  waterproof_rating?: string;
  price_usd?: number;
  tactical_score?: number;
  edc_score?: number;
  value_score?: number;
  throw_score?: number;
  flood_score?: number;
};

export type FlashlightDetail = FlashlightItem & {
  release_year?: number;
  msrp_usd?: number;
  asin?: string;
  weight_g?: number;
  length_mm?: number;
  head_diameter_mm?: number;
  body_diameter_mm?: number;
  impact_resistance_m?: number;
  runtime_low_min?: number;
  runtime_medium_min?: number;
  runtime_turbo_min?: number;
  sustained_lumens?: number;
  runtime_500_min?: number;
  turbo_stepdown_sec?: number;
  beam_pattern?: string;
  recharge_type?: string;
  battery_replaceable?: boolean;
  has_tail_switch?: boolean;
  has_side_switch?: boolean;
  body_material?: string;
  usb_c_rechargeable?: boolean;
  battery_included?: boolean;
  battery_rechargeable?: boolean;
  has_strobe?: boolean;
  has_memory_mode?: boolean;
  has_lockout?: boolean;
  has_moonlight_mode?: boolean;
  has_magnetic_tailcap?: boolean;
  has_pocket_clip?: boolean;
  switch_type?: string;
  led_model?: string;
  cri?: number;
  cct_min_k?: number;
  cct_max_k?: number;
  amazon_rating_count?: number;
  amazon_average_rating?: number;
  amazon_last_synced_at?: string;
  price_last_updated_at?: string;
  modes: {
    name: string;
    output_lumens?: number;
    runtime_min?: number;
    candela?: number;
    beam_distance_m?: number;
  }[];
  image_urls: string[];
  battery_types: string[];
  use_case_tags: string[];
};

export type FlashlightListResponse = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  items: FlashlightItem[];
};

export type IntelligenceRunInput = {
  intended_use: string;
  budget_usd: number;
  battery_preference: string;
  size_constraint: string;
};

export type IntelligenceRunResult = {
  model_id: number;
  brand: string;
  name: string;
  category: string;
  image_url?: string;
  amazon_url?: string;
  price_usd?: number;
  max_lumens?: number;
  max_candela?: number;
  beam_distance_m?: number;
  runtime_high_min?: number;
  runtime_medium_min?: number;
  weight_g?: number;
  length_mm?: number;
  waterproof_rating?: string;
  battery_type?: string;
  overall_score: number;
  use_case_score: number;
  budget_score: number;
  battery_match_score: number;
  size_fit_score: number;
  tactical_score?: number;
  edc_score?: number;
  value_score?: number;
  throw_score?: number;
  flood_score?: number;
};

export type IntelligenceRunResponse = {
  run_id: number;
  created_at: string;
  intended_use: string;
  budget_usd: number;
  battery_preference: string;
  size_constraint: string;
  algorithm_version: string;
  top_results: IntelligenceRunResult[];
};

const API_BASE =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8080";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchRankings(useCase: string) {
  return getJSON<{ items: RankingItem[] }>(`/rankings?use_case=${encodeURIComponent(useCase)}`);
}

export async function fetchFlashlightByID(id: string) {
  return getJSON<FlashlightDetail>(`/flashlights/${encodeURIComponent(id)}`);
}

export async function fetchCompare(ids: string) {
  return getJSON<{ items: FlashlightItem[] }>(`/compare?ids=${encodeURIComponent(ids)}`);
}

export async function fetchFlashlights() {
  return getJSON<FlashlightListResponse>("/flashlights?page=1&page_size=24");
}

export async function createIntelligenceRun(input: IntelligenceRunInput) {
  const res = await fetch(`${API_BASE}/intelligence/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`Intelligence run failed: ${res.status}`);
  }
  return (await res.json()) as IntelligenceRunResponse;
}

export async function fetchIntelligenceRun(runID: string | number) {
  return getJSON<IntelligenceRunResponse>(`/intelligence/runs/${encodeURIComponent(String(runID))}`);
}
