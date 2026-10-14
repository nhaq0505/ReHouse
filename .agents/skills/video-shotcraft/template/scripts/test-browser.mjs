import puppeteer from 'puppeteer-core';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });

  console.log('Title:', await page.title());

  // Fill login
  await page.type('input#email, input[type="email"], input[placeholder*="email" i]', 'owner@phongtro.local');
  await page.type('input#password, input[type="password"]', 'Owner123!');
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));
  console.log('Current URL after login:', page.url());

  await browser.close();
  console.log('Done test!');
}

run().catch(console.error);
