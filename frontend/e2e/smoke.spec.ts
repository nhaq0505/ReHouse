import { test, expect } from '@playwright/test';
const owner = {id:'fixture-owner',name:'Smoke Owner',email:'smoke@example.invalid',role:'Owner',status:'Approved'};
const dashboard = {totalRooms:0,occupiedRooms:0,totalBilled:0,totalPaid:0,totalOutstanding:0,pendingReadings:0,monthlyBilled:0,monthlyPaid:0,monthlyOutstanding:0,collectionRate:0,period:'2026-10'};
test('login enters the owner area and sends credentials only once', async ({page}) => {
  let authenticated=false, logins=0;
  await page.route('**/api/**', async route => {
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/login') {authenticated=true; logins++; return route.fulfill({json:owner});}
    if(path==='/api/auth/me') return route.fulfill({status:authenticated?200:401,json:authenticated?owner:{message:'Please sign in.'}});
    return route.fulfill({json:path==='/api/dashboard'?dashboard:[]});
  });
  await page.goto('/login');
  await page.getByLabel('Email',{exact:true}).fill(owner.email);
  await page.getByLabel('Mật khẩu',{exact:true}).fill('SmokeOwner123!');
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/dashboard/); expect(logins).toBe(1);
});
test('temporary session lookup failure offers retry instead of login redirect',async({page})=>{
  let failed=true;
  await page.route('**/api/**',route=>route.fulfill({status:failed?503:200,json:failed?{message:'Temporary failure'}:(route.request().url().endsWith('/me')?owner:dashboard)}));
  await page.goto('/dashboard'); await expect(page.getByRole('button',{name:'Thử lại'})).toBeVisible();
  await expect(page).toHaveURL(/dashboard/); failed=false;
  await page.getByRole('button',{name:'Thử lại'}).click();
  await expect(page.getByRole('button',{name:'Thử lại'})).toHaveCount(0);
});
test('expired session redirects to login',async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({status:401,json:{message:'Please sign in.'}}));
  await page.goto('/dashboard'); await expect(page).toHaveURL(/login/);
});
test('admin without MFA is gated into authenticator enrollment',async({page})=>{
  await page.route('**/api/auth/me',route=>route.fulfill({json:{...owner,role:'Admin',mfaRequired:true}}));
  await page.goto('/admin/owners'); await expect(page).toHaveURL(/mfa-setup/);
  await expect(page.getByRole('heading',{name:'Xác thực hai bước'})).toBeVisible();
});
test('invoice pagination uses server totals and requests the next page',async({page})=>{
  const pages:number[]=[];
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/auth/me') return route.fulfill({json:owner});
    if(url.pathname==='/api/invoices') {
      const number=Number(url.searchParams.get('page'));pages.push(number);
      return route.fulfill({json:{items:[{id:`invoice-${number}`,kind:'Monthly',roomName:`Page ${number}`,buildingName:'Fixture',tenantName:'Tenant',period:'2026-10',lifecycleState:'Issued',total:100,paid:0,outstanding:100,status:'Unpaid',depositSettlements:[]}],total:20,draftCount:0,totals:{billed:2000,paid:0,outstanding:2000}}});
    }
    return route.fulfill({json:[]});
  });
  await page.goto('/invoices'); await expect(page.getByText('Page 1',{exact:true})).toBeVisible();
  await page.locator('.ant-pagination-next').click();
  await expect(page.getByText('Page 2',{exact:true})).toBeVisible(); expect(pages).toContain(2);
});
test('checkout loads the selected older invoice directly',async({page})=>{
  const wanted='00000000-0000-0000-0000-000000000001';
  let selected=false;
  await page.route('**/api/tenant/**',route=>{
    const url=new URL(route.request().url());selected=url.searchParams.get('invoiceId')===wanted;
    return route.fulfill({json:{room:{name:'Older invoice room',buildingName:'Fixture'},occupancy:{},invoices:selected?[{id:wanted,kind:'Monthly',period:'2026-10',status:'Paid',outstanding:0,total:100,paid:100}]:[],total:1,totals:{outstanding:0}}});
  });
  await page.goto(`/t/fixture-private-token/invoices/${wanted}/checkout`);
  await expect(page.getByText('Đã thanh toán',{exact:true})).toBeVisible();expect(selected).toBe(true);
});
