#!/usr/bin/env python3
import csv
import sys
sys.path.insert(0, '/workspace')

# Read CSV and score products
with open('data/manual_catalog.csv', 'r') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

# Use the Go scoring (we'll parse from score_compare output)
# For now, let's analyze which products are partial-spec

partial_spec_products = []
full_spec_products = []

for row in rows:
    lumens = row['max_lumens'].strip()
    candela = row['max_candela'].strip()
    beam = row['beam_distance_m'].strip()
    runtime = row['runtime_max_min'].strip()
    
    has_lumens = bool(lumens)
    has_candela = bool(candela)
    has_beam = bool(beam)
    has_runtime = bool(runtime)
    
    is_full_spec = has_lumens and (has_candela or has_beam) and has_runtime
    
    product = f"{row['brand_name']} {row['model_name']}"
    
    if is_full_spec:
        full_spec_products.append(product)
    else:
        partial_spec_products.append(product)

print(f"Full-spec products: {len(full_spec_products)}")
print(f"Partial-spec products: {len(partial_spec_products)}")
print(f"\nPartial-spec products:")
for p in sorted(partial_spec_products)[:20]:
    print(f"  - {p}")
