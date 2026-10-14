import puppeteer from 'puppeteer-core';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });

  // Login
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
  await page.type('input[type="email"], input#email', 'owner@phongtro.local');
  await page.type('input[type="password"]', 'Owner123!');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));

  // Check /dashboard
  console.log('--- DASHBOARD ---');
  await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  const dashStats = await page.$$eval('.stat-card', els => els.map(e => e.innerText));
  console.log('Dashboard stats count:', dashStats.length);
  dashStats.forEach((s, i) => console.log(`Stat ${i}:`, s.replace(/\n/g, ' | ')));

  // Check /rooms
  console.log('--- ROOMS ---');
  await page.goto('http://localhost:5173/rooms', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  const tableRows = await page.$$eval('.room-table tr.ant-table-row', els => els.map(e => e.innerText.replace(/\n/g, ' | ')));
  console.log('Rooms table rows count:', tableRows.length);
  tableRows.forEach((r, i) => console.log(`Room ${i}:`, r));

  // Check /readings
  console.log('--- READINGS ---');
  await page.goto('http://localhost:5173/readings', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  const readingRows = await page.$$eval('tr.ant-table-row', els => els.map(e => e.innerText.replace(/\n/g, ' | ')));
  console.log('Readings rows count:', readingRows.length);
  readingRows.forEach((r, i) => console.log(`Reading ${i}:`, r));

  // Check /invoices
  console.log('--- INVOICES ---');
  await page.goto('http://localhost:5173/invoices', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  const invoiceRows = await page.$$eval('tr.ant-table-row', els => els.map(e => e.innerText.replace(/\n/g, ' | ')));
  console.log('Invoices rows count:', invoiceRows.length);
  invoiceRows.forEach((r, i) => console.log(`Invoice ${i}:`, r));

  // Check tenant link
  console.log('--- TENANT ---');
  await page.goto('http://localhost:5173/t/98TVqLYOadW2CTPrrMRbnpdNKSSfuxa4nWr2L2Y3E5w', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  const tenantCards = await page.$$eval('.tenant-invoice-card', els => els.map(e => e.innerText.replace(/\n/g, ' | ')));
  console.log('Tenant cards:', tenantCards);

  // Check tenant checkout
  console.log('--- TENANT CHECKOUT ---');
  await page.goto('http://localhost:5173/t/98TVqLYOadW2CTPrrMRbnpdNKSSfuxa4nWr2L2Y3E5w/invoices/2ec75d2d-deb4-423d-9bfd-b0b5af733d52/checkout', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  const checkoutQr = await page.$('.ant-qrcode, canvas, svg');
  console.log('Checkout QR element found:', !!checkoutQr);

  await browser.close();
}

run().catch(console.error);
