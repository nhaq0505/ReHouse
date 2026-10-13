# MVP API contract

Backend: ASP.NET Core .NET 10 on port 5080. Frontend: React/TypeScript/Vite on port 5173, proxy `/api` to backend. JSON camelCase, UUID identifiers, decimal JSON numbers, errors `{ "message": "..." }`. Cookie authentication with HttpOnly cookies. Mutation requests use same-origin checks. No client-generated payment success.

## Authentication and approval

- `POST /api/auth/register` `{name,email,password,phone}` → user.
- `POST /api/auth/login` `{email,password}` → user.
- `GET /api/auth/me` → user; unauthenticated returns 401.
- `POST /api/auth/logout`.
- User: `{id,name,email,role,status}`; roles `Admin`, `Owner`; statuses `Pending`, `Approved`, `Rejected`, `Suspended`.
- `GET /api/admin/owners` → users including phone/reason when available.
- `POST /api/admin/owners/{id}/status` `{status,reason}`.

## Owner management

- `GET /api/dashboard` → `{totalRooms,occupiedRooms,totalBilled,totalPaid,totalOutstanding,pendingReadings}`.
- `GET /api/buildings`; `POST /api/buildings` `{name,address}`.
- `GET /api/rooms?period=YYYY-MM` (optional period selects the baseline shown); `GET /api/rooms/{id}`.
- `POST /api/rooms` `{buildingId,name,rent,electricityRate,waterFee,waterPerPerson,serviceFee,initialReading}`.
- `PATCH /api/rooms/{id}` updates name and fee settings.
- Room includes id, buildingId, buildingName, name, fee settings, previousReading and nullable occupancy `{id,tenantName,phone,people,startDate,token,url}`.
- `POST /api/rooms/{id}/occupancy` `{tenantName,phone,people,startDate,depositAmount}` (depositAmount optional, default 0; whole VND 0..2147483647).
- `POST /api/rooms/{id}/end-occupancy` ends active occupancy and revokes its guest token; debts remain attached to ended occupancy.
- `POST /api/rooms/{id}/rotate-link` → `{token,url}`.

## Readings and invoices

- `GET /api/readings?period=YYYY-MM` → readings including roomId, period, previousReading, currentReading, consumption.
- `POST /api/readings` `{roomId,period,currentReading}`. Reject decreases, out-of-order periods, duplicates or periods already invoiced. The reading must belong to the active occupancy and not predate its starting month or be in the future. Electricity calculation is `(currentReading - previousReading) * electricityRate`. A valid final reading automatically publishes its invoice transactionally.
- `GET /api/invoices?period=YYYY-MM`; `GET /api/invoices/{id}`.
- `POST /api/invoices/generate` `{period}` generates and publishes eligible invoices; repeat calls cannot duplicate them.
- Invoice: `{id,roomId,roomName,buildingName,period,tenantName,previousReading,currentReading,consumption,rent,electricityAmount,waterAmount,serviceAmount,total,paid,outstanding,status,dueDate,issuedAt}`. Status `Unpaid`, `Partial`, `Paid`. Amounts rounded to VND.
- `POST /api/invoices/{id}/receipts` `{amount,note,idempotencyKey}` records cash/external bank transfer; positive amount cannot exceed remaining balance. Returns a receipt summary `{id,invoiceId,amount,paid,outstanding,status}`. Reusing the key with the same payload returns the existing receipt; a different payload conflicts. Pending online payment attempts must be reconciled before recording external receipts.

## Payments and guest access

- `GET /api/settings/payment` → `{configured,clientId,webhookUrl,webhookStatus,webhookVerifiedAt,webhookError}` (never return API key/checksum key). Status: `NotConfigured`, `Unverified`, `Verified`, `Failed`.
- `PUT /api/settings/payment` `{clientId,apiKey,checksumKey}`; encrypt and commit settings, then automatically register/verify the server-configured HTTPS callback with payOS. Blank keys retain existing keys. Returns the same DTO; verification failure is reported in the DTO without discarding saved keys.
- `POST /api/settings/payment/verify-webhook` retries confirmation using saved keys, returning the same DTO. Owner authorization, approval, CSRF origin checks and rate limiting apply. Callback URL cannot be supplied by the client. A changed credential revision/origin invalidates earlier verification.
- `GET /api/tenant/{token}` → `{room,occupancy,invoices}` restricted to that occupancy.
- `POST /api/tenant/{token}/invoices/{id}/payment` → `{checkoutUrl,qrCode,amount,orderCode,accountName,accountNumber,bankBin,description,status,expiresAt}`. `qrCode` and account/description fields may be null; `expiresAt` is Unix seconds or null. `amount` is the outstanding VND amount, and `status` is the local attempt state (`pending`, `paid`, `expired`, `cancelled` or `failed`). The checkout link, QR payload and bank metadata are persisted only after the signed payOS create response has the expected order code and amount. Missing real credentials is a clear configuration error, never simulated success.
- Pending orders are reused; the endpoint does not create a second payOS order while one is pending. Older pending rows may have `qrCode:null` and still return their saved `checkoutUrl`. The tenant portal navigates to a dedicated Rehouse checkout page at `/t/{token}/invoices/{id}/checkout` (with `/tenant/{token}/invoices/{id}/checkout` as an alias), preserving the current query string such as `lang`. The route revalidates the tenant overview and scopes the invoice before creating/reusing checkout once per route mount; missing or already-paid invoices do not start checkout. The back link returns to the tenant overview with its query string. A QR payload renders on Rehouse; a QR-less legacy attempt can expose an explicit hosted-checkout link only for an HTTPS `pay.payos.vn` URL. Rehouse never redirects automatically. Expiry hides QR/hosted actions while the order is being checked.
- `POST /api/tenant/{token}/invoices/{id}/reconcile` → `{status,invoice}`. A provider `PAID` status or browser return alone does not mark an invoice paid: reconciliation must verify the expected paid amount and transaction before recording the receipt. The checkout page displays success only from the updated invoice. It polls while the page is active and the tab is visible, and also offers manual checking.
- `POST /api/payments/webhook/{ownerId}` verifies payOS signature and reconciles exact order, owner and amount transactionally with replay protection. Repeated valid callbacks are idempotent; mismatched amounts are rejected without a second receipt.
- `GET /api/health`.

## Delivery defaults

Manual meter entry only. AI and camera are deferred. Valid manual reading submissions automatically publish invoices; batch generation and the daily sweep reuse the same idempotent service. Default due date is the fifth day of the following month. Use PostgreSQL in Docker, SQLite for convenient local development. Seed demo data only via an explicit development flag. No deployment or live money transfers performed by coding agents.


## Deposits

Starting occupancy with depositAmount > 0 atomically creates one unpaid Deposit invoice.
Invoices include kind (Monthly/Deposit), occupancyId, depositHeld and depositSettlements.
Occupancy includes depositInvoiceId, depositRequired, depositPaid and depositHeld.
Monthly invoices retain their normal room/period uniqueness; deposits are unique per occupancy.
Guest payment/manual receipt endpoints support both kinds. Dashboard financial totals use Monthly invoices.

`POST /api/invoices/{id}/deposit-settlements` body:
`{kind:"Refund"|"Deduction",amount,reason,idempotencyKey,targetInvoiceId?}`.
Returns updated InvoiceDto. GUID idempotency key required; exact replay is unchanged,
changed payload with same key conflicts (409). Positive whole VND cannot exceed held funds.
Refund records money already returned externally; it does not initiate a bank transfer.
Deduction optionally credits an outstanding Monthly invoice belonging to the same owner/occupancy;
amount cannot exceed that debt. Pending online attempts must first be reconciled.
Moveout is blocked until held deposit is fully settled. Deposit Paid preserves collection history.


## Supplemental invoices

`POST /api/rooms/{id}/supplemental-invoices` body:
`{requestId:GUID,occupancyId:GUID,description:string,amount:integer,dueDate:"YYYY-MM-DD"}`.
Owner must own room, occupancy must be current active tenant. Description trimmed 1..500,
amount 1..2147483647 whole VND, valid nondefault dueDate required.
Returns InvoiceDto with kind=Supplemental, description, paid=0, period=current issue month.
requestId is the invoice UUID: exact retry returns prior invoice; altered payload conflicts (409).
Multiple supplemental invoices per room/month are supported. Old monthly/deposit rules unchanged.
Same receipt/payOS/guest endpoints apply. Dashboard totals include Supplemental and Monthly.
No edit/delete supplemental endpoint yet; deposit debt deductions currently target Monthly only.


## Moveout settlement

GET /api/rooms/{id}/moveout → {occupancyId,tenantName,roomName,electricityRate,meterBaseline,invoices,pendingInvoiceIds}.
POST /api/rooms/{id}/final-invoice {requestId,occupancyId,currentReading,additionalAmount,description?}
creates a Supplemental invoice with isFinalMeterReading=true; meter delta only, no automatic rent.
Meter max1e9/3dp, additional integer VND0..2147483647, description≤450 and required when additional>0.
Exactly one final invoice per occupancy; exact request replay is unchanged, mismatch conflicts.
Zero total yields Paid without an artificial receipt. Meter entry after finalization is rejected.
InvoiceDto includes isFinalMeterReading. Supplemental final invoices show electricity and extra fee breakdown.
Deposit settlement target now permits Monthly/Supplemental of the same occupancy.
POST /api/rooms/{id}/complete-moveout {occupancyId,finalInvoiceId} checks final invoice,
no pending attempts, no outstanding non-deposit debt and no held deposit; updates meter baseline,
ends occupancy and revokes token transactionally. Replay after completion does not close a new occupant.
Legacy end-occupancy remains compatible but blocks debt after a final invoice was created.
