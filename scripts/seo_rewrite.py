#!/usr/bin/env python3
"""One-shot SEO description rewrite for data/manual_catalog.csv.

Only column 7 (description) is touched. All other columns preserved exactly.
"""
import csv
import sys

NEW_DESCRIPTIONS = {
    # ASIN -> new SEO-optimized description
    "B0CC1K16SW": "High-output 3000-lumen 21700 EDC flashlight with optional Nichia 519A high-CRI LED, magnetic tailcap, and USB-C rechargeable design. IP68 rated with 260m beam distance for camping, hiking, and everyday carry.",
    "B0CW26F7TX": "Long-range LED thrower flashlight delivering 1083m beam distance and 2200 lumens from a Luminus SFT40 HI emitter. USB-C rechargeable 21700 with dual switches for tactical and search-and-rescue use, plus IP68 waterproofing.",
    "B0DCMHQBKQ": "Budget high-CRI EDC flashlight powered by 2x AA batteries with a Nichia 519A LED for accurate color rendering. 600 lumens, IP68 waterproof, and pocket-sized — one of the best entry-level enthusiast lights under $30.",
    "B0BBTKFDP3": "Affordable 2000-lumen scuba dive flashlight rated to 100m depth with magnetic rotary switch for easy gloved operation. Includes rechargeable 26650 battery — a value pick for recreational night and freshwater diving.",
    "B097MSP63S": "4000-lumen right-angle EDC flashlight and headlamp hybrid with Cree XHP70.2 LED. IP68 rated to 10m submersion and powered by an 18650 with USB-C charging — the brightest light in Armytek's Wizard series for camping, caving, and tactical use.",
    "B0DJS1P4RL": "1000-lumen waterproof rechargeable LED flashlight with Coast's Pure Beam Focusing Optic for a smooth zoomable spot-to-flood beam. Compact, IPX8 rated, and USB-C chargeable — an affordable everyday carry pick.",
    "B00BHVNVQ6": "300-lumen rechargeable LED flashlight with Coast's signature slide-focus beam, durable aluminum body, and pocket-clip carry. A long-time favorite for inspection, automotive, and home use.",
    "B08L8C7DTW": "2600-lumen USB-C rechargeable tactical flashlight with Coast's Pure Beam slide-focus optic for adjustable spot-to-flood. IPX8 waterproof high-output duty light for camping, search, and tactical applications.",
    "B08L8CQPPL": "1200-lumen USB-C rechargeable headlamp with dual power source (rechargeable + AAA backup) and Coast's slide-focus beam. Best-selling Portland-made headlamp for camping, hiking, and hands-free work.",
    "B09MMMXFY6": "USA-made tactical flashlight running on dual CR123A cells for extended runtime and cold-weather reliability. 850 lumens, 224m throw, IPX8 rated with bomb-proof potted electronics — built for duty, survival, and home defense.",
    "B091RHZQ66": "Three-cell USA-made modular tactical flashlight milled from bar-stock aluminum with potted electronics and a lifetime guarantee. 1350 lumens and 322m throw on CR123A primaries — built for law enforcement, military, and serious survival use.",
    "B08WCHXYLP": "USB rechargeable LED flashlight that turns on automatically when picked up — a top-selling Amazon flashlight with thousands of 5-star reviews. Affordable home, car, and emergency light from a trusted brand.",
    "B092RHC2FY": "200-lumen LED headlamp with multiple white modes plus a red night-vision mode to preserve dark adaptation. Lightweight 3xAAA design — an affordable, widely available camping and hiking headlamp under $20.",
    "B094LMMGQ7": "Ultra-bright LED flashlight with a digital focus dial that adjusts beam width from spot to flood. IPX4 water-resistant aluminum body — a high-value pick for everyday home, garage, and emergency use.",
    "B0BW4WNN9K": "3100-lumen USB-C rechargeable EDC flashlight with 270m beam distance from a 21700 battery. Successor to the popular E35 V3 with refined ergonomics and IP68 waterproofing — one of Fenix's best high-output everyday carry lights.",
    "B09FV6413D": "1600-lumen USB-C rechargeable headlamp with three light sources (white spot, white flood, red) for camping, hiking, and trail running. IP68 rated and powered by a 21700 for long runtime on the trail.",
    "B0CL57DZ91": "Compact 1700-lumen USB-C rechargeable EDC flashlight with Luminus SST40 LED, 267m throw, and dual tactical/side switches. Two-way pocket clip for hat or backpack carry, IP68 rated with intelligent overheat protection.",
    "B09CSDLSWW": "Rechargeable 1700-lumen tactical flashlight with dual-switch operation. The latest version of Fenix's legendary PD35 series — an industry-favorite duty light for law enforcement, security, and tactical EDC.",
    "B0BGMZ4YNC": "USB-C rechargeable tactical flashlight with Luminus SFT70 LED delivering 2800 lumens and 380m throw. Dual rear switches for instant tactical and strobe access plus 21700 battery for long runtime — a top-rated tactical EDC for LE and outdoor duty.",
    "B0C82NSYVG": "High-performance rechargeable LED flashlight with 3000 lumens and 500m throw, controlled by a patented mechanical rotary switch for intuitive one-handed mode selection. 23% more throw than the previous version — built for search-and-rescue, hunting, and tactical use.",
    "B0B5TX554V": "Duty-grade tactical flashlight with 2800 lumens and 540m throw from a Luminus SFT70 LED. Patented dual-function tactical toggle gives instant access to turbo and strobe — a top-tier law enforcement and military flashlight with IP68 waterproofing.",
    "B09WT6DQSL": "1600-lumen dedicated-throw tactical flashlight with 405m beam distance from a 21700 battery. USB-C rechargeable with tactical tail switch — designed for law enforcement, security patrol, and search-and-rescue operations.",
    "B0CDGG85FR": "Powerful 4000-lumen pocket EDC flashlight with OLED display and USB-C charging. One of the brightest sub-$50 EDC flashlights available — an extreme-output everyday carry for enthusiasts.",
    "B0CRHRJWMC": "World's brightest LED flashlight at 200,000 lumens, with 32 LEDs, active cooling fan, and OLED display. The successor to the legendary MS18 — a true searchlight-class flashlight for serious search-and-rescue and ultra-high-output enthusiasts.",
    "B0CNBL41QG": "Ultra-compact 470-lumen rechargeable EDC pocket flashlight with slim design and USB-C charging. One of Klarus's best-selling everyday carry lights under $20 — perfect for keychain or pocket use.",
    "B07W6MWTMH": "Rechargeable cap-clip light with motion sensor for hands-free running, hiking, and working. Lightweight USB-C clip-on light with 5,000+ Amazon reviews — a versatile budget headlamp alternative.",
    "B08HJ7C7JP": "2200-lumen tactical flashlight with dual tail switches for instant turbo and strobe access. USB-C rechargeable 21700 with 335m throw and IPX8 waterproofing — a duty-grade light for law enforcement and military use.",
    "B09PTYKPKQ": "4400-lumen high-output tactical flashlight with dual-switch design for instant tactical and strobe activation. USB-C rechargeable 21700 with 336m throw — one of the brightest dual-switch tactical lights in its price class.",
    "B07FXGFJYJ": "120-lumen AAA keychain flashlight with optional Nichia 219CT high-CRI LED. Ultra-compact aluminum body — one of the most-recommended budget keychain flashlights for under $10.",
    "B0F5B3WZ59": "World's smallest LED thrower keychain flashlight with 700 lumens and 432m beam distance from an Osram NM1 emitter. Just 33g with USB-C rechargeable 10280 battery and 5 brightness modes — pocket-sized long-range performance.",
    "B0D7Q6G4WN": "Rechargeable LEP (laser-excited phosphor) flashlight delivering an extreme pencil-thin beam at long distance in a compact form factor. USB-C charging and 18650 power — built for tactical, security, and search-and-rescue throw applications.",
    "B07BLTP9ZD": "Pocket-sized AA/14500 EDC flashlight with tactical tail switch and 650 lumens. One of the most-recommended budget enthusiast lights with IPX8 waterproofing — a perennial top pick for value-focused everyday carry.",
    "B07KLW5G4N": "American-made LED upgrade of the classic full-size MagLite, powered by 4 D-cell batteries for extreme runtime. Made in Ontario, California with the legendary MagLite build quality — a survival, vehicle, and home defense flashlight.",
    "B005UUSAAM": "272-lumen American-made 2xAA pocket flashlight with included holster. The classic Mini MagLite reimagined with modern LED output — built in the USA with the legendary MagLite quality.",
    "B004JJQ3UY": "200-lumen American-made compact AAA flashlight with multi-mode electronic switch for high, low, and strobe. Made in the USA with classic MagLite build quality at an affordable price.",
    "B0FDBQGDW2": "8000-lumen flat-shape EDC flashlight with extreme output in a pocketable form factor. USB-C rechargeable with IPX8 waterproofing — one of Nitecore's most powerful flat EDC flashlights to date.",
    "B0CJDT5YQG": "1800-lumen USB-C rechargeable tactical flashlight with Luminus SST40 LED and 504m throw. Hybrid thrower/tactical with dual switches, IP68 waterproof rating, and support for 21700 or 18650 batteries — versatile for duty and outdoor use.",
    "B0CM4LM1K9": "1000-lumen AA-powered EDC flashlight with 279-yard throw and easy worldwide battery sourcing. A high-output pocket light for travel, emergency kits, and everyday carry where standard AA batteries are critical.",
    "B0FGFQM41T": "400-lumen ultralight trail running headlamp weighing just 28g, with white, red, and high-CRI multi-color modes. USB-C rechargeable — a top pick for thru-hiking, ultrarunning, and ounce-counting backpackers.",
    "B094YQQ9VM": "4000-lumen tactical flashlight with instant strobe access via dual rear switches. USB-C rechargeable 21700 battery — a duty-grade law enforcement and military flashlight with high output and fast charging.",
    "B0FGJ3G6V8": "Premium flat EDC flashlight from Olight with rechargeable design, ultra-slim form factor, and IPX8 waterproof rating. Olight's flagship everyday carry pocket light for enthusiasts who want maximum output in minimal carry.",
    "B0FGND9HR1": "Slim flat-body rechargeable EDC flashlight with magnetic charging and pocket-friendly form factor. Olight's best-selling everyday carry light for daily pocket carry, work, and home use.",
    "B099WFFL3S": "Compact pistol-mounted weapon light with 800-lumen white LED and integrated green laser combo. Sliding rail fits both Glock and Picatinny mounts, with magnetic USB rechargeable battery and dual rear switches for momentary or constant-on operation.",
    "B0CHFCCZT8": "1500-lumen rechargeable EDC flashlight with proximity sensor for thermal protection, magnetic charging, and pocket clip. Premium build quality — one of the most popular enthusiast EDC flashlights for under $80.",
    "B0DX1GJR2T": "Ultra-compact 180-lumen twist-head keychain flashlight with USB-C charging and 12-hour low-mode runtime. Just 22g with a CSP LED and TIR optic — 20% brighter than the original I1R 2 and one of the top-rated keychain lights on Amazon.",
    "B0CHMV8G9W": "200-lumen dual-output AAA pocket EDC flashlight with tactical tail switch. Excellent build quality at an entry-level under-$15 price — a top recommendation for first-time enthusiasts and gift-giving.",
    "B0C54ZH8WW": "Rechargeable 50-lumen keychain flashlight with magnetic USB charging in a tiny aluminum body. Over 8,000 Amazon reviews — one of the most popular keychain flashlights for backup, gifting, and everyday utility.",
    "B0FP17L2VZ": "7000-lumen compact searchlight with 600m throw, RGB auxiliary lights, and wireless charging. Combines flood and throw in one versatile body — Olight's portable powerhouse for search-and-rescue and outdoor use.",
    "B0DDC4MH84": "Clip-on EDC flashlight with 360-degree rotating clip for hands-free use on hats, packs, and pockets. USB-C rechargeable — a versatile lightweight headlamp alternative for camping, work, and everyday utility.",
    "B0C9Q3Q62Q": "4600-lumen high-output rechargeable LED flashlight with USB-C charging and included holster. Olight's most powerful handheld flashlight — built for outdoor adventure, search, and emergency response.",
    "B09WYCPC1N": "2300-lumen dual-switch tactical flashlight with proximity sensor for thermal safety and magnetic charging. Tail switch for tactical use and side switch for daily mode — one of the best dual-purpose tactical EDC flashlights.",
    "B09X9B2CC9": "Compact 1750-lumen tactical EDC flashlight with dual switches for instant turbo and strobe activation. Magnetic MCC charging with proximity sensor — premium build with deep-carry pocket clip for daily and tactical use.",
    "B07MTGCMKG": "1500-lumen scuba dive flashlight with 7-degree narrow throw beam, titanium alloy switch, and IP68 rating to 150m depth. Built for cave diving, night diving, and underwater long-range visibility.",
    "B091TVY7YR": "3000-lumen professional scuba dive flashlight with 6-degree narrow beam, titanium alloy side switch, and 350m underwater range. Four brightness modes with 7-hour low-mode runtime — built for technical and recreational diving.",
    "B0D7HCKTQD": "2-in-1 zoomable scuba dive flashlight with adjustable 4-72 degree beam, 212,500 candela peak intensity, and 920m range. The premier choice for long-distance underwater spotting, technical diving, and search applications.",
    "B07BNMDJBF": "Compact 200-lumen 3xAAA headlamp with red and white modes for camping, hiking, and night reading. IPX4 water resistance and lightweight design from a trusted American outdoor headlamp brand.",
    "B08RZ9Y7QT": "Compact 650-lumen keychain EDC flashlight with USB-C charging and magnetic clip — only 21g for ultra-portable carry. A top-rated keychain flashlight under $30 for every-day-pocket performance.",
    "B0B71M8DB5": "Upgraded 650-lumen keychain flashlight with secondary UV and red LEDs for utility use. Titanium or aluminum body with integrated USB-C charging — a versatile do-it-all keychain light for EDC enthusiasts.",
    "B088FRZLV2": "Right-angle 18650 headlamp with magnetic tailcap, USB-C charging, and 1200-lumen output. An enthusiast favorite for camping, caving, and outdoor use thanks to its quality emitter and refined UI.",
    "B09SV4Q4PF": "2100-lumen long-throw flashlight with Luminus SFT-40 LED and TIR optic delivering 680m beam distance from a 21700 battery. Outstanding throw-per-dollar value — one of the best budget thrower flashlights for hunting, search, and outdoor use.",
    "B097MN6P1B": "Anduril-firmware camping lantern with adjustable color temperature and 600-lumen output from triple 18650 batteries. Community-designed with USB-C charging — a favorite of enthusiasts for camping and overlanding.",
    "B09ZP5137V": "Compact 1100-lumen mini EDC flashlight with 90+ CRI Samsung LH351D LED, Anduril UI, and USB-C rechargeable 16340 battery. Magnetic tailcap and excellent color rendering for under $25 — a standout budget enthusiast EDC.",
    "B09L1634X6": "2000-lumen budget EDC flashlight with USB-C charging and Anduril 2 UI. The best-selling entry point into enthusiast-grade flashlights — incredible value for under $50 with full programmable controls.",
    "B088WDMDPT": "Affordable 3000-lumen scuba dive flashlight with magnetic ring switch for easy gloved operation. Cree XHP50.2 LED with neutral underwater tone, 100m depth IPX8 rating, and included 26650 battery — a top value pick for recreational divers.",
    "B0CYLQ35C7": "USB-C rechargeable tactical flashlight with affordable enthusiast quality and excellent community reviews. A budget tactical pick for duty, training, and home defense — a strong value upgrade over typical sub-$30 lights.",
    "B0BJ27NMJD": "3800-lumen tactical flashlight with Luminus SST-40 LED and tactical tail switch. The successor to the SP35 with significantly more output — a budget-priced 21700 tactical light with strong throw and great value.",
    "B09T2J2B6F": "5650-lumen quad-LED soda-can-style flashlight with Anduril firmware and high-CRI Samsung LH351D emitters. USB-C charging and 3x 18650 power — a top-rated enthusiast lantern-class flashlight for camping and outdoor use.",
    "B07DLZXZV1": "250-lumen ultra-compact rechargeable USB-C penlight with 31,000+ Amazon ratings. One of the best-selling EDC pocket flashlights of all time — perfect for inspection, work, and everyday carry.",
    "B06WD29DZ8": "Multi-fuel tactical EDC flashlight with TEN-TAP programmable switch, running on either rechargeable SL-B26 or disposable CR123A batteries. Battery flexibility makes it ideal for survival, EDC, and tactical use; tail switch gives instant momentary-on for duty applications.",
    "B07B5CS8CG": "Widely used dual-fuel 1000-lumen tactical flashlight with TEN-TAP programmable modes. Standard issue for many U.S. law enforcement agencies — a duty-grade flashlight that runs on rechargeable 18650 or 2x CR123A primaries.",
    "B06VTLLDH4": "1000-lumen rail-mount tactical weapon light with included remote pressure switch. Widely deployed by U.S. law enforcement and military — a long-throw long-gun light with 27,000 candela and 330m beam distance.",
    "B00OW5AK22": "Compact 200-lumen camping lantern with red and white modes, running on standard AA batteries for 7-hour runtime. Magnetic base, D-ring hang, and IPX7 rating — a long-time favorite for camping, emergencies, and power outages.",
    "B08FVN41XP": "2000-lumen rechargeable duty flashlight with USB-C charging — the modern update to Streamlight's legendary Stinger duty light. 400m throw and dual-switch UI for law enforcement, security, and high-output everyday duty.",
    "B0015UC17E": "100-lumen LED penlight with pocket clip and ultra-slim aluminum body. With 19,000+ Amazon reviews, it's a gold-standard inspection penlight for medical, automotive, and EDC backup use.",
    "B00B8Q31UQ": "Industry-standard 1000-lumen pistol-mounted weapon light with 20,000 candela. Trusted by law enforcement and military worldwide — fits Picatinny and Glock rails for full-size duty pistols.",
    "B084SWJQG6": "500-lumen compact rail-mount pistol weapon light with top-rear ambidextrous switch. Fits most full-size and compact pistols — a popular choice for concealed carry, duty, and home defense handguns.",
    "B076XQ9834": "1200-lumen dual-output tactical EDC flashlight with tail switch for instant momentary-on. Compact CR123A-powered light with legendary SureFire reliability — a top pick for tactical pocket carry and home defense.",
    "B009F7J8RA": "600-lumen dual-output tactical flashlight with rugged Nitrolon polymer body and CR123A power. The most affordable entry into the SureFire lineup — built for hard tactical use, training, and reliable EDC backup.",
    "B086QQ4295": "1000-lumen Scout Light Pro long-gun weapon light with TIR lens and M-LOK + Picatinny mount compatibility. The current-generation SureFire rifle light for military, law enforcement, and home defense rifles.",
    "B07FXQVZTW": "Slim 650-lumen rechargeable EDC flashlight that carries like a folding knife with momentary primary switch and pocket clip. Rugged polymer/aluminum SureFire build quality — a discreet and capable everyday carry light.",
    "B07KH2VJT9": "Industry-standard 1000-lumen pistol weapon light with rail-mount for Picatinny and Glock. Trusted by U.S. military and law enforcement worldwide — the duty-grade pistol light that defined the category.",
    "B0CTCDPXFY": "1000-lumen rechargeable AA EDC flashlight with USB-C charging. The updated Archer series adds higher output and modern recharging while keeping AA compatibility — a versatile every-day-carry pick.",
    "B0C231WKXG": "Slim 950-lumen USB-C rechargeable penlight with tail switch for one-handed tactical use. Stainless steel pocket clip and refined ergonomics — a premium build with excellent size-to-output ratio for EDC.",
    "B0DBQFF5B7": "Ultra-compact 566m throw searchlight that fits in your palm, with a Luminus SFT-70 LED at 80,200 candela. Ships with both 18350 battery and 18650 extension tube for runtime flexibility — pocket-sized search-and-rescue capability.",
    "B08V4Z7X6N": "Compact dedicated thrower flashlight with 692m beam distance from a Luminus SST-70 LED. USB-C rechargeable 26650 battery — one of the best mid-size thrower flashlights for hunting, security, and outdoor search.",
    "B0DBQGF7LQ": "4010-lumen powerhouse thrower with 1081m beam distance and 7500mAh battery. USB-C 3A fast charging plus powerbank function — a major upgrade over the V6 with significantly more output and throw for SAR, hunting, and exploration.",
    "B0BK8MXQQR": "Versatile 1900-lumen dual-switch tactical flashlight with 380m beam distance and USB-C rechargeable 21700 battery. Tail and side switches for both tactical and everyday use — the modern successor to the legendary TN12 series.",
    "B07KW4SP8M": "Diagnostic medical penlight with no-glare warm-LED output for clinical pupil and throat assessment. The top-selling medical penlight on Amazon — used by doctors, nurses, EMTs, and medical students.",
    "B08LG64XBV": "1200-lumen rechargeable EDC flashlight with 160-degree wide flood beam and IP68 waterproof rating. Climate Pledge Friendly with 8,000+ Amazon reviews — a top-rated budget EDC pick for under $30.",
    "B0DT6SS412": "400-lumen rechargeable EDC keychain flashlight with RGB accent lighting and magnetic mount. Compact, fun, and USB-C rechargeable — a popular budget pocket and gifting flashlight.",
    "B0D4DSK2GC": "3600-lumen scuba dive flashlight with triple Samsung LH351D 90-CRI LEDs for excellent underwater color rendering. Magnetic ring switch for gloved operation and IP68 rated to 100m — outstanding value for recreational divers.",
    "B08JCM95X6": "High-CRI 1300-lumen USB-C rechargeable EDC flashlight with 90 CRI LED for accurate color rendering and a magnetic tailcap for hands-free use. One of the best budget enthusiast EDC flashlights on the market.",
    "B0D311QCJM": "Balanced 1200-lumen EDC flashlight with USB-C charging and Nichia 519A high-CRI LED. Magnetic tailcap, simple UI, and IP68 waterproofing — a perfect starter enthusiast everyday carry light.",
    "B0DY7RVP5W": "2000-lumen tactical EDC flashlight with dual switches and USB-C charging. Budget-friendly tactical option with instant turbo access from a 18650 battery — strong value for training, duty backup, and EDC.",
    "B0DP6WN8S5": "6-in-1 multi-function flashlight with white-laser thrower and auxiliary LEDs in a versatile EDC body. USB-C charging and configurable beam options — a unique tactical-utility light for enthusiasts.",
    "B0C9LNZTT4": "USB-C rechargeable LED tactical flashlight with high output, dual switches, and 18650 battery. An affordable tactical pick with 1,300+ Amazon reviews — strong value for under $35.",
    "B0DLWHLXLR": "5000-lumen tactical flashlight with Luminus SFT70.3 HI LED and 482m throw. Attack bezel design with IP68 waterproofing and USB-C rechargeable 21700 battery — a powerful budget tactical light for duty and outdoor use.",
}

CSV_PATH = "data/manual_catalog.csv"
COL_ASIN = 10
COL_DESCRIPTION = 7

def main():
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)

    header = rows[0]
    data = rows[1:]

    updated = 0
    missing = []
    for row in data:
        asin = row[COL_ASIN].strip()
        if not asin:
            continue
        if asin in NEW_DESCRIPTIONS:
            row[COL_DESCRIPTION] = NEW_DESCRIPTIONS[asin]
            updated += 1
        else:
            missing.append(asin)

    if missing:
        print(f"WARN: {len(missing)} ASINs not in rewrite map: {missing}", file=sys.stderr)

    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(header)
        writer.writerows(data)

    print(f"updated {updated}/{len(data)} description rows")

if __name__ == "__main__":
    main()
