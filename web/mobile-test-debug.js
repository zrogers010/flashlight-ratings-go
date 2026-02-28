const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const screenshotsDir = path.join(__dirname, 'mobile-screenshots');
  
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();

  console.log('Debug: Testing mobile menu visibility...\n');

  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // Check if hamburger exists
  const hamburger = page.locator('.hamburger');
  const hamburgerCount = await hamburger.count();
  console.log(`Hamburger button count: ${hamburgerCount}`);

  if (hamburgerCount > 0) {
    // Check if it's visible
    const isVisible = await hamburger.isVisible();
    console.log(`Hamburger visible: ${isVisible}`);

    // Click it
    await hamburger.click();
    console.log('Clicked hamburger');

    // Wait for animation
    await page.waitForTimeout(500);

    // Check mobile nav
    const mobileNav = page.locator('.mobile-nav');
    const mobileNavCount = await mobileNav.count();
    console.log(`Mobile nav count: ${mobileNavCount}`);

    if (mobileNavCount > 0) {
      const navVisible = await mobileNav.isVisible();
      console.log(`Mobile nav visible: ${navVisible}`);

      const navClasses = await mobileNav.getAttribute('class');
      console.log(`Mobile nav classes: ${navClasses}`);

      // Check computed styles
      const transform = await mobileNav.evaluate(el => {
        const style = window.getComputedStyle(el);
        return {
          transform: style.transform,
          visibility: style.visibility,
          display: style.display,
          zIndex: style.zIndex,
          position: style.position,
          right: style.right,
          width: style.width
        };
      });
      console.log('Mobile nav computed styles:', JSON.stringify(transform, null, 2));
    }

    // Check backdrop
    const backdrop = page.locator('.mobile-backdrop');
    const backdropCount = await backdrop.count();
    console.log(`Backdrop count: ${backdropCount}`);

    if (backdropCount > 0) {
      const backdropVisible = await backdrop.isVisible();
      console.log(`Backdrop visible: ${backdropVisible}`);

      const backdropStyles = await backdrop.evaluate(el => {
        const style = window.getComputedStyle(el);
        return {
          display: style.display,
          zIndex: style.zIndex,
          background: style.background,
          position: style.position
        };
      });
      console.log('Backdrop computed styles:', JSON.stringify(backdropStyles, null, 2));
    }

    // Take screenshot with menu open
    await page.screenshot({ path: path.join(screenshotsDir, 'debug-menu-open.png'), fullPage: false });
    console.log('Screenshot saved: debug-menu-open.png');

    // Get all links in mobile nav
    const links = await page.locator('.mobile-nav a').allTextContents();
    console.log(`Mobile nav links: ${links.join(', ')}`);
  }

  await browser.close();
})();
