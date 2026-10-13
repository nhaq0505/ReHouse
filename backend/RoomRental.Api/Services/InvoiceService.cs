using Microsoft.EntityFrameworkCore;
using RoomRental.Api.Data;
using RoomRental.Api.Domain;

namespace RoomRental.Api.Services;

public sealed class InvoiceService(AppDbContext db)
{
    public async Task<(int Created, int Skipped)> GenerateForOwnerAsync(Guid ownerId, string period, CancellationToken cancellationToken = default)
    {
        var alreadyInvoiced = await db.Invoices.AsNoTracking()
            .Where(x => x.OwnerId == ownerId && x.Period == period && x.Kind == "Monthly")
            .Select(x => x.RoomId)
            .ToListAsync(cancellationToken);
        var invoiceRoomIds = alreadyInvoiced.ToHashSet();

        var eligible = await (from reading in db.Readings.AsNoTracking()
                              join room in db.Rooms on reading.RoomId equals room.Id
                              join building in db.Buildings on room.BuildingId equals building.Id
                              join occupancy in db.Occupancies on reading.OccupancyId equals occupancy.Id
                              where building.OwnerId == ownerId && reading.Period == period
                              select new { Reading = reading, Room = room, Building = building, Occupancy = occupancy })
            .ToListAsync(cancellationToken);

        var created = 0;
        foreach (var row in eligible)
        {
            if (!invoiceRoomIds.Add(row.Room.Id)) continue;
            var rent = ApiSupport.RoundVnd(row.Room.Rent);
            var electricity = ApiSupport.RoundVnd(row.Reading.Consumption * row.Room.ElectricityRate);
            var water = ApiSupport.RoundVnd(row.Room.WaterPerPerson
                ? row.Room.WaterFee * row.Occupancy.People
                : row.Room.WaterFee);
            var services = ApiSupport.RoundVnd(row.Room.ServiceFee);
            var total = rent + electricity + water + services;
            db.Invoices.Add(new Invoice
            {
                OwnerId = ownerId,
                RoomId = row.Room.Id,
                OccupancyId = row.Occupancy.Id,
                RoomName = row.Room.Name,
                BuildingName = row.Building.Name,
                Period = period,
                TenantName = row.Occupancy.TenantName,
                PreviousReading = row.Reading.PreviousReading,
                CurrentReading = row.Reading.CurrentReading,
                Consumption = row.Reading.Consumption,
                Rent = rent,
                ElectricityAmount = electricity,
                WaterAmount = water,
                ServiceAmount = services,
                Total = total,
                Paid = 0,
                Status = total == 0 ? InvoiceStatus.Paid : InvoiceStatus.Unpaid,
                DueDate = ApiSupport.PeriodDueDate(period),
                IssuedAt = DateTimeOffset.UtcNow
            });
            created++;
        }

        if (created > 0) await db.SaveChangesAsync(cancellationToken);
        return (created, eligible.Count - created);
    }

    public async Task<(int Created, int Skipped)> GenerateForAllApprovedOwnersAsync(string period, CancellationToken cancellationToken = default)
    {
        var owners = await db.Users.AsNoTracking()
            .Where(user => user.Role == UserRole.Owner && user.Status == OwnerStatus.Approved)
            .Select(user => user.Id)
            .ToListAsync(cancellationToken);
        var created = 0;
        var skipped = 0;
        foreach (var ownerId in owners)
        {
            var result = await GenerateForOwnerAsync(ownerId, period, cancellationToken);
            created += result.Created;
            skipped += result.Skipped;
        }
        return (created, skipped);
    }

    public static InvoiceDto ToDto(Invoice invoice) => new(
        invoice.Id,
        invoice.RoomId,
        invoice.RoomName,
        invoice.BuildingName,
        invoice.Period,
        invoice.TenantName,
        invoice.PreviousReading,
        invoice.CurrentReading,
        invoice.Consumption,
        invoice.Rent,
        invoice.ElectricityAmount,
        invoice.WaterAmount,
        invoice.ServiceAmount,
        invoice.Total,
        invoice.Paid,
        Math.Max(0, invoice.Total - invoice.Paid),
        invoice.Status.ToString(),
        invoice.DueDate,
        invoice.IssuedAt, invoice.Kind, invoice.OccupancyId, invoice.Kind == "Deposit" ? Math.Max(0, invoice.Paid - invoice.DepositSettlements.Sum(x => x.Amount)) : 0, invoice.DepositSettlements, invoice.Description, invoice.IsFinalMeterReading);

    public static void RecalculateStatus(Invoice invoice)
    {
        invoice.Paid = ApiSupport.RoundVnd(invoice.Paid);
        invoice.Status = invoice.Paid >= invoice.Total ? InvoiceStatus.Paid
            : invoice.Paid > 0 ? InvoiceStatus.Partial
            : InvoiceStatus.Unpaid;
    }
}

public sealed class InvoiceSweepService(IServiceScopeFactory scopeFactory, ILogger<InvoiceSweepService> logger, TimeProvider timeProvider) : BackgroundService
{
    private static readonly TimeZoneInfo VietnamTimeZone = ResolveVietnamTimeZone();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<InvoiceService>();
                var period = timeProvider.GetUtcNow().ToOffset(VietnamTimeZone.GetUtcOffset(timeProvider.GetUtcNow())).ToString("yyyy-MM");
                var result = await service.GenerateForAllApprovedOwnersAsync(period, stoppingToken);
                if (result.Created > 0) logger.LogInformation("Published {Count} invoices for {Period} by daily sweep.", result.Created, period);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception exception) { logger.LogError(exception, "Daily invoice sweep failed."); }

            try { await Task.Delay(TimeSpan.FromHours(24), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }

    private static TimeZoneInfo ResolveVietnamTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time"); }
    }
}
