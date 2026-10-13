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

        routes.MapGet("/readings", async (string? period, HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var requestedPeriod = period is null ? OwnerManagementEndpoints.CurrentVietnamPeriod() : ApiSupport.NormalizePeriod(period);
            var rows = await (from reading in db.Readings.AsNoTracking()
                              join room in db.Rooms.AsNoTracking() on reading.RoomId equals room.Id
                              join building in db.Buildings.AsNoTracking() on room.BuildingId equals building.Id
                              where building.OwnerId == ownerId && reading.Period == requestedPeriod
                              orderby building.Name, room.Name
                              select new ReadingDto(reading.Id, room.Id, room.Name, building.Name, reading.Period,
                                  reading.PreviousReading, reading.CurrentReading, reading.Consumption, reading.RecordedAt))
                .ToListAsync(cancellationToken);
            return Results.Ok(rows);
        });

        routes.MapPost("/readings", async (ReadingRequest request, HttpContext context, AppDbContext db, InvoiceService invoiceService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var period = ApiSupport.NormalizePeriod(request.Period);
            if (request.CurrentReading < 0 || request.CurrentReading > 1_000_000_000)
                throw new ApiException(StatusCodes.Status400BadRequest, "Chỉ số điện phải là số không âm trong giới hạn cho phép.");
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            var (room, building) = await OwnerManagementEndpoints.FindRoomAsync(db, ownerId, request.RoomId, cancellationToken);
            var occupancy = await db.Occupancies.SingleOrDefaultAsync(row => row.RoomId == room.Id && row.IsActive, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status409Conflict, "Cần có người thuê đang ở để ghi chỉ số điện.");
            if (await db.Invoices.AnyAsync(x => x.OccupancyId == occupancy.Id && x.IsFinalMeterReading, cancellationToken))
                throw new ApiException(409, "Đã chốt điện trả phòng; không thể phát hành thêm hóa đơn tháng cho lượt thuê này.");
            var startPeriod = occupancy.StartDate.ToString("yyyy-MM");
            var currentPeriod = OwnerManagementEndpoints.CurrentVietnamPeriod();
            if (string.CompareOrdinal(period, startPeriod) < 0)
                throw new ApiException(StatusCodes.Status400BadRequest, "Tháng ghi chỉ số không thể trước tháng bắt đầu thuê.");
            if (string.CompareOrdinal(period, currentPeriod) > 0)
                throw new ApiException(StatusCodes.Status400BadRequest, "Không thể nhập chỉ số cho tháng trong tương lai.");
            if (await db.Invoices.AnyAsync(row => row.RoomId == room.Id && row.Period == period && row.Kind == "Monthly", cancellationToken))
                throw new ApiException(StatusCodes.Status409Conflict, "Hóa đơn của phòng trong tháng này đã được phát hành.");

            var priorReadings = await db.Readings.Where(row => row.RoomId == room.Id)
                .OrderByDescending(row => row.Period).ToListAsync(cancellationToken);
            if (priorReadings.Any(row => string.CompareOrdinal(row.Period, period) == 0))
                throw new ApiException(StatusCodes.Status409Conflict, "Phòng đã có chỉ số điện cho tháng này.");
            var newest = priorReadings.FirstOrDefault();
            if (newest is not null && string.CompareOrdinal(newest.Period, period) > 0)
                throw new ApiException(StatusCodes.Status409Conflict, "Vui lòng nhập chỉ số theo thứ tự tháng.");
            var previousReading = Math.Max(newest?.CurrentReading ?? room.InitialReading, await MoveoutEndpoints.MeterBaselineAsync(db, room, cancellationToken));
            if (request.CurrentReading < previousReading)
                throw new ApiException(StatusCodes.Status400BadRequest, $"Chỉ số mới không thể thấp hơn chỉ số trước ({previousReading}).");

            var reading = new MonthlyReading
            {
                RoomId = room.Id,
                OccupancyId = occupancy.Id,
                Period = period,
                PreviousReading = previousReading,
                CurrentReading = request.CurrentReading,
                Consumption = request.CurrentReading - previousReading,
                RecordedAt = DateTimeOffset.UtcNow
            };
            db.Readings.Add(reading);
            await db.SaveChangesAsync(cancellationToken);
            await invoiceService.GenerateForOwnerAsync(ownerId, period, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/readings?period={period}", new ReadingDto(reading.Id, room.Id, room.Name, building.Name,
                reading.Period, reading.PreviousReading, reading.CurrentReading, reading.Consumption, reading.RecordedAt));
        });

        routes.MapGet("/invoices", async (string? period, HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var query = db.Invoices.Include(x => x.DepositSettlements).AsNoTracking().Where(row => row.OwnerId == ownerId);
            if (!string.IsNullOrWhiteSpace(period))
            {
                var requestedPeriod = ApiSupport.NormalizePeriod(period);
                query = query.Where(row => row.Period == requestedPeriod);
            }
            var rows = await query.OrderByDescending(row => row.Period).ThenBy(row => row.BuildingName).ThenBy(row => row.RoomName)
                .ToListAsync(cancellationToken);
            return Results.Ok(rows.Select(InvoiceService.ToDto).ToList());
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
                Id = request.RequestId, OwnerId = ownerId, RoomId = id, OccupancyId = occupancy.Id,
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

        routes.MapGet("/invoices/{id:guid}", async (Guid id, HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var invoice = await db.Invoices.Include(x => x.DepositSettlements).AsNoTracking().SingleOrDefaultAsync(row => row.Id == id && row.OwnerId == ApiSupport.OwnerId(context), cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Invoice was not found.");
            return Results.Ok(InvoiceService.ToDto(invoice));
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

        routes.MapPost("/invoices/{id:guid}/receipts", async (Guid id, ReceiptRequest request, HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var idempotencyKey = context.Request.Headers["Idempotency-Key"].FirstOrDefault()?.Trim();
            if (string.IsNullOrWhiteSpace(idempotencyKey)) idempotencyKey = request.IdempotencyKey?.Trim();
            if (idempotencyKey is { Length: > 100 })
                throw new ApiException(StatusCodes.Status400BadRequest, "Idempotency key must be 100 characters or fewer.");
            var amount = ApiSupport.RoundVnd(request.Amount);
            if (amount <= 0) throw new ApiException(StatusCodes.Status400BadRequest, "Receipt amount must be positive.");
            var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
            if (note is { Length: > 500 }) throw new ApiException(StatusCodes.Status400BadRequest, "Receipt note must be 500 characters or fewer.");

            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            var invoice = await db.Invoices.SingleOrDefaultAsync(row => row.Id == id && row.OwnerId == ownerId, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Invoice was not found.");
            if (!string.IsNullOrWhiteSpace(idempotencyKey))
            {
                var priorReceipt = await db.Receipts.SingleOrDefaultAsync(row => row.InvoiceId == id && row.IdempotencyKey == idempotencyKey, cancellationToken);
                if (priorReceipt is not null)
                {
                    if (priorReceipt.Amount != amount || !string.Equals(priorReceipt.Note, note, StringComparison.Ordinal))
                        throw new ApiException(StatusCodes.Status409Conflict, "This idempotency key was already used for a different receipt.");
                    await transaction.CommitAsync(cancellationToken);
                    return Results.Ok(new
                    {
                        id = priorReceipt.Id,
                        invoiceId = invoice.Id,
                        amount = priorReceipt.Amount,
                        paid = invoice.Paid,
                        outstanding = Math.Max(0, invoice.Total - invoice.Paid),
                        status = invoice.Status.ToString()
                    });
                }
            }

            var pendingAttempt = await db.PayOsAttempts.AnyAsync(row => row.InvoiceId == id && row.OwnerId == ownerId && row.Status == PaymentAttemptStatus.Pending, cancellationToken);
            if (pendingAttempt)
                throw new ApiException(StatusCodes.Status409Conflict, "Reconcile or finish the pending payOS payment before recording another receipt.");
            var outstanding = invoice.Total - invoice.Paid;
            if (amount > outstanding)
                throw new ApiException(StatusCodes.Status409Conflict, "Receipt amount cannot exceed the outstanding balance.");
            var receipt = new PaymentReceipt
            {
                OwnerId = ownerId,
                InvoiceId = invoice.Id,
                Amount = amount,
                Note = note,
                IdempotencyKey = string.IsNullOrWhiteSpace(idempotencyKey) ? null : idempotencyKey,
                Source = "Manual",
                CreatedAt = DateTimeOffset.UtcNow
            };
            db.Receipts.Add(receipt);
            invoice.Paid += amount;
            InvoiceService.RecalculateStatus(invoice);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new
            {
                id = receipt.Id,
                invoiceId = invoice.Id,
                amount = receipt.Amount,
                paid = invoice.Paid,
                outstanding = Math.Max(0, invoice.Total - invoice.Paid),
                status = invoice.Status.ToString()
            });
        });
    }
}
