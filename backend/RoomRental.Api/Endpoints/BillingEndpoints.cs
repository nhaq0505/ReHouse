using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RoomRental.Api.Data;
using RoomRental.Api.Domain;
using RoomRental.Api.Services;

namespace RoomRental.Api.Endpoints;

public static class BillingEndpoints
{
    public static void MapBillingEndpoints(this WebApplication app)
    {
        var routes = app.MapGroup("/api").RequireAuthorization(policy => policy.RequireRole("Owner"));

        routes.MapGet("/subscription", async (HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var owner = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == ownerId, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Owner was not found.");
            var currentRooms = await (from r in db.Rooms.AsNoTracking()
                                      join b in db.Buildings.AsNoTracking() on r.BuildingId equals b.Id
                                      where b.OwnerId == ownerId && r.ArchivedAt == null && b.ArchivedAt == null
                                      select r.Id).CountAsync(cancellationToken);

            return Results.Ok(new SubscriptionStatusDto(
                owner.SubscriptionTier.ToString(),
                owner.IsPro,
                owner.SubscriptionExpiresAt,
                currentRooms,
                owner.MaxRooms,
                PayOsService.DefaultPackages
            ));
        });

        routes.MapPost("/subscription/upgrade", async (CreateSubscriptionCheckoutRequest request, HttpContext context, PayOsService payOsService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var checkout = await payOsService.CreateSubscriptionCheckoutAsync(ownerId, request.PackageId, cancellationToken);
            return Results.Ok(checkout);
        }).RequireRateLimiting("tenant-payment");

        routes.MapPost("/subscription/reconcile/{orderCode:long}", async (long orderCode, HttpContext context, PayOsService payOsService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var result = await payOsService.ReconcileSubscriptionOrderAsync(ownerId, orderCode, cancellationToken);
            return Results.Ok(result);
        }).RequireRateLimiting("tenant-payment");

        routes.MapGet("/readings", async (string? period, HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var requestedPeriod = period is null ? OwnerManagementEndpoints.CurrentVietnamPeriod() : ApiSupport.NormalizePeriod(period);
            var rows = await (from reading in db.Readings.AsNoTracking()
                              join room in db.Rooms.AsNoTracking() on reading.RoomId equals room.Id
                              join building in db.Buildings.AsNoTracking() on room.BuildingId equals building.Id
                              where building.OwnerId == ownerId && reading.Period == requestedPeriod
                              orderby building.Name, room.Name
                              select new { Reading = reading, Room = room, Building = building })
                .ToListAsync(cancellationToken);
            var occupancyIds = rows.Select(row => row.Reading.OccupancyId).Distinct().ToList();
            var invoices = await db.Invoices.AsNoTracking().Include(x => x.DepositSettlements)
                .Where(row => occupancyIds.Contains(row.OccupancyId) && row.Period == requestedPeriod && row.Kind == "Monthly")
                .ToDictionaryAsync(row => row.OccupancyId, cancellationToken);
            var result = rows.Select(row =>
            {
                invoices.TryGetValue(row.Reading.OccupancyId, out var invoice);
                return new ReadingDto(row.Reading.Id, row.Room.Id, row.Reading.OccupancyId, row.Room.Name, row.Building.Name,
                    row.Reading.Period, row.Reading.PreviousReading, row.Reading.CurrentReading, row.Reading.Consumption,
                    row.Reading.RecordedAt, invoice is null ? null : InvoiceService.ToDto(invoice), invoice?.LifecycleState.ToString() ?? "Issued");
            }).ToList();
            return Results.Ok(result);
        });

        routes.MapPost("/readings/preview", async (ReadingRequest request, HttpContext context, AppDbContext db, CancellationToken ct) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var work = await PrepareReadingAsync(db, ownerId, request, ct);
            var rent = ApiSupport.RoundVnd(work.Room.Rent);
            var electricity = ApiSupport.RoundVnd(work.Consumption * work.Room.ElectricityRate);
            var water = ApiSupport.RoundVnd(work.Room.WaterPerPerson ? work.Room.WaterFee * work.Occupancy.People : work.Room.WaterFee);
            var service = ApiSupport.RoundVnd(work.Room.ServiceFee);
            var total = InvoiceService.ValidateTotal(rent, electricity, water, service);
            return Results.Ok(new ReadingPreviewDto(work.Room.Id, work.Occupancy.Id, work.Period, work.BillingStartDate,
                work.BillingEndDate, work.BillableDays, work.MonthDays, rent, work.PreviousReading, work.CurrentReading,
                work.Consumption, work.Room.ElectricityRate, electricity, work.Room.WaterFee, work.Room.WaterPerPerson,
                water, work.Room.ServiceFee, service, total));
        });

        routes.MapPost("/readings", async (ReadingRequest request, HttpContext context, AppDbContext db, InvoiceService invoiceService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            var work = await PrepareReadingAsync(db, ownerId, request, cancellationToken);
            var reading = new MonthlyReading
            {
                OccupantsCount = work.Occupancy.People,
                RoomId = work.Room.Id,
                OccupancyId = work.Occupancy.Id,
                Period = work.Period,
                PreviousReading = work.PreviousReading,
                CurrentReading = work.CurrentReading,
                Consumption = work.Consumption,
                MonthlyRentRate = work.Room.Rent,
                ElectricityRate = work.Room.ElectricityRate,
                WaterRate = work.Room.WaterFee,
                WaterPerPerson = work.Room.WaterPerPerson,
                ServiceRate = work.Room.ServiceFee,
                BillingStartDate = work.BillingStartDate,
                BillingEndDate = work.BillingEndDate,
                BillableDays = work.BillableDays,
                MonthDays = work.MonthDays,
                RecordedAt = DateTimeOffset.UtcNow
            };
            db.Readings.Add(reading);
            await db.SaveChangesAsync(cancellationToken);
            Invoice invoice;
            await invoiceService.GenerateForOwnerAsync(ownerId, work.Period, cancellationToken);
            invoice = await db.Invoices.Include(x => x.DepositSettlements)
                .SingleAsync(x => x.OccupancyId == work.Occupancy.Id && x.Period == work.Period && x.Kind == "Monthly", cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/readings?period={work.Period}", new ReadingDto(reading.Id, work.Room.Id, work.Occupancy.Id,
                work.Room.Name, work.Building.Name, reading.Period, reading.PreviousReading, reading.CurrentReading,
                reading.Consumption, reading.RecordedAt, InvoiceService.ToDto(invoice), invoice.LifecycleState.ToString()));
        });

        routes.MapGet("/invoices", async (string? period, string? kind, string? lifecycleState, string? status, string? search, HttpContext context, AppDbContext db, TenantTokenService tokenService, PaymentWebhookService webhookService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var query = db.Invoices.Include(x => x.DepositSettlements).AsNoTracking().Where(row => row.OwnerId == ownerId);
            if (!string.IsNullOrWhiteSpace(period))
            {
                var requestedPeriod = ApiSupport.NormalizePeriod(period);
                query = query.Where(row => row.Period == requestedPeriod);
            }
            if (!string.IsNullOrWhiteSpace(kind)) query = query.Where(row => row.Kind == kind.Trim());
            if (!string.IsNullOrWhiteSpace(lifecycleState))
            {
                if (!Enum.TryParse<InvoiceLifecycleState>(lifecycleState, true, out var lifecycle) || !Enum.IsDefined(lifecycle))
                    throw new ApiException(400, "Trạng thái phát hành hóa đơn không hợp lệ.");
                query = query.Where(row => row.LifecycleState == lifecycle);
            }
            if (!string.IsNullOrWhiteSpace(status))
            {
                if (!Enum.TryParse<InvoiceStatus>(status, true, out var invoiceStatus) || !Enum.IsDefined(invoiceStatus))
                    throw new ApiException(400, "Trạng thái thanh toán hóa đơn không hợp lệ.");
                query = query.Where(row => row.Status == invoiceStatus);
            }
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim().ToLower();
                query = query.Where(row => row.RoomName.ToLower().Contains(term) ||
                    row.BuildingName.ToLower().Contains(term) || row.TenantName.ToLower().Contains(term));
            }
            var rows = await query.OrderByDescending(row => row.Period).ThenBy(row => row.BuildingName).ThenBy(row => row.RoomName)
                .ToListAsync(cancellationToken);
            var pendingIds = await db.PayOsAttempts.AsNoTracking().Where(x => x.OwnerId == ownerId && x.Status == PaymentAttemptStatus.Pending)
                .Select(x => x.InvoiceId).ToListAsync(cancellationToken);
            var pending = pendingIds.ToHashSet();

            var occupancyIds = rows.Select(x => x.OccupancyId).Distinct().ToList();
            var occupancies = await db.Occupancies.AsNoTracking()
                .Where(x => occupancyIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, cancellationToken);

            var canShareTenantLink = await tokenService.CanShareAsync(ownerId, webhookService, cancellationToken);
            return Results.Ok(rows.Select(row =>
            {
                var token = canShareTenantLink && occupancies.TryGetValue(row.OccupancyId, out var occ) ? tokenService.Unprotect(occ) : null;
                return InvoiceService.ToDto(row, pending.Contains(row.Id), tenantToken: token);
            }).ToList());
        });

        routes.MapPost("/rooms/{id:guid}/supplemental-invoices", async (Guid id, SupplementalInvoiceRequest request,
            HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var description = request.Description?.Trim();
            if (request.RequestId == Guid.Empty || request.OccupancyId == Guid.Empty || string.IsNullOrWhiteSpace(description) || description.Length > 500 ||
                request.Amount <= 0 || request.Amount > int.MaxValue || request.Amount != decimal.Truncate(request.Amount) || request.DueDate == default)
                throw new ApiException(StatusCodes.Status400BadRequest, "Nhập nội dung, số tiền nguyên VND và hạn thanh toán hợp lệ.");
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            var (room, building) = await OwnerManagementEndpoints.FindRoomAsync(db, ownerId, id, cancellationToken);
            var existing = await db.Invoices.SingleOrDefaultAsync(x => x.Id == request.RequestId, cancellationToken);
            if (existing is not null)
            {
                if (existing.OwnerId != ownerId || existing.RoomId != id || existing.OccupancyId != request.OccupancyId || existing.Kind != "Supplemental" ||
                    existing.Total != request.Amount || existing.Description != description || existing.DueDate != request.DueDate)
                    throw new ApiException(StatusCodes.Status409Conflict, "Mã yêu cầu đã được dùng cho hóa đơn khác.");
                await transaction.CommitAsync(cancellationToken);
                return Results.Ok(InvoiceService.ToDto(existing));
            }
            var occupancy = await db.Occupancies.SingleOrDefaultAsync(x => x.Id == request.OccupancyId && x.RoomId == id && x.IsActive, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status409Conflict, "Người thuê đã thay đổi hoặc phòng chưa có người thuê. Vui lòng tải lại danh sách.");
            var invoice = new Invoice
            {
                Id = request.RequestId, OwnerId = ownerId, RoomId = id, BuildingId = building.Id, OccupancyId = occupancy.Id,
                Kind = "Supplemental", Description = description, RoomName = room.Name, BuildingName = building.Name,
                TenantName = occupancy.TenantName, Period = OwnerManagementEndpoints.CurrentVietnamPeriod(),
                Total = request.Amount, DueDate = request.DueDate
            };
            db.Invoices.Add(invoice);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/invoices/{invoice.Id}", InvoiceService.ToDto(invoice));
        });

        routes.MapPost("/invoices/generate", async (GenerateInvoiceRequest request, HttpContext context, InvoiceService invoiceService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var period = ApiSupport.NormalizePeriod(request.Period);
            var result = await invoiceService.GenerateForOwnerAsync(ownerId, period, cancellationToken);
            return Results.Ok(new { created = result.Created, skipped = result.Skipped, period });
        });

        routes.MapGet("/invoices/{id:guid}", async (Guid id, HttpContext context, AppDbContext db, TenantTokenService tokenService, PaymentWebhookService webhookService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var invoice = await db.Invoices.Include(x => x.DepositSettlements).AsNoTracking().SingleOrDefaultAsync(row => row.Id == id && row.OwnerId == ownerId, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Invoice was not found.");
            var pending = await db.PayOsAttempts.AsNoTracking().AnyAsync(x => x.OwnerId == ownerId && x.InvoiceId == id && x.Status == PaymentAttemptStatus.Pending, cancellationToken);
            var meterPolicy = await MeterCorrectionPolicyAsync(db, invoice, cancellationToken);
            var occupancy = await db.Occupancies.AsNoTracking().SingleOrDefaultAsync(x => x.Id == invoice.OccupancyId, cancellationToken);
            var token = occupancy is not null && await tokenService.CanShareAsync(invoice.OwnerId, webhookService, cancellationToken)
                ? tokenService.Unprotect(occupancy) : null;
            return Results.Ok(InvoiceService.ToDto(invoice, pending, meterPolicy.Allowed, meterPolicy.Reason, tenantToken: token));
        });

        routes.MapPost("/invoices/{id:guid}/publish", async (Guid id, PublishInvoiceRequest request, HttpContext context, AppDbContext db, CancellationToken ct) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            if (request.RequestId == Guid.Empty || request.ExpectedVersion < 1)
                throw new ApiException(400, "Mã yêu cầu và phiên bản hóa đơn hợp lệ là bắt buộc.");
            var amounts = new[] { request.Rent, request.ElectricityAmount, request.WaterAmount, request.ServiceAmount };
            var total = InvoiceService.ValidateTotal(amounts);
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var invoice = await db.Invoices.Include(x => x.DepositSettlements).SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == ownerId, ct)
                ?? throw new ApiException(404, "Invoice was not found.");
            var reason = string.IsNullOrWhiteSpace(request.Reason) ? "Owner published the partial-month draft." : request.Reason.Trim();
            if (reason.Length > 1000) throw new ApiException(400, "Reason must be 1,000 characters or fewer.");
            var fingerprint = Fingerprint(new { request.ExpectedVersion, request.Rent, request.ElectricityAmount, request.WaterAmount, request.ServiceAmount, reason });
            var priorRevision = await db.InvoiceRevisions.SingleOrDefaultAsync(x => x.InvoiceId == id && x.RequestId == request.RequestId, ct);
            if (priorRevision is not null)
            {
                if (priorRevision.RequestFingerprint != fingerprint) throw new ApiException(409, "This request ID was already used for different invoice changes.");
                await transaction.CommitAsync(ct);
                return Results.Ok(InvoiceService.ToDto(invoice));
            }
            if (invoice.LifecycleState != InvoiceLifecycleState.Draft || invoice.Kind != "Monthly")
                throw new ApiException(409, "Only a monthly draft can be published.");
            if (invoice.Version != request.ExpectedVersion) throw new ApiException(409, "Invoice changed. Refresh it and retry.");
            if (invoice.Paid != 0 || await db.Receipts.AnyAsync(x => x.InvoiceId == id, ct))
                throw new ApiException(409, "A draft with a recorded payment cannot be edited or published.");
            if (await db.PayOsAttempts.AnyAsync(x => x.InvoiceId == id && x.Status == PaymentAttemptStatus.Pending, ct))
                throw new ApiException(409, "Reconcile the pending payOS attempt before publishing this invoice.");

            var before = SerializeSnapshot(invoice);
            invoice.Rent = request.Rent;
            invoice.ElectricityAmount = request.ElectricityAmount;
            invoice.WaterAmount = request.WaterAmount;
            invoice.ServiceAmount = request.ServiceAmount;
            invoice.Total = total;
            invoice.LifecycleState = InvoiceLifecycleState.Issued;
            invoice.Version++;
            InvoiceService.RecalculateStatus(invoice);
            var after = SerializeSnapshot(invoice);
            await AddRevisionAsync(db, invoice, request.RequestId, fingerprint, reason, ApiSupport.UserId(context), before, after, ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.Ok(InvoiceService.ToDto(invoice));
        });

        routes.MapGet("/invoices/{id:guid}/corrections", async (Guid id, HttpContext context, AppDbContext db, CancellationToken ct) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var invoice = await db.Invoices.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == ownerId, ct)
                ?? throw new ApiException(404, "Invoice was not found.");
            var revisions = await (from revision in db.InvoiceRevisions.AsNoTracking()
                                   join actor in db.Users.AsNoTracking() on revision.ActorId equals actor.Id
                                   where revision.InvoiceId == id
                                   orderby revision.Revision
                                   select new InvoiceCorrectionDto(revision.Id, revision.Revision, revision.RequestId, revision.Reason,
                                       revision.ActorId, actor.Name, revision.CreatedAt, revision.Version, revision.BeforeJson, revision.AfterJson))
                .ToListAsync(ct);
            var pending = await db.PayOsAttempts.AsNoTracking().AnyAsync(x => x.OwnerId == ownerId && x.InvoiceId == id && x.Status == PaymentAttemptStatus.Pending, ct);
            var meterPolicy = await MeterCorrectionPolicyAsync(db, invoice, ct);
            return Results.Ok(new { invoiceId = id, version = invoice.Version, hasPendingPayment = pending,
                canCorrectMeter = meterPolicy.Allowed, meterCorrectionBlockedReason = meterPolicy.Reason, items = revisions });
        });

        routes.MapPost("/invoices/{id:guid}/corrections", async (Guid id, InvoiceCorrectionRequest request, HttpContext context, AppDbContext db, CancellationToken ct) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var actorId = ApiSupport.UserId(context);
            var reason = request.Reason?.Trim();
            if (request.RequestId == Guid.Empty || request.ExpectedVersion < 1 || string.IsNullOrWhiteSpace(reason) || reason.Length > 1000)
                throw new ApiException(400, "Mã yêu cầu, phiên bản và lý do hợp lệ là bắt buộc.");
            if (request.Description is { Length: > 500 }) throw new ApiException(400, "Description must be 500 characters or fewer.");
            if (request.CurrentReading is < 0 or > 1_000_000_000 || (request.CurrentReading is decimal meter && decimal.Round(meter, 3) != meter))
                throw new ApiException(400, "Chỉ số mới phải nằm trong giới hạn và có tối đa ba chữ số thập phân.");

            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var invoice = await db.Invoices.Include(x => x.DepositSettlements).SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == ownerId, ct)
                ?? throw new ApiException(404, "Invoice was not found.");
            var fingerprint = Fingerprint(new { request.ExpectedVersion, Reason = reason, request.Rent, request.ElectricityAmount,
                request.WaterAmount, request.ServiceAmount, request.CurrentReading, request.DueDate, request.Description, request.Amount });
            var prior = await db.InvoiceRevisions.SingleOrDefaultAsync(x => x.InvoiceId == id && x.RequestId == request.RequestId, ct);
            if (prior is not null)
            {
                if (prior.RequestFingerprint != fingerprint) throw new ApiException(409, "This request ID was already used for different invoice changes.");
                await transaction.CommitAsync(ct);
                return Results.Ok(new { invoice = InvoiceService.ToDto(invoice), correction = ToCorrectionDto(prior) });
            }
            if (invoice.Version != request.ExpectedVersion) throw new ApiException(409, "Invoice changed. Refresh it and retry.");
            if (invoice.LifecycleState != InvoiceLifecycleState.Issued || invoice.Paid != 0 || await db.Receipts.AnyAsync(x => x.InvoiceId == id, ct))
                throw new ApiException(409, "Only an issued invoice with no recorded receipts can be corrected.");
            if (await db.PayOsAttempts.AnyAsync(x => x.OwnerId == ownerId && x.InvoiceId == id && x.Status == PaymentAttemptStatus.Pending, ct))
                throw new ApiException(409, "Reconcile the pending payOS attempt before correcting this invoice.");
            if (invoice.Kind == "Deposit" && invoice.DepositSettlements.Count != 0)
                throw new ApiException(409, "A deposit invoice with settlement records cannot be corrected.");

            var before = SerializeSnapshot(invoice);
            var changed = false;
            if (invoice.Kind == "Monthly")
            {
                if (request.Amount is not null) throw new ApiException(400, "Use monthly charge fields to correct a monthly invoice.");
                var meterChanged = request.CurrentReading is not null;
                MonthlyReading? reading = null;
                if (meterChanged)
                {
                    var policy = await MeterCorrectionPolicyAsync(db, invoice, ct);
                    if (!policy.Allowed) throw new ApiException(409, policy.Reason ?? "Meter correction is no longer allowed.");
                    reading = await db.Readings.SingleOrDefaultAsync(x => x.OccupancyId == invoice.OccupancyId && x.Period == invoice.Period, ct)
                        ?? throw new ApiException(409, "The source meter reading no longer exists.");
                    if (request.CurrentReading < reading.PreviousReading)
                        throw new ApiException(400, "Chỉ số mới không thể thấp hơn chỉ số trước.");
                    reading.CurrentReading = request.CurrentReading is decimal currentReading
                        ? currentReading
                        : throw new ApiException(400, "Chỉ số mới là bắt buộc.");
                    reading.Consumption = reading.CurrentReading - reading.PreviousReading;
                    invoice.CurrentReading = reading.CurrentReading;
                    invoice.Consumption = reading.Consumption;
                    changed = true;
                }
                if (request.Rent is decimal rent) { invoice.Rent = ValidateCharge(rent); changed = true; }
                if (request.ElectricityAmount is decimal electricity) { invoice.ElectricityAmount = ValidateCharge(electricity); changed = true; }
                else if (meterChanged && invoice.ElectricityRate is decimal rate)
                {
                    invoice.ElectricityAmount = ApiSupport.RoundVnd(invoice.Consumption * rate);
                    changed = true;
                }
                if (request.WaterAmount is decimal water) { invoice.WaterAmount = ValidateCharge(water); changed = true; }
                if (request.ServiceAmount is decimal service) { invoice.ServiceAmount = ValidateCharge(service); changed = true; }
                if (request.CurrentReading is not null && reading is not null) changed = true;
                invoice.Total = InvoiceService.ValidateTotal(invoice.Rent, invoice.ElectricityAmount, invoice.WaterAmount, invoice.ServiceAmount);
            }
            else if (invoice.Kind == "Deposit")
            {
                if (request.Rent is not null || request.ElectricityAmount is not null || request.WaterAmount is not null || request.ServiceAmount is not null || request.CurrentReading is not null)
                    throw new ApiException(400, "Use the amount field to correct a deposit invoice.");
                if (request.Amount is decimal amount) { invoice.Total = ValidateCharge(amount); changed = true; }
            }
            else if (invoice.IsFinalMeterReading)
            {
                var overlappingMonthly = await db.Invoices.AsNoTracking().AnyAsync(x => x.OccupancyId == invoice.OccupancyId &&
                    x.Period == invoice.Period && x.Kind == "Monthly" && x.Id != invoice.Id, ct);
                if (overlappingMonthly && (request.Rent is > 0 || request.WaterAmount is > 0))
                    throw new ApiException(409, "Không thể thêm tiền thuê hoặc tiền nước vì kỳ này đã có hóa đơn tháng.");
                if (request.CurrentReading is decimal currentReading)
                {
                    var policy = await MeterCorrectionPolicyAsync(db, invoice, ct);
                    if (!policy.Allowed) throw new ApiException(409, policy.Reason ?? "Meter correction is no longer allowed.");
                    if (currentReading < invoice.PreviousReading) throw new ApiException(400, "Chỉ số mới không thể thấp hơn chỉ số trước.");
                    invoice.CurrentReading = currentReading;
                    invoice.Consumption = currentReading - invoice.PreviousReading;
                    var occupancy = await db.Occupancies.SingleAsync(x => x.Id == invoice.OccupancyId, ct);
                    if (!occupancy.IsActive)
                    {
                        // Completion copied this final anchor into the room baseline. Keep
                        // that baseline synchronized when the latest final reading changes.
                        var room = await db.Rooms.SingleAsync(x => x.Id == invoice.RoomId, ct);
                        room.InitialReading = currentReading;
                    }
                    if (request.ElectricityAmount is null && invoice.ElectricityRate is decimal rate)
                        invoice.ElectricityAmount = ApiSupport.RoundVnd(invoice.Consumption * rate);
                    changed = true;
                }
                if (request.Rent is decimal rent) { invoice.Rent = ValidateCharge(rent); changed = true; }
                if (request.ElectricityAmount is decimal electricity) { invoice.ElectricityAmount = ValidateCharge(electricity); changed = true; }
                if (request.WaterAmount is decimal water) { invoice.WaterAmount = ValidateCharge(water); changed = true; }
                if (request.ServiceAmount is decimal service) { invoice.ServiceAmount = ValidateCharge(service); changed = true; }
                if (request.Amount is not null) throw new ApiException(400, "Use meter or charge fields to correct a final meter invoice.");
                invoice.Total = InvoiceService.ValidateTotal(invoice.Rent, invoice.ElectricityAmount, invoice.WaterAmount, invoice.ServiceAmount);
            }
            else
            {
                if (request.Rent is not null || request.ElectricityAmount is not null || request.WaterAmount is not null || request.ServiceAmount is not null || request.CurrentReading is not null)
                    throw new ApiException(400, "Use the amount field to correct this invoice.");
                if (request.Amount is decimal amount) { invoice.Total = ValidateCharge(amount); changed = true; }
            }
            if (request.DueDate is DateOnly dueDate) { invoice.DueDate = dueDate; changed = true; }
            if (request.Description is string description) { invoice.Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim(); changed = true; }
            if (!changed) throw new ApiException(400, "Supply at least one invoice field to correct.");
            invoice.Version++;
            InvoiceService.RecalculateStatus(invoice);
            var after = SerializeSnapshot(invoice);
            var revision = await AddRevisionAsync(db, invoice, request.RequestId, fingerprint, reason, actorId, before, after, ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            var policyAfter = await MeterCorrectionPolicyAsync(db, invoice, ct);
            var pendingAfter = await db.PayOsAttempts.AsNoTracking().AnyAsync(x => x.InvoiceId == id && x.Status == PaymentAttemptStatus.Pending, ct);
            return Results.Ok(new { invoice = InvoiceService.ToDto(invoice, pendingAfter, policyAfter.Allowed, policyAfter.Reason), correction = ToCorrectionDto(revision) });
        });

        routes.MapPost("/invoices/{id:guid}/reconcile", async (Guid id, HttpContext context, AppDbContext db, PayOsService payOsService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var invoice = await db.Invoices.Include(x => x.DepositSettlements).AsNoTracking().SingleOrDefaultAsync(row => row.Id == id && row.OwnerId == ownerId, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Invoice was not found.");
            var status = await payOsService.ReconcileInvoiceAsync(ownerId, invoice.Id, cancellationToken);
            var refreshed = await db.Invoices.Include(x => x.DepositSettlements).AsNoTracking().SingleAsync(row => row.Id == invoice.Id, cancellationToken);
            return Results.Ok(new { status, invoice = InvoiceService.ToDto(refreshed) });
        }).RequireRateLimiting("tenant-payment");

        routes.MapPost("/invoices/{id:guid}/receipts", async (Guid id, ReceiptRequest request, HttpContext context,
            ManualReceiptService receipts, CancellationToken cancellationToken) =>
            Results.Ok(await receipts.RecordAsync(ApiSupport.OwnerId(context), id, request,
                context.Request.Headers["Idempotency-Key"].FirstOrDefault(), cancellationToken)));

    }

    private sealed record ReadingWork(Room Room, Building Building, Occupancy Occupancy, string Period,
        decimal PreviousReading, decimal CurrentReading, decimal Consumption, DateOnly BillingStartDate,
        DateOnly BillingEndDate, int BillableDays, int MonthDays);

    private static async Task<ReadingWork> PrepareReadingAsync(AppDbContext db, Guid ownerId, ReadingRequest request, CancellationToken ct)
    {
        var period = ApiSupport.NormalizePeriod(request.Period);
        if (request.CurrentReading < 0 || request.CurrentReading > 1_000_000_000 || decimal.Round(request.CurrentReading, 3) != request.CurrentReading)
            throw new ApiException(400, "Chỉ số điện phải là số không âm tối đa ba chữ số thập phân trong giới hạn cho phép.");
        var (room, building) = await OwnerManagementEndpoints.FindRoomAsync(db, ownerId, request.RoomId, ct);
        if (room.ArchivedAt is not null || building.ArchivedAt is not null)
            throw new ApiException(409, "Không thể ghi chỉ số cho phòng hoặc dãy đã lưu trữ.");
        var occupancy = await db.Occupancies.SingleOrDefaultAsync(row => row.RoomId == room.Id && row.IsActive, ct)
            ?? throw new ApiException(409, "Cần có người thuê đang ở để ghi chỉ số điện.");
        if (await db.Invoices.AnyAsync(x => x.OccupancyId == occupancy.Id && x.IsFinalMeterReading, ct))
            throw new ApiException(409, "Đã chốt điện trả phòng; không thể phát hành thêm hóa đơn tháng cho lượt thuê này.");
        var (periodStart, periodEnd, monthDays) = InvoiceService.PeriodDates(period);
        if (periodStart > OwnerManagementEndpoints.TodayVietnam())
            throw new ApiException(400, "Không thể nhập chỉ số cho tháng trong tương lai.");
        if (string.CompareOrdinal(period, occupancy.StartDate.ToString("yyyy-MM")) < 0)
            throw new ApiException(400, "Tháng ghi chỉ số không thể trước tháng bắt đầu thuê.");
        if (await db.Readings.AnyAsync(row => row.OccupancyId == occupancy.Id && row.Period == period, ct))
            throw new ApiException(409, "Lượt thuê đã có chỉ số điện cho tháng này.");
        if (await db.Invoices.AnyAsync(row => row.OccupancyId == occupancy.Id && row.Period == period && row.Kind == "Monthly", ct))
            throw new ApiException(409, "Hóa đơn của lượt thuê trong tháng này đã được tạo.");

        var priorReadings = await db.Readings.AsNoTracking().Where(row => row.RoomId == room.Id)
            .OrderByDescending(row => row.Period).ThenByDescending(row => row.RecordedAt).ToListAsync(ct);
        var newest = priorReadings.FirstOrDefault();
        if (newest is not null && string.CompareOrdinal(newest.Period, period) > 0)
            throw new ApiException(409, "Vui lòng nhập chỉ số theo thứ tự tháng.");

        // Equal-period readings are valid when a different occupancy moved into the
        // same physical room later that month. MeterBaselineAsync carries the old
        // tenant's final anchor forward instead of resetting the room meter.
        var previousReading = Math.Max(newest?.CurrentReading ?? room.InitialReading,
            await MoveoutEndpoints.MeterBaselineAsync(db, room, ct));
        if (request.CurrentReading < previousReading)
            throw new ApiException(400, $"Chỉ số mới không thể thấp hơn chỉ số trước ({previousReading}).");

        var days = monthDays;
        return new ReadingWork(room, building, occupancy, period, previousReading, request.CurrentReading,
            request.CurrentReading - previousReading, periodStart, periodEnd, days, monthDays);
    }

    private static decimal ValidateCharge(decimal amount)
    {
        if (amount < 0 || amount > int.MaxValue || amount != decimal.Truncate(amount))
            throw new ApiException(400, "Khoản thu phải là số VND nguyên từ 0 đến giới hạn thanh toán.");
        return amount;
    }

    private static readonly JsonSerializerOptions AuditJsonOptions = new(JsonSerializerDefaults.Web);

    internal static string Fingerprint(object request) => Convert.ToHexString(SHA256.HashData(
        Encoding.UTF8.GetBytes(JsonSerializer.Serialize(request, AuditJsonOptions))));

    internal static string SerializeSnapshot(Invoice invoice) => JsonSerializer.Serialize(new
    {
        invoice.Id,
        version = invoice.Version,
        lifecycleState = invoice.LifecycleState.ToString(),
        invoice.Kind,
        invoice.Period,
        invoice.BuildingId,
        invoice.RoomId,
        invoice.OccupancyId,
        invoice.Rent,
        invoice.ElectricityAmount,
        invoice.WaterAmount,
        invoice.ServiceAmount,
        invoice.Total,
        invoice.CurrentReading,
        invoice.PreviousReading,
        invoice.Consumption,
        invoice.DueDate,
        invoice.Description,
        invoice.BillingStartDate,
        invoice.BillingEndDate,
        invoice.BillableDays,
        invoice.MonthDays,
        invoice.MonthlyRentRate,
        invoice.ElectricityRate,
        invoice.WaterRate,
        invoice.WaterPerPerson,
        invoice.ServiceRate
    }, AuditJsonOptions);

    internal static async Task<InvoiceRevision> AddRevisionAsync(AppDbContext db, Invoice invoice, Guid requestId, string fingerprint,
        string reason, Guid actorId, string before, string after, CancellationToken ct)
    {
        var actorName = await db.Users.AsNoTracking().Where(x => x.Id == actorId).Select(x => x.Name).SingleOrDefaultAsync(ct)
            ?? "Unknown user";
        var lastRevision = await db.InvoiceRevisions.Where(x => x.InvoiceId == invoice.Id)
            .OrderByDescending(x => x.Revision).Select(x => (int?)x.Revision).FirstOrDefaultAsync(ct) ?? 0;
        var revision = new InvoiceRevision
        {
            InvoiceId = invoice.Id,
            Revision = checked(lastRevision + 1),
            RequestId = requestId,
            RequestFingerprint = fingerprint,
            Reason = reason,
            ActorId = actorId,
            ActorName = actorName,
            CreatedAt = DateTimeOffset.UtcNow,
            Version = invoice.Version,
            BeforeJson = before,
            AfterJson = after
        };
        db.InvoiceRevisions.Add(revision);
        return revision;
    }

    private static InvoiceCorrectionDto ToCorrectionDto(InvoiceRevision revision) => new(revision.Id, revision.Revision,
        revision.RequestId, revision.Reason, revision.ActorId, revision.ActorName, revision.CreatedAt, revision.Version,
        revision.BeforeJson, revision.AfterJson);

    private static async Task<(bool Allowed, string? Reason)> MeterCorrectionPolicyAsync(AppDbContext db, Invoice invoice, CancellationToken ct)
    {
        if (invoice.LifecycleState != InvoiceLifecycleState.Issued) return (false, "Draft invoices must be published before correction.");
        if (invoice.Paid != 0) return (false, "An invoice with a recorded payment cannot be corrected.");
        if (invoice.Kind != "Monthly" && !invoice.IsFinalMeterReading) return (false, "This invoice has no editable meter anchor.");

        DateTimeOffset anchorAt;
        if (invoice.Kind == "Monthly")
        {
            var reading = await db.Readings.AsNoTracking().SingleOrDefaultAsync(x => x.OccupancyId == invoice.OccupancyId && x.Period == invoice.Period, ct);
            if (reading is null) return (false, "The source meter reading is missing.");
            anchorAt = reading.RecordedAt;
        }
        else anchorAt = invoice.IssuedAt;

        var readingAnchors = await db.Readings.AsNoTracking().Where(x => x.RoomId == invoice.RoomId)
            .Select(x => new { x.Period, x.RecordedAt }).ToListAsync(ct);
        var hasLaterReading = readingAnchors.Any(x => string.CompareOrdinal(x.Period, invoice.Period) > 0 ||
            (x.Period == invoice.Period && x.RecordedAt > anchorAt));
        if (hasLaterReading) return (false, "A later meter reading already anchors this room. Correcting this reading is blocked.");
        var finalAnchors = await db.Invoices.AsNoTracking().Where(x => x.RoomId == invoice.RoomId && x.IsFinalMeterReading && x.Id != invoice.Id)
            .Select(x => new { x.Period, x.IssuedAt }).ToListAsync(ct);
        var hasLaterFinal = finalAnchors.Any(x => string.CompareOrdinal(x.Period, invoice.Period) > 0 ||
            (x.Period == invoice.Period && x.IssuedAt > anchorAt));
        if (hasLaterFinal) return (false, "A later move-out reading already anchors this room. Correcting this reading is blocked.");
        return (true, null);
    }
}
