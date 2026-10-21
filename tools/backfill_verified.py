#!/usr/bin/env python3
"""
Backfill verified specs from official manufacturer pages.
Only updates empty fields for specified products, matched by model_slug.
"""
import csv
import sys

# Verified backfill data from official manufacturer pages
BACKFILLS = {
    'energizer-auto-on': {
        'max_lumens': '1000',
        'max_candela': '2500',  # (100m/2)^2
        'beam_distance_m': '100',
        'runtime_max_min': '1680',  # 28 hours * 60
    },
    'energizer-vision-hd-pro': {
        # Product doesn't exist in official catalog - leave empty
    },
    'klarus-hc3': {
        'max_lumens': '100',
        'max_candela': '56',  # (15m/2)^2
        'beam_distance_m': '15',
        'runtime_max_min': '1620',  # 27 hours * 60
    },
    'lumintop-thor-mini': {
        'max_lumens': '250',
        'max_candela': '122500',
        'beam_distance_m': '700',
        'runtime_max_min': '45',  # Manual shows ~45min on turbo
    },
    'maglite-ml300l-led': {
        'max_lumens': '1002',
        'max_candela': '65407',
        'beam_distance_m': '511',
        'runtime_max_min': '345',  # 5h45m = 345 min
    },
    'olight-arkpro': {
        'max_lumens': '1500',
        'max_candela': '10640',
        'beam_distance_m': '205',
    },
    'olight-arkpro-ultra': {
        'max_lumens': '1700',
        'max_candela': '10640',
        'beam_distance_m': '205',
    },
    'olight-oclip-pro': {
        'max_lumens': '500',
        'beam_distance_m': '120',
        'runtime_max_min': '210',  # 3.5 hours * 60
    },
    'sofirn-sp31-v3': {
        'max_lumens': '2000',
        'max_candela': '18100',
        'beam_distance_m': '269',
        'runtime_max_min': '130',
    },
    'weltool-m6-dr': {
        'max_lumens': '4.5',
        'max_candela': '4.5',
        'runtime_max_min': '600',  # 10 hours * 60
    },
    'wurkkos-hd01-pro': {
        'max_lumens': '1100',
        'max_candela': '5329',  # (146m/2)^2
        'beam_distance_m': '146',
        'runtime_max_min': '240',
    },
    'wurkkos-td02': {
        'max_lumens': '2000',
        'max_candela': '16075',
        'beam_distance_m': '254',
        'runtime_max_min': '150',  # 2.5 hours * 60
    },
}

def main():
    with open('data/manual_catalog.csv', 'r', newline='') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)
    
    # Index by model_slug
    slug_to_row = {}
    for i, row in enumerate(rows):
        slug = row['model_slug']
        if slug in slug_to_row:
            print(f"WARNING: Duplicate slug {slug}", file=sys.stderr)
        slug_to_row[slug] = i
    
    changed_slugs = []
    
    for slug, backfill_data in BACKFILLS.items():
        if slug not in slug_to_row:
            print(f"WARNING: Slug {slug} not found in CSV", file=sys.stderr)
            continue
        
        row_idx = slug_to_row[slug]
        row = rows[row_idx]
        changed = False
        
        for field, value in backfill_data.items():
            current_value = row[field].strip()
            # Only fill if currently empty
            if not current_value and value:
                rows[row_idx][field] = value
                changed = True
                print(f"{slug}: {field} = {value}")
        
        if changed:
            changed_slugs.append(slug)
    
    # Write back
    with open('data/manual_catalog.csv', 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"\nChanged {len(changed_slugs)} products: {', '.join(sorted(changed_slugs))}")

if __name__ == '__main__':
    main()
