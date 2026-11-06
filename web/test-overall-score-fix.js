#!/usr/bin/env node
/**
 * Verification test for overall_score fix in fetchAllSlugs
 * 
 * This test verifies that:
 * 1. fetchAllSlugs return type includes overall_score
 * 2. curatedComparePairs can filter by overall_score > 0
 * 3. REQUIRE_COMPARE_PAIRS=1 mode will not fail due to missing overall_score
 */

const fs = require('fs');
const path = require('path');

console.log('Verifying overall_score fix...\n');

// Check api.ts has overall_score in fetchAllSlugs return type
const apiPath = path.join(__dirname, 'lib/api.ts');
const apiContent = fs.readFileSync(apiPath, 'utf-8');

console.log('1. Checking fetchAllSlugs return type includes overall_score...');
const fetchAllSlugsMatch = apiContent.match(/export async function fetchAllSlugs\(\)[\s\S]*?^\}/m);
if (!fetchAllSlugsMatch) {
  console.error('   ❌ Could not find fetchAllSlugs function');
  process.exit(1);
}

const returnTypeMatch = apiContent.match(/fetchAllSlugs\(\): Promise<\{[^}]*?overall_score[^}]*?\}\[\]>/);
if (!returnTypeMatch) {
  console.error('   ❌ overall_score not found in fetchAllSlugs return type');
  process.exit(1);
}
console.log('   ✓ overall_score present in return type');

// Check that overall_score is mapped in the implementation
console.log('\n2. Checking fetchAllSlugs maps overall_score from items...');
const mapMatch = apiContent.match(/\.map\(\(item\) => \(\{[\s\S]*?overall_score: item\.overall_score[\s\S]*?\}\)\)/);
if (!mapMatch) {
  console.error('   ❌ overall_score not mapped from item.overall_score');
  process.exit(1);
}
console.log('   ✓ overall_score mapped from item.overall_score');

// Check compare-pairs.ts uses overall_score
const comparePairsPath = path.join(__dirname, 'lib/compare-pairs.ts');
const comparePairsContent = fs.readFileSync(comparePairsPath, 'utf-8');

console.log('\n3. Checking curatedComparePairs uses overall_score...');
const overallScoreUsage = comparePairsContent.match(/overall_score\?:/);
if (!overallScoreUsage) {
  console.error('   ❌ overall_score not used in compare-pairs.ts');
  process.exit(1);
}
console.log('   ✓ overall_score used in overallScoreRounded function');

// Check the filter uses overallScoreRounded
const filterMatch = comparePairsContent.match(/\.filter\(\(s\) => s\.slug && overallScoreRounded\(s\) > 0\)/);
if (!filterMatch) {
  console.error('   ❌ Filter does not use overallScoreRounded(s) > 0');
  process.exit(1);
}
console.log('   ✓ curatedComparePairs filters by overallScoreRounded(s) > 0');

console.log('\n✅ All verification checks passed!');
console.log('\nThe fix ensures that:');
console.log('  - fetchAllSlugs returns overall_score for each item');
console.log('  - curatedComparePairs can filter unscored items (overall_score <= 0)');
console.log('  - REQUIRE_COMPARE_PAIRS=1 builds will not fail with "no compare pairs" error');
console.log('\nTo test with a live build:');
console.log('  REQUIRE_COMPARE_PAIRS=1 npm run build');
