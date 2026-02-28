const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const screenshotsDir = path.join(__dirname, 'mobile-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();

  console.log('Testing mobile viewport (390x844)...\n');

  // 1. Homepage
  console.log('1. Loading homepage...');
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(screenshotsDir, '1-homepage.png'), fullPage: true });
  console.log('   ✓ Screenshot saved: 1-homepage.png');

  // 2. Open hamburger menu
  console.log('2. Opening hamburger menu...');
  const hamburger = await page.locator('button[aria-label*="menu"], button:has-text("☰"), button.hamburger, [class*="hamburger"]').first();
  if (await hamburger.count() > 0) {
    await hamburger.click();
    await page.waitForTimeout(500); // Wait for animation
    await page.screenshot({ path: path.join(screenshotsDir, '2-mobile-menu-open.png'), fullPage: true });
    console.log('   ✓ Screenshot saved: 2-mobile-menu-open.png');
    console.log('   ✓ Hamburger menu found and clicked');
  } else {
    console.log('   ✗ Hamburger menu button not found');
    await page.screenshot({ path: path.join(screenshotsDir, '2-no-hamburger.png'), fullPage: true });
  }

  // 3. Close menu by clicking backdrop or X
  console.log('3. Closing mobile menu...');
  const backdrop = await page.locator('[class*="backdrop"], [class*="overlay"], .mobile-nav-backdrop').first();
  const closeButton = await page.locator('button[aria-label*="close"], button:has-text("×"), button:has-text("✕")').first();
  
  if (await backdrop.count() > 0) {
    await backdrop.click();
    await page.waitForTimeout(500);
    console.log('   ✓ Menu closed via backdrop');
  } else if (await closeButton.count() > 0) {
    await closeButton.click();
    await page.waitForTimeout(500);
    console.log('   ✓ Menu closed via close button');
  } else {
    console.log('   ✗ No backdrop or close button found');
  }
  await page.screenshot({ path: path.join(screenshotsDir, '3-menu-closed.png'), fullPage: true });
  console.log('   ✓ Screenshot saved: 3-menu-closed.png');

  // 4. Rankings page
  console.log('4. Loading /rankings page...');
  await page.goto('http://localhost:3000/rankings');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(screenshotsDir, '4-rankings.png'), fullPage: true });
  console.log('   ✓ Screenshot saved: 4-rankings.png');

  // 5. Flashlight detail page
  console.log('5. Loading /flashlights/1 page...');
  await page.goto('http://localhost:3000/flashlights/1');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(screenshotsDir, '5-detail-top.png'), fullPage: false });
  console.log('   ✓ Screenshot saved: 5-detail-top.png');

  // 6. Scroll down on detail page
  console.log('6. Scrolling down on detail page...');
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(screenshotsDir, '6-detail-scrolled.png'), fullPage: false });
  console.log('   ✓ Screenshot saved: 6-detail-scrolled.png');

  // Full page screenshot of detail
  await page.goto('http://localhost:3000/flashlights/1');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(screenshotsDir, '7-detail-full.png'), fullPage: true });
  console.log('   ✓ Screenshot saved: 7-detail-full.png (full page)');

  await browser.close();
  console.log('\n✓ All screenshots saved to:', screenshotsDir);
  console.log('\nChecking for common mobile issues:');
  console.log('- Hamburger menu visibility');
  console.log('- Single column product cards');
  console.log('- Buy box positioning');
  console.log('- Text overflow');
  console.log('- Footer stacking');
})();
