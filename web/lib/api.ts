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
  weight_g?: number;
  length_mm?: number;
  head_diameter_mm?: number;
  body_diameter_mm?: number;
  impact_resistance_m?: number;
  runtime_low_min?: number;
  runtime_medium_min?: number;
  runtime_turbo_min?: number;
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
  modes: {
    name: string;
    output_lumens?: number;
    runtime_min?: number;
    candela?: number;
    beam_distance_m?: number;
  }[];
  image_urls: string[];
  battery_types: string[];
};

export type FlashlightListResponse = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  items: FlashlightItem[];
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
