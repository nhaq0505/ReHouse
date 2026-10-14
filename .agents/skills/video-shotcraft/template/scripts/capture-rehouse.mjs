import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../public/textures/live');
const layoutPath = path.resolve(here, '../src/aifl/live-layout.json');

fs.mkdirSync(outDir, { recursive: true });

async function run() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });

  // 1. LOGIN
  console.log('Logging in...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
  await page.type('input[type="email"], input#email', 'owner@phongtro.local');
  await page.type('input[type="password"]', 'Owner123!');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));

  const pageBox = async (el) => {
    return await el.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height };
    });
  };

  const layout = { pageW: 1920 };

  // =========================================================================
  // 2. DASHBOARD
  // =========================================================================
  console.log('Capturing Dashboard...');
  await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, 'dashboard-full.png'), fullPage: true });

  // =========================================================================
  // 3. ROOMS (projects-full)
  // =========================================================================
  console.log('Capturing Rooms (projects-full)...');
  await page.goto('http://localhost:5173/rooms', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 1000));

  const roomsPageH = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: path.join(outDir, 'projects-full.png'), fullPage: true });

  // Get room cards / rows
  const roomRows = await page.$$('.room-table tr.ant-table-row');
  console.log(`Found ${roomRows.length} room rows`);

  const roomBoxes = [];
  for (let i = 0; i < roomRows.length; i++) {
    const box = await pageBox(roomRows[i]);
    const file = `card${i + 1}.png`;
    await roomRows[i].screenshot({ path: path.join(outDir, file) });
    const title = await roomRows[i].evaluate((el) => {
      const name = el.querySelector('.room-list-name strong')?.innerText || '';
      const tenant = el.querySelector('.room-list-tenant strong')?.innerText || '';
      return `${name} - ${tenant}`.trim();
    });
    roomBoxes.push({ file, ...box, title });
    console.log(`Captured ${file}:`, box, title);
  }

  // Capture 4x hires for Hero card (card 1 / P101)
  if (roomRows[0]) {
    await roomRows[0].screenshot({ path: path.join(outDir, 'card4-hires.png') });
  }

  // Header / nav
  const sider = await page.$('.app-sider');
  if (sider) {
    await sider.screenshot({ path: path.join(outDir, 'nav.png') });
  }

  // Float search / filter toolbar
  const toolbar = await page.$('.room-directory-toolbar');
  if (toolbar) {
    const box = await pageBox(toolbar);
    await toolbar.screenshot({ path: path.join(outDir, 'float-search.png') });
    console.log('Captured float-search:', box);
  }

  // Page header / title
  const pageHeading = await page.$('.rooms-workspace .page-heading, .rooms-workspace header');
  if (pageHeading) {
    await pageHeading.screenshot({ path: path.join(outDir, 'float-section.png') });
  }

  // Empty plate for rooms
  await page.evaluate(() => {
    const tbody = document.querySelector('.room-table tbody');
    if (tbody) tbody.style.visibility = 'hidden';
  });
  await page.screenshot({ path: path.join(outDir, 'projects-empty.png'), fullPage: true });
  await page.evaluate(() => {
    const tbody = document.querySelector('.room-table tbody');
    if (tbody) tbody.style.visibility = '';
  });

  layout.projects = {
    pageH: roomsPageH,
    header: { x: 0, y: 0, w: 1920, h: 64 },
    cards: roomBoxes,
    sections: [
      { text: "Danh sách phòng & người thuê", x: 280, y: 32, w: 320, h: 32 }
    ]
  };

  // =========================================================================
  // 4. INVOICES DETAIL (detail-full)
  // =========================================================================
  console.log('Capturing Invoices / Detail...');
  await page.goto('http://localhost:5173/invoices', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 1000));

  // Open invoice detail by clicking first "Chi tiết" button
  const detailButtons = await page.$$('.invoices-workspace button, .ant-table-row button');
  let openedDetail = false;
  for (const btn of detailButtons) {
    const text = await btn.evaluate((e) => e.innerText);
    if (/Chi tiết/i.test(text)) {
      await btn.click();
      openedDetail = true;
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 1000));

  const invoicePageH = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: path.join(outDir, 'detail-full.png'), fullPage: true });

  // Detail drawer / modal or rows
  const drawer = await page.$('.ant-drawer-body, .ant-modal-body, .ant-descriptions, .invoice-detail-content');
  if (drawer) {
    await drawer.screenshot({ path: path.join(outDir, 'detail-experiments.png') });
  }

  // Find rows in invoice drawer or table
  const detailRows = await page.$$('.ant-descriptions-item, .ant-drawer-body tr, .detail-row');
  const dRows = [];
  for (let i = 0; i < Math.min(detailRows.length, 5); i++) {
    dRows.push(await pageBox(detailRows[i]));
  }

  layout.detail = {
    pageH: invoicePageH,
    rows: dRows.length > 0 ? dRows : [
      { x: 300, y: 200, w: 1100, h: 80 },
      { x: 300, y: 290, w: 1100, h: 80 },
      { x: 300, y: 380, w: 1100, h: 80 },
      { x: 300, y: 470, w: 1100, h: 80 },
      { x: 300, y: 560, w: 1100, h: 80 }
    ],
    expPageH: invoicePageH
  };

  // =========================================================================
  // 5. READINGS (papers-full)
  // =========================================================================
  console.log('Capturing Readings (papers-full)...');
  await page.goto('http://localhost:5173/readings', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 1000));

  const readingsPageH = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: path.join(outDir, 'papers-full.png'), fullPage: true });

  const rRows = await page.$$('tr.ant-table-row');
  const readingCards = [];
  for (let i = 0; i < Math.min(rRows.length, 5); i++) {
    const file = `paper${i + 1}.png`;
    const box = await pageBox(rRows[i]);
    await rRows[i].screenshot({ path: path.join(outDir, file) });
    readingCards.push({ ...box, file });
    console.log(`Captured ${file}:`, box);
  }

  layout.papers = {
    pageH: readingsPageH,
    cards: readingCards.length > 0 ? readingCards : [
      { x: 280, y: 160, w: 1300, h: 72 },
      { x: 280, y: 240, w: 1300, h: 72 },
      { x: 280, y: 320, w: 1300, h: 72 },
      { x: 280, y: 400, w: 1300, h: 72 },
      { x: 280, y: 480, w: 1300, h: 72 }
    ]
  };

  // =========================================================================
  // 6. TENANT LINK & PAYOS CHECKOUT (wbr-full)
  // =========================================================================
  console.log('Capturing Tenant Link & PayOS Checkout (wbr-full)...');
  await page.goto('http://localhost:5173/t/98TVqLYOadW2CTPrrMRbnpdNKSSfuxa4nWr2L2Y3E5w', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, 'wbr-full.png'), fullPage: true });

  // Also capture checkout with PayOS QR
  await page.goto('http://localhost:5173/t/98TVqLYOadW2CTPrrMRbnpdNKSSfuxa4nWr2L2Y3E5w/invoices/2ec75d2d-deb4-423d-9bfd-b0b5af733d52/checkout', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(outDir, 'checkout-full.png'), fullPage: true });

  const qrCard = await page.$('.ant-card, .ant-qrcode, canvas');
  if (qrCard) {
    await qrCard.screenshot({ path: path.join(outDir, 'qr-card.png') });
    console.log('Captured qr-card.png');
  }

  layout.wbr = {
    pageH: 1080,
    blocks: [
      { x: 500, y: 140, w: 920, h: 60, tag: "h1" },
      { x: 500, y: 220, w: 920, h: 100, tag: "card" },
      { x: 500, y: 340, w: 920, h: 120, tag: "card" },
      { x: 500, y: 480, w: 920, h: 120, tag: "card" }
    ],
    leftRail: { x: 0, y: 0, w: 250, h: 1080 },
    rightRail: { x: 1600, y: 0, w: 320, h: 1080 }
  };

  layout.float = [
    { file: "float-search.png", x: 280, y: 100, w: 1350, h: 80 },
    { file: "float-filter.png", x: 1400, y: 100, w: 230, h: 80 },
    { file: "float-section.png", x: 280, y: 40, w: 600, h: 48 },
    { file: "float-stats.png", x: 280, y: 190, w: 1350, h: 80 }
  ];

  fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 1));
  console.log('Successfully wrote layout to', layoutPath);

  await browser.close();
  console.log('Capture completed successfully!');
}

run().catch((err) => {
  console.error('Error during capture:', err);
  process.exit(1);
});
