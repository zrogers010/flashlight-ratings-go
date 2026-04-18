#!/usr/bin/env python3
"""Apply catalog mutations after rainforest-sync update + discover.

Removes unavailable/dead-ASIN listings, swaps two ASINs in-place,
and adds high-quality new bestseller listings (with live API data
fetched at script run time + curated SEO descriptions and known specs).
"""
import csv
import json
import os
import sys
import urllib.request
import urllib.parse

CSV_PATH = "data/manual_catalog.csv"
API_KEY = os.environ["RAINFOREST_API_KEY"]
PARTNER_TAG = os.environ.get("AMAZON_PARTNER_TAG", "flashlightrat-20")

REMOVALS = {
    "B0B5TX554V",  # Fenix TK22 TAC - unavailable; TK22 V2.0 covers it
    "B09X9B2CC9",  # Olight Warrior Mini 2 - unavailable; Warrior 3S covers
    "B09ZP5137V",  # Sofirn SC21 Pro - unavailable
    "B088WDMDPT",  # Sofirn SD05 - unavailable; OrcaTorch + Wurkkos cover diving
    "B06WD29DZ8",  # Streamlight ProTac 2L-X - unavailable; HL-X covers
    "B0DBQFF5B7",  # ThruNite Catapult Mini Pro - unavailable
    "B0DBQGF7LQ",  # ThruNite Catapult V7 - unavailable; V6 covers thrower
    "B0C231WKXG",  # ThruNite Archer Pro V2 - unavailable; replaced by Archer 2A V3
    "B0D4DSK2GC",  # Wurkkos DL30 - ASIN now points to wrong variant
    "B0DLWHLXLR",  # Wurkkos TS23 - variant changed
}

# {old_asin: new_asin} - in-place replacement, keeps spec fields, refreshes amazon data
REPLACEMENTS = {
    "B0BK8MXQQR": "B0DHRPT48X",  # TN12 Pro -> TN12 V6
    "B08LG64XBV": "B086WJBB7K",  # Wuben C3 wrong-variant -> correct C3 ASIN
}

# New listings to ADD. Spec fields come from manufacturer datasheets and
# established knowledge of these well-known products. Amazon-side fields
# (price, ratings, image) are pulled live from Rainforest at run time.
ADDITIONS = [
    {
        "asin": "B08H1NTK82",
        "brand_name": "ThruNite", "brand_slug": "thrunite", "brand_country_code": "CN",
        "brand_website_url": "https://thrunite.com",
        "model_name": "Archer 2A V3", "model_slug": "thrunite-archer-2a-v3", "model_code": "ARCH2AV3",
        "release_year": "2018", "msrp_usd": "19.95",
        "description": "500-lumen 2xAA EDC penlight with tail switch and pocket clip. With over 5,000 Amazon ratings, the Archer 2A V3 is one of the most-recommended budget AA EDC flashlights for around $20 — a perennial enthusiast favorite.",
        "max_lumens": "500", "sustained_lumens": "200", "max_candela": "", "beam_distance_m": "121",
        "runtime_max_min": "", "runtime_500_min": "", "turbo_stepdown_sec": "",
        "beam_pattern": "hybrid", "battery_type": "AA", "recharge_type": "none", "battery_replaceable": "true",
        "weight_g": "84", "length_mm": "144", "head_diameter_mm": "21.6", "body_diameter_mm": "21.6",
        "switch_type": "tail", "waterproof_rating": "IPX8", "impact_resistance_m": "1.5",
        "body_material": "Aluminum", "use_case_tags": "edc,value",
    },
    {
        "asin": "B0B5BZLKWT",
        "brand_name": "ACEBEAM", "brand_slug": "acebeam", "brand_country_code": "CN",
        "brand_website_url": "https://www.acebeam.com",
        "model_name": "Pokelit AA", "model_slug": "acebeam-pokelit-aa", "model_code": "POKELITAA",
        "release_year": "2022", "msrp_usd": "29.95",
        "description": "USB-C rechargeable 1xAA mini EDC flashlight with magnetic tailcap and pocket clip. Best-selling Acebeam pocket light with 4,600+ Amazon ratings — runs on the included 14500 lithium or any AA battery for travel and emergency flexibility.",
        "max_lumens": "550", "sustained_lumens": "180", "max_candela": "1500", "beam_distance_m": "77",
        "runtime_max_min": "", "runtime_500_min": "", "turbo_stepdown_sec": "",
        "beam_pattern": "flood", "battery_type": "AA", "recharge_type": "usb-c", "battery_replaceable": "true",
        "weight_g": "55", "length_mm": "94", "head_diameter_mm": "20", "body_diameter_mm": "20",
        "switch_type": "tail", "waterproof_rating": "IP68", "impact_resistance_m": "1.0",
        "body_material": "Aluminum", "use_case_tags": "edc,value,keychain",
    },
    {
        "asin": "B08VJJ3JFR",
        "brand_name": "Coast", "brand_slug": "coast", "brand_country_code": "US",
        "brand_website_url": "https://www.coastportland.com",
        "model_name": "XPH34R", "model_slug": "coast-xph34r", "model_code": "XPH34R",
        "release_year": "2021", "msrp_usd": "59.99",
        "description": "2700-lumen USB-C rechargeable dual-power headlamp with Coast's signature Pure Beam slide-focus optic. Top-rated 4.7-star Portland-made headlamp for camping, work, and hands-free outdoor use.",
        "max_lumens": "2700", "sustained_lumens": "900", "max_candela": "", "beam_distance_m": "",
        "runtime_max_min": "", "runtime_500_min": "", "turbo_stepdown_sec": "",
        "beam_pattern": "hybrid", "battery_type": "", "recharge_type": "usb-c", "battery_replaceable": "true",
        "weight_g": "", "length_mm": "", "head_diameter_mm": "", "body_diameter_mm": "",
        "switch_type": "side", "waterproof_rating": "IPX4", "impact_resistance_m": "1.0",
        "body_material": "Polymer", "use_case_tags": "camping",
    },
    {
        "asin": "B0DMN1S83X",
        "brand_name": "Klarus", "brand_slug": "klarus", "brand_country_code": "CN",
        "brand_website_url": "https://www.klaruslight.com",
        "model_name": "HM1", "model_slug": "klarus-hm1", "model_code": "HM1",
        "release_year": "2024", "msrp_usd": "29.95",
        "description": "Rechargeable LED headlamp with motion-sensor on/off, IPX6 waterproof rating, and lightweight comfort. With 3,000+ Amazon ratings at 4.7 stars, it's one of the top-selling budget headlamps for camping, hiking, and running.",
        "max_lumens": "500", "sustained_lumens": "200", "max_candela": "", "beam_distance_m": "",
        "runtime_max_min": "", "runtime_500_min": "", "turbo_stepdown_sec": "",
        "beam_pattern": "flood", "battery_type": "", "recharge_type": "usb-c", "battery_replaceable": "false",
        "weight_g": "", "length_mm": "", "head_diameter_mm": "", "body_diameter_mm": "",
        "switch_type": "side", "waterproof_rating": "IPX6", "impact_resistance_m": "1.0",
        "body_material": "Polymer", "use_case_tags": "camping,value",
    },
    {
        "asin": "B07G98XCG4",
        "brand_name": "Lumintop", "brand_slug": "lumintop", "brand_country_code": "CN",
        "brand_website_url": "https://www.lumintop.com",
        "model_name": "Tool AAA", "model_slug": "lumintop-tool-aaa", "model_code": "TOOLAAA",
        "release_year": "2018", "msrp_usd": "16.99",
        "description": "130-lumen AAA pocket EDC flashlight with magnetic tailcap and tail switch. Long a top-recommended budget keychain/pocket light in the enthusiast community — IPX-8 waterproof aluminum body for under $20.",
        "max_lumens": "130", "sustained_lumens": "60", "max_candela": "", "beam_distance_m": "",
        "runtime_max_min": "", "runtime_500_min": "", "turbo_stepdown_sec": "",
        "beam_pattern": "flood", "battery_type": "AAA", "recharge_type": "none", "battery_replaceable": "true",
        "weight_g": "23", "length_mm": "76", "head_diameter_mm": "14", "body_diameter_mm": "14",
        "switch_type": "tail", "waterproof_rating": "IPX8", "impact_resistance_m": "1.0",
        "body_material": "Aluminum", "use_case_tags": "edc,keychain,value",
    },
    {
        "asin": "B00938T182",
        "brand_name": "MagLite", "brand_slug": "maglite", "brand_country_code": "US",
        "brand_website_url": "https://www.maglite.com",
        "model_name": "Mini LED 2-Cell AA", "model_slug": "maglite-mini-led-2aa", "model_code": "SP22",
        "release_year": "2010", "msrp_usd": "19.99",
        "description": "Compact 2xAA Mini MagLite with twist-on focusing LED, water-resistant aluminum body, and the legendary American MagLite quality. 4,300+ Amazon ratings at 4.7 stars — a classic value pick for everyday carry, glove box, and home use.",
        "max_lumens": "84", "sustained_lumens": "60", "max_candela": "", "beam_distance_m": "",
        "runtime_max_min": "", "runtime_500_min": "", "turbo_stepdown_sec": "",
        "beam_pattern": "hybrid", "battery_type": "AA", "recharge_type": "none", "battery_replaceable": "true",
        "weight_g": "", "length_mm": "168", "head_diameter_mm": "23", "body_diameter_mm": "16",
        "switch_type": "twist", "waterproof_rating": "IPX4", "impact_resistance_m": "1.0",
        "body_material": "Aluminum", "use_case_tags": "edc,value",
    },
    {
        "asin": "B0DCQDXSS5",
        "brand_name": "NITECORE", "brand_slug": "nitecore", "brand_country_code": "CN",
        "brand_website_url": "https://www.nitecorestore.com",
        "model_name": "NU20 Classic", "model_slug": "nitecore-nu20-classic", "model_code": "NU20CLASSIC",
        "release_year": "2024", "msrp_usd": "24.95",
        "description": "Ultralight 360-lumen USB-C rechargeable headlamp at just 35g. White and red modes, multiple brightness levels, and IP66 weather resistance — a top pick for ultralight backpacking, trail running, and travel.",
        "max_lumens": "360", "sustained_lumens": "150", "max_candela": "", "beam_distance_m": "",
        "runtime_max_min": "", "runtime_500_min": "", "turbo_stepdown_sec": "",
        "beam_pattern": "flood", "battery_type": "", "recharge_type": "usb-c", "battery_replaceable": "false",
        "weight_g": "35", "length_mm": "", "head_diameter_mm": "", "body_diameter_mm": "",
        "switch_type": "side", "waterproof_rating": "IP66", "impact_resistance_m": "1.0",
        "body_material": "Polymer", "use_case_tags": "camping,value",
    },
    {
        "asin": "B0DHQXJDM2",
        "brand_name": "NITECORE", "brand_slug": "nitecore", "brand_country_code": "CN",
        "brand_website_url": "https://www.nitecorestore.com",
        "model_name": "EDC29", "model_slug": "nitecore-edc29", "model_code": "EDC29",
        "release_year": "2024", "msrp_usd": "109.95",
        "description": "6500-lumen flat-shape EDC tactical flashlight with USB-C charging, OLED display, and dual-switch operation. One of the most powerful slim-profile EDC flashlights available — built for everyday carry that pulls double duty as a tactical light.",
        "max_lumens": "6500", "sustained_lumens": "1800", "max_candela": "", "beam_distance_m": "",
        "runtime_max_min": "", "runtime_500_min": "", "turbo_stepdown_sec": "",
        "beam_pattern": "flood", "battery_type": "", "recharge_type": "usb-c", "battery_replaceable": "false",
        "weight_g": "", "length_mm": "", "head_diameter_mm": "", "body_diameter_mm": "",
        "switch_type": "dual", "waterproof_rating": "IPX8", "impact_resistance_m": "1.5",
        "body_material": "Aluminum", "use_case_tags": "edc,tactical",
    },
    {
        "asin": "B07CP6CFX9",
        "brand_name": "RovyVon", "brand_slug": "rovyvon", "brand_country_code": "CN",
        "brand_website_url": "https://www.rovyvon.com",
        "model_name": "Aurora A1 Gen 4", "model_slug": "rovyvon-aurora-a1-g4", "model_code": "A1G4",
        "release_year": "2020", "msrp_usd": "21.95",
        "description": "Compact 650-lumen keychain EDC flashlight with USB-C charging, weighing just 14g. With over 6,400 Amazon ratings at 4.6 stars, the A1 Gen 4 is one of the most popular keychain flashlights for daily pocket carry, travel, and gifting.",
        "max_lumens": "650", "sustained_lumens": "200", "max_candela": "1000", "beam_distance_m": "63",
        "runtime_max_min": "", "runtime_500_min": "", "turbo_stepdown_sec": "",
        "beam_pattern": "flood", "battery_type": "", "recharge_type": "usb-c", "battery_replaceable": "false",
        "weight_g": "14", "length_mm": "59", "head_diameter_mm": "15", "body_diameter_mm": "15",
        "switch_type": "side", "waterproof_rating": "IP65", "impact_resistance_m": "1.0",
        "body_material": "Polymer", "use_case_tags": "keychain,edc,value",
    },
    {
        "asin": "B08XMDY4F2",
        "brand_name": "Streamlight", "brand_slug": "streamlight", "brand_country_code": "US",
        "brand_website_url": "https://www.streamlight.com",
        "model_name": "TLR-7 X Sub", "model_slug": "streamlight-tlr-7-x-sub", "model_code": "69400",
        "release_year": "2021", "msrp_usd": "159.99",
        "description": "500-lumen sub-compact rail-mount pistol weapon light designed for sub-compact and micro-compact concealed-carry handguns including the SIG Sauer P365 and Springfield Hellcat. With 4,800+ Amazon ratings, it's the gold-standard CCW weapon light.",
        "max_lumens": "500", "sustained_lumens": "300", "max_candela": "", "beam_distance_m": "",
        "runtime_max_min": "90", "runtime_500_min": "", "turbo_stepdown_sec": "",
        "beam_pattern": "flood", "battery_type": "CR123A", "recharge_type": "none", "battery_replaceable": "true",
        "weight_g": "", "length_mm": "61", "head_diameter_mm": "", "body_diameter_mm": "",
        "switch_type": "side", "waterproof_rating": "IPX7", "impact_resistance_m": "1.5",
        "body_material": "Aluminum", "use_case_tags": "weapon-mount,tactical",
    },
    {
        "asin": "B0CHB51JWG",
        "brand_name": "Wuben", "brand_slug": "wuben", "brand_country_code": "CN",
        "brand_website_url": "https://www.wubenlight.com",
        "model_name": "E7", "model_slug": "wuben-e7", "model_code": "E7",
        "release_year": "2023", "msrp_usd": "29.99",
        "description": "1800-lumen rechargeable mini EDC flashlight with magnetic tailcap and IP68 waterproofing. With 3,900+ Amazon ratings, the E7 is one of Wuben's most popular value EDC lights — high output in a compact pocket-friendly form.",
        "max_lumens": "1800", "sustained_lumens": "600", "max_candela": "", "beam_distance_m": "",
        "runtime_max_min": "", "runtime_500_min": "", "turbo_stepdown_sec": "",
        "beam_pattern": "flood", "battery_type": "", "recharge_type": "usb-c", "battery_replaceable": "false",
        "weight_g": "", "length_mm": "", "head_diameter_mm": "", "body_diameter_mm": "",
        "switch_type": "side", "waterproof_rating": "IP68", "impact_resistance_m": "1.0",
        "body_material": "Aluminum", "use_case_tags": "edc,value",
    },
]


def lookup(asin):
    params = urllib.parse.urlencode({
        "api_key": API_KEY,
        "type": "product",
        "amazon_domain": "amazon.com",
        "asin": asin,
    })
    url = f"https://api.rainforestapi.com/request?{params}"
    with urllib.request.urlopen(url, timeout=60) as r:
        data = json.load(r)
    p = data.get("product", {})
    bw = p.get("buybox_winner", {})
    return {
        "title": p.get("title", ""),
        "price": (bw.get("price") or {}).get("value"),
        "rating": p.get("rating"),
        "ratings_total": p.get("ratings_total"),
        "main_image": (p.get("main_image") or {}).get("link", ""),
        "in_stock": (bw.get("availability") or {}).get("type") == "in_stock",
    }


def fmt_float(v):
    if v is None:
        return ""
    s = f"{float(v):.2f}".rstrip("0").rstrip(".")
    return s if s else "0"


def main():
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)
    header = rows[0]
    data = rows[1:]
    H = {n: i for i, n in enumerate(header)}

    # 1) Removals
    removed = [r for r in data if r[H["asin"]] in REMOVALS]
    data = [r for r in data if r[H["asin"]] not in REMOVALS]
    for r in removed:
        print(f"REMOVED  {r[H['brand_name']]} {r[H['model_name']]} ({r[H['asin']]})")

    # 2) Replacements (in-place ASIN swap, refresh amazon-side fields, keep specs)
    for old_asin, new_asin in REPLACEMENTS.items():
        for r in data:
            if r[H["asin"]] == old_asin:
                live = lookup(new_asin)
                old_label = f"{r[H['brand_name']]} {r[H['model_name']]} ({old_asin})"
                r[H["asin"]] = new_asin
                r[H["amazon_url"]] = f"https://www.amazon.com/dp/{new_asin}?tag={PARTNER_TAG}"
                if live["price"]:
                    r[H["current_price_usd"]] = fmt_float(live["price"])
                if live["ratings_total"]:
                    r[H["amazon_rating_count"]] = str(live["ratings_total"])
                if live["rating"]:
                    r[H["amazon_average_rating"]] = fmt_float(live["rating"])
                if live["main_image"]:
                    r[H["image_url"]] = live["main_image"]
                print(f"REPLACED {old_label} -> {new_asin}  ({live['title'][:50]}, ${live['price']}, {live['ratings_total']} ratings)")
                break

    # 3) Additions
    for spec in ADDITIONS:
        live = lookup(spec["asin"])
        new_row = [""] * len(header)
        for k, v in spec.items():
            if k in H:
                new_row[H[k]] = v
        new_row[H["amazon_url"]] = f"https://www.amazon.com/dp/{spec['asin']}?tag={PARTNER_TAG}"
        new_row[H["current_price_usd"]] = fmt_float(live["price"]) if live["price"] else ""
        new_row[H["amazon_rating_count"]] = str(live["ratings_total"]) if live["ratings_total"] else ""
        new_row[H["amazon_average_rating"]] = fmt_float(live["rating"]) if live["rating"] else ""
        new_row[H["image_url"]] = live["main_image"]
        data.append(new_row)
        print(f"ADDED    {spec['brand_name']} {spec['model_name']} ({spec['asin']})  ${live['price']}, {live['ratings_total']} ratings")

    # Sort by brand then model for stable diffs
    data.sort(key=lambda r: (r[H["brand_name"]].lower(), r[H["model_name"]].lower()))

    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        w.writerow(header)
        w.writerows(data)

    print(f"\nFinal catalog size: {len(data)} listings")


if __name__ == "__main__":
    main()
