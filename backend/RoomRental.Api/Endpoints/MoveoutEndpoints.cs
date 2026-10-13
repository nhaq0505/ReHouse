using Microsoft.EntityFrameworkCore;
using RoomRental.Api.Data;
using RoomRental.Api.Domain;
using RoomRental.Api.Services;

namespace RoomRental.Api.Endpoints;

public static class MoveoutEndpoints
{
    internal static async Task<decimal> MeterBaselineAsync(AppDbContext db, Room room, CancellationToken ct)
    {
        var readings = await db.Readings.AsNoTracking().Where(x => x.RoomId == room.Id).Select(x => x.CurrentReading).ToListAsync(ct);
        var finals = await db.Invoices.AsNoTracking().Where(x => x.RoomId == room.Id && x.IsFinalMeterReading).Select(x => x.CurrentReading).ToListAsync(ct);
        return readings.Concat(finals).Append(room.InitialReading).Max();
    }

    public static void MapMoveoutEndpoints(this WebApplication app)
    {
        var routes = app.MapGroup("/api/rooms").RequireAuthorization(p => p.RequireRole("Owner"));
        routes.MapGet("/{id:guid}/moveout", async (Guid id, HttpContext context, AppDbContext db, CancellationToken ct) =>
        {
            var (room, _) = await OwnerManagementEndpoints.FindRoomAsync(db, ApiSupport.OwnerId(context), id, ct);
            var occupancy = await db.Occupancies.AsNoTracking().SingleOrDefaultAsync(x => x.RoomId == id && x.IsActive, ct)
                ?? throw new ApiException(409, "Phòng chưa có người thuê đang ở.");
            var invoices = await db.Invoices.AsNoTracking().Include(x => x.DepositSettlements).Where(x => x.OccupancyId == occupancy.Id).OrderBy(x => x.IssuedAt).ToListAsync(ct);
            var pendingInvoiceIds = await db.PayOsAttempts.AsNoTracking().Where(x => x.OwnerId == ApiSupport.OwnerId(context) && x.Status == PaymentAttemptStatus.Pending && db.Invoices.Any(i => i.Id == x.InvoiceId && i.OccupancyId == occupancy.Id)).Select(x => x.InvoiceId).ToListAsync(ct);
            return Results.Ok(new { occupancyId = occupancy.Id, tenantName = occupancy.TenantName, roomName = room.Name,
                electricityRate = room.ElectricityRate, meterBaseline = await MeterBaselineAsync(db, room, ct),
                invoices = invoices.Select(InvoiceService.ToDto), pendingInvoiceIds });
        });

        routes.MapPost("/{id:guid}/final-invoice", async (Guid id, FinalInvoiceRequest request, HttpContext context, AppDbContext db, CancellationToken ct) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var description = request.Description?.Trim() ?? "";
            if (request.RequestId == Guid.Empty || request.OccupancyId == Guid.Empty || request.CurrentReading < 0 || request.CurrentReading > 1_000_000_000 || decimal.Round(request.CurrentReading, 3) != request.CurrentReading || request.AdditionalAmount < 0 || request.AdditionalAmount > int.MaxValue || request.AdditionalAmount != decimal.Truncate(request.AdditionalAmount) || description.Length > 450 || (request.AdditionalAmount > 0 && description.Length == 0))
                throw new ApiException(400, "Nhập chỉ số điện, khoản bổ sung nguyên VND và nội dung hợp lệ.");
            description = "Quyết toán trả phòng" + (description.Length > 0 ? " · " + description : "");
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var (room, building) = await OwnerManagementEndpoints.FindRoomAsync(db, ownerId, id, ct);
            var previous = await db.Invoices.SingleOrDefaultAsync(x => x.Id == request.RequestId, ct);
            if (previous is not null)
            {
                if (previous.OwnerId != ownerId || previous.RoomId != id || previous.OccupancyId != request.OccupancyId || !previous.IsFinalMeterReading || previous.CurrentReading != request.CurrentReading || previous.ServiceAmount != request.AdditionalAmount || previous.Description != description)
                    throw new ApiException(409, "Mã thao tác đã được dùng cho nội dung khác.");
                return Results.Ok(InvoiceService.ToDto(previous));
            }
            var occupancy = await db.Occupancies.SingleOrDefaultAsync(x => x.Id == request.OccupancyId && x.RoomId == id && x.IsActive, ct)
                ?? throw new ApiException(409, "Lượt thuê đã thay đổi. Vui lòng tải lại.");
            if (await db.Invoices.AnyAsync(x => x.OccupancyId == occupancy.Id && x.IsFinalMeterReading, ct))
                throw new ApiException(409, "Lượt thuê đã có hóa đơn chốt điện trả phòng.");
            var baseline = await MeterBaselineAsync(db, room, ct);
            if (request.CurrentReading < baseline) throw new ApiException(400, "Chỉ số mới không được thấp hơn chỉ số đã chốt.");
            var consumption = request.CurrentReading - baseline;
            var electricity = ApiSupport.RoundVnd(consumption * room.ElectricityRate);
            var total = electricity + request.AdditionalAmount;
            if (total > int.MaxValue) throw new ApiException(400, "Tổng tiền vượt giới hạn thanh toán.");
            var invoice = new Invoice { Id = request.RequestId, OwnerId = ownerId, RoomId = id, OccupancyId = occupancy.Id,
                RoomName = room.Name, BuildingName = building.Name, TenantName = occupancy.TenantName,
                Kind = "Supplemental", Description = description, IsFinalMeterReading = true,
                Period = OwnerManagementEndpoints.CurrentVietnamPeriod(), PreviousReading = baseline, CurrentReading = request.CurrentReading,
                Consumption = consumption, ElectricityAmount = electricity, ServiceAmount = request.AdditionalAmount,
                Total = total, DueDate = OwnerManagementEndpoints.TodayVietnam(), Status = total == 0 ? InvoiceStatus.Paid : InvoiceStatus.Unpaid };
            db.Invoices.Add(invoice);
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return Results.Created($"/api/invoices/{invoice.Id}", InvoiceService.ToDto(invoice));
        });

        routes.MapPost("/{id:guid}/complete-moveout", async (Guid id, CompleteMoveoutRequest request, HttpContext context, AppDbContext db, CancellationToken ct) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var (room, _) = await OwnerManagementEndpoints.FindRoomAsync(db, ApiSupport.OwnerId(context), id, ct);
            var occupancy = await db.Occupancies.SingleOrDefaultAsync(x => x.Id == request.OccupancyId && x.RoomId == id, ct)
                ?? throw new ApiException(404, "Không tìm thấy lượt thuê.");
            var invoices = await db.Invoices.Include(x => x.DepositSettlements).Where(x => x.OccupancyId == occupancy.Id).ToListAsync(ct);
            var final = invoices.SingleOrDefault(x => x.Id == request.FinalInvoiceId && x.IsFinalMeterReading)
                ?? throw new ApiException(409, "Cần chốt điện cuối kỳ trước khi kết thúc lượt thuê.");
            if (!occupancy.IsActive) return Results.Ok(new { success = true });
            if (await db.PayOsAttempts.AnyAsync(x => x.Status == PaymentAttemptStatus.Pending && invoices.Select(i => i.Id).Contains(x.InvoiceId), ct))
                throw new ApiException(409, "Còn giao dịch payOS đang chờ. Đối soát trước khi trả phòng.");
            if (invoices.Any(x => x.Kind != "Deposit" && x.Paid < x.Total)) throw new ApiException(409, "Cần thu đủ hoặc khấu trừ hết công nợ trước khi trả phòng.");
            if (invoices.Any(x => x.Kind == "Deposit" && x.Paid > x.DepositSettlements.Sum(s => s.Amount))) throw new ApiException(409, "Cần hoàn hoặc khấu trừ hết cọc đang giữ.");
            room.InitialReading = Math.Max(room.InitialReading, final.CurrentReading);
            occupancy.IsActive = false; occupancy.EndDate = OwnerManagementEndpoints.TodayVietnam();
            occupancy.TenantTokenHash = null; occupancy.ProtectedTenantToken = null;
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return Results.Ok(new { success = true });
        });
    }
}
