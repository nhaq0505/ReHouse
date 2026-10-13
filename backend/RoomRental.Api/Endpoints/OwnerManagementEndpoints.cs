using Microsoft.EntityFrameworkCore;
using RoomRental.Api.Data;
using RoomRental.Api.Domain;
using RoomRental.Api.Services;

namespace RoomRental.Api.Endpoints;

public static class OwnerManagementEndpoints
{
    public static void MapOwnerManagementEndpoints(this WebApplication app)
    {
        var routes = app.MapGroup("/api").RequireAuthorization(policy => policy.RequireRole("Owner"));

        routes.MapGet("/dashboard", async (HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var roomIds = await (from room in db.Rooms.AsNoTracking()
                                 join building in db.Buildings.AsNoTracking() on room.BuildingId equals building.Id
                                 where building.OwnerId == ownerId
                                 select room.Id).ToListAsync(cancellationToken);
            var occupiedRooms = await db.Occupancies.AsNoTracking().CountAsync(row => roomIds.Contains(row.RoomId) && row.IsActive, cancellationToken);
            var invoiceTotals = await db.Invoices.AsNoTracking().Where(row => row.OwnerId == ownerId && row.Kind != "Deposit")
                .Select(row => new { row.Total, row.Paid }).ToListAsync(cancellationToken);
            var billed = invoiceTotals.Sum(row => row.Total);
            var paid = invoiceTotals.Sum(row => row.Paid);
            var period = CurrentVietnamPeriod();
            var roomCount = roomIds.Count;
            var readingRoomIds = await db.Readings.AsNoTracking().Where(row => roomIds.Contains(row.RoomId) && row.Period == period)
                .Select(row => row.RoomId).ToListAsync(cancellationToken);
            var pendingReadings = await db.Occupancies.AsNoTracking()
                .CountAsync(row => row.IsActive && roomIds.Contains(row.RoomId) && !readingRoomIds.Contains(row.RoomId), cancellationToken);
            return Results.Ok(new
            {
                totalRooms = roomCount,
                occupiedRooms,
                totalBilled = billed,
                totalPaid = paid,
                totalOutstanding = Math.Max(0, billed - paid),
                pendingReadings
            });
        });

        routes.MapGet("/buildings", async (HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var rows = await db.Buildings.AsNoTracking().Where(row => row.OwnerId == ownerId)
                .OrderBy(row => row.Name).Select(row => new BuildingDto(row.Id, row.Name, row.Address)).ToListAsync(cancellationToken);
            return Results.Ok(rows);
        });

        routes.MapPost("/buildings", async (BuildingRequest request, HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var name = request.Name?.Trim();
            if (string.IsNullOrWhiteSpace(name) || name.Length > 160)
                throw new ApiException(StatusCodes.Status400BadRequest, "Building name is required and must be 160 characters or fewer.");
            var address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();
            var building = new Building { OwnerId = ApiSupport.OwnerId(context), Name = name, Address = address is { Length: > 500 } ? address[..500] : address };
            db.Buildings.Add(building);
            await db.SaveChangesAsync(cancellationToken);
            return Results.Created($"/api/buildings/{building.Id}", new BuildingDto(building.Id, building.Name, building.Address));
        });

        routes.MapGet("/rooms", async (string? period, HttpContext context, AppDbContext db, TenantTokenService tokenService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var readingPeriod = period is null ? CurrentVietnamPeriod() : ApiSupport.NormalizePeriod(period);
            var rows = await (from room in db.Rooms.AsNoTracking()
                              join building in db.Buildings.AsNoTracking() on room.BuildingId equals building.Id
                              where building.OwnerId == ownerId
                              orderby building.Name, room.Name
                              select new { Room = room, Building = building }).ToListAsync(cancellationToken);
            var roomIds = rows.Select(row => row.Room.Id).ToList();
            var activeOccupancies = await db.Occupancies.AsNoTracking()
                .Where(row => row.IsActive && roomIds.Contains(row.RoomId))
                .ToListAsync(cancellationToken);
            var occupancyByRoom = activeOccupancies.ToDictionary(row => row.RoomId);
            var result = new List<RoomDto>(rows.Count);
            foreach (var row in rows)
            {
                occupancyByRoom.TryGetValue(row.Room.Id, out var occupancy);
                result.Add(await ToRoomDtoAsync(db, tokenService, row.Room, row.Building, occupancy, readingPeriod, cancellationToken));
            }
            return Results.Ok(result);
        });

        routes.MapPost("/rooms", async (RoomCreateRequest request, HttpContext context, AppDbContext db, TenantTokenService tokenService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var building = await db.Buildings.SingleOrDefaultAsync(row => row.Id == request.BuildingId && row.OwnerId == ownerId, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Building was not found.");
            ValidateFees(request.Name, request.Rent, request.ElectricityRate, request.WaterFee, request.ServiceFee, request.InitialReading);
            var room = new Room
            {
                BuildingId = building.Id,
                Name = request.Name.Trim(),
                Rent = ApiSupport.RoundVnd(request.Rent),
                ElectricityRate = ApiSupport.RoundVnd(request.ElectricityRate),
                WaterFee = ApiSupport.RoundVnd(request.WaterFee),
                WaterPerPerson = request.WaterPerPerson,
                ServiceFee = ApiSupport.RoundVnd(request.ServiceFee),
                InitialReading = request.InitialReading
            };
            db.Rooms.Add(room);
            await db.SaveChangesAsync(cancellationToken);
            return Results.Created($"/api/rooms/{room.Id}", await ToRoomDtoAsync(db, tokenService, room, building, null, CurrentVietnamPeriod(), cancellationToken));
        });

        routes.MapGet("/rooms/{id:guid}", async (Guid id, string? period, HttpContext context, AppDbContext db, TenantTokenService tokenService, CancellationToken cancellationToken) =>
        {
            var row = await FindRoomAsync(db, ApiSupport.OwnerId(context), id, cancellationToken);
            var occupancy = await db.Occupancies.AsNoTracking().SingleOrDefaultAsync(item => item.RoomId == id && item.IsActive, cancellationToken);
            var readingPeriod = period is null ? CurrentVietnamPeriod() : ApiSupport.NormalizePeriod(period);
            return Results.Ok(await ToRoomDtoAsync(db, tokenService, row.Room, row.Building, occupancy, readingPeriod, cancellationToken));
        });

        routes.MapMethods("/rooms/{id:guid}", ["PATCH"], async (Guid id, RoomUpdateRequest request, HttpContext context, AppDbContext db, TenantTokenService tokenService, CancellationToken cancellationToken) =>
        {
            var (room, building) = await FindRoomAsync(db, ApiSupport.OwnerId(context), id, cancellationToken);
            ValidateFees(request.Name, request.Rent, request.ElectricityRate, request.WaterFee, request.ServiceFee, 0);
            room.Name = request.Name.Trim();
            room.Rent = ApiSupport.RoundVnd(request.Rent);
            room.ElectricityRate = ApiSupport.RoundVnd(request.ElectricityRate);
            room.WaterFee = ApiSupport.RoundVnd(request.WaterFee);
            room.WaterPerPerson = request.WaterPerPerson;
            room.ServiceFee = ApiSupport.RoundVnd(request.ServiceFee);
            await db.SaveChangesAsync(cancellationToken);
            var occupancy = await db.Occupancies.AsNoTracking().SingleOrDefaultAsync(item => item.RoomId == id && item.IsActive, cancellationToken);
            return Results.Ok(await ToRoomDtoAsync(db, tokenService, room, building, occupancy, CurrentVietnamPeriod(), cancellationToken));
        });

        routes.MapPost("/rooms/{id:guid}/occupancy", async (Guid id, OccupancyRequest request, HttpContext context, AppDbContext db, TenantTokenService tokenService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            var (room, building) = await FindRoomAsync(db, ownerId, id, cancellationToken);
            if (await db.Occupancies.AnyAsync(row => row.RoomId == id && row.IsActive, cancellationToken))
                throw new ApiException(StatusCodes.Status409Conflict, "This room already has an active occupancy.");
            if (string.IsNullOrWhiteSpace(request.TenantName) || request.TenantName.Trim().Length > 160)
                throw new ApiException(StatusCodes.Status400BadRequest, "Tenant name is required and must be 160 characters or fewer.");
            if (request.People is < 1 or > 30)
                throw new ApiException(StatusCodes.Status400BadRequest, "People must be between 1 and 30.");
            var today = TodayVietnam();
            if (request.StartDate > today)
                throw new ApiException(StatusCodes.Status400BadRequest, "Start date cannot be in the future.");
            var currentPeriod = CurrentVietnamPeriod();
            if (await db.Readings.AnyAsync(row => row.RoomId == id && row.Period == currentPeriod, cancellationToken))
                throw new ApiException(StatusCodes.Status409Conflict, "A meter reading already exists for this room this month. Start the new occupancy next month to keep readings tied to the correct tenant.");

            if (request.DepositAmount < 0 || request.DepositAmount > int.MaxValue || request.DepositAmount != decimal.Truncate(request.DepositAmount))
                throw new ApiException(400, "Tiền cọc phải là số nguyên VND từ 0 đến 2.147.483.647.");
            var token = tokenService.Create();
            var occupancy = new Occupancy
            {
                RoomId = id,
                TenantName = request.TenantName.Trim(),
                Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim()[..Math.Min(request.Phone.Trim().Length, 60)],
                People = request.People,
                StartDate = request.StartDate,
                TenantTokenHash = token.Hash,
                ProtectedTenantToken = token.ProtectedToken
            };
            db.Occupancies.Add(occupancy);
            if (request.DepositAmount > 0)
                db.Invoices.Add(new Invoice { OwnerId = ownerId, RoomId = room.Id, OccupancyId = occupancy.Id,
                    RoomName = room.Name, BuildingName = building.Name, TenantName = occupancy.TenantName,
                    Period = currentPeriod, Kind = "Deposit", Total = request.DepositAmount, DueDate = today });
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(await ToRoomDtoAsync(db, tokenService, room, building, occupancy, currentPeriod, cancellationToken));
        });

        routes.MapPost("/rooms/{id:guid}/end-occupancy", async (Guid id, HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            var (room, _) = await FindRoomAsync(db, ownerId, id, cancellationToken);
            var occupancy = await db.Occupancies.SingleOrDefaultAsync(row => row.RoomId == room.Id && row.IsActive, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status409Conflict, "This room has no active occupancy.");
            var hasPendingPayment = await (from attempt in db.PayOsAttempts
                                           join invoice in db.Invoices on attempt.InvoiceId equals invoice.Id
                                           where invoice.OccupancyId == occupancy.Id && attempt.Status == PaymentAttemptStatus.Pending
                                           select attempt.Id).AnyAsync(cancellationToken);
            if (hasPendingPayment)
                throw new ApiException(StatusCodes.Status409Conflict, "Reconcile or finish the pending payOS payment before ending this occupancy.");
            var deposit = await db.Invoices.Include(x => x.DepositSettlements)
                .SingleOrDefaultAsync(x => x.OccupancyId == occupancy.Id && x.Kind == "Deposit", cancellationToken);
            if (deposit is not null && deposit.Paid > deposit.DepositSettlements.Sum(x => x.Amount))
                throw new ApiException(409, "Vui lòng ghi nhận hoàn hoặc khấu trừ toàn bộ cọc đang giữ trước khi kết thúc lượt thuê.");
            if (await db.Invoices.AnyAsync(x => x.OccupancyId == occupancy.Id && x.IsFinalMeterReading, cancellationToken) &&
                await db.Invoices.AnyAsync(x => x.OccupancyId == occupancy.Id && x.Kind != "Deposit" && x.Paid < x.Total, cancellationToken))
                throw new ApiException(409, "Cần quyết toán hết công nợ sau khi chốt trả phòng.");
            room.InitialReading = Math.Max(room.InitialReading, await MoveoutEndpoints.MeterBaselineAsync(db, room, cancellationToken));
            occupancy.IsActive = false;
            occupancy.EndDate = TodayVietnam();
            occupancy.TenantTokenHash = null;
            occupancy.ProtectedTenantToken = null;
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { success = true });
        });

        routes.MapPost("/rooms/{id:guid}/rotate-link", async (Guid id, HttpContext context, AppDbContext db, TenantTokenService tokenService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            _ = await FindRoomAsync(db, ownerId, id, cancellationToken);
            var occupancy = await db.Occupancies.SingleOrDefaultAsync(row => row.RoomId == id && row.IsActive, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status409Conflict, "This room has no active occupancy.");
            var token = tokenService.Create();
            occupancy.TenantTokenHash = token.Hash;
            occupancy.ProtectedTenantToken = token.ProtectedToken;
            await db.SaveChangesAsync(cancellationToken);
            return Results.Ok(new RotateLinkDto(token.Token, tokenService.Url(token.Token)));
        });
    }

    internal static async Task<(Room Room, Building Building)> FindRoomAsync(AppDbContext db, Guid ownerId, Guid roomId, CancellationToken cancellationToken)
    {
        var row = await (from room in db.Rooms
                         join building in db.Buildings on room.BuildingId equals building.Id
                         where room.Id == roomId && building.OwnerId == ownerId
                         select new { Room = room, Building = building }).SingleOrDefaultAsync(cancellationToken);
        return row is null
            ? throw new ApiException(StatusCodes.Status404NotFound, "Room was not found.")
            : (row.Room, row.Building);
    }

    internal static async Task<RoomDto> ToRoomDtoAsync(AppDbContext db, TenantTokenService tokenService, Room room, Building building, Occupancy? occupancy, string period, CancellationToken cancellationToken)
    {
        var readings = await db.Readings.AsNoTracking().Where(row => row.RoomId == room.Id)
            .OrderByDescending(row => row.Period).ToListAsync(cancellationToken);
        var currentReading = readings.SingleOrDefault(row => row.Period == period);
        var priorReading = currentReading ?? readings.FirstOrDefault(row => string.CompareOrdinal(row.Period, period) < 0);
        var previousReading = currentReading is not null ? currentReading.PreviousReading : priorReading?.CurrentReading ?? room.InitialReading;
        if (currentReading is null) previousReading = Math.Max(previousReading, await MoveoutEndpoints.MeterBaselineAsync(db, room, cancellationToken));
        OccupancyDto? occupancyDto = null;
        if (occupancy is not null)
        {
            var deposit = await db.Invoices.Include(x => x.DepositSettlements).AsNoTracking()
                .SingleOrDefaultAsync(x => x.OccupancyId == occupancy.Id && x.Kind == "Deposit", cancellationToken);
            var token = tokenService.Unprotect(occupancy);
            occupancyDto = new OccupancyDto(occupancy.Id, occupancy.TenantName, occupancy.Phone, occupancy.People, occupancy.StartDate,
                token, token is null ? null : tokenService.Url(token), deposit?.Id, deposit?.Total ?? 0, deposit?.Paid ?? 0, deposit is null ? 0 : Math.Max(0, deposit.Paid - deposit.DepositSettlements.Sum(x => x.Amount)));
        }
        return new RoomDto(room.Id, room.BuildingId, building.Name, room.Name, room.Rent, room.ElectricityRate, room.WaterFee,
            room.WaterPerPerson, room.ServiceFee, room.InitialReading, previousReading, occupancyDto);
    }

    internal static string CurrentVietnamPeriod() => TodayVietnam().ToString("yyyy-MM");

    internal static DateOnly TodayVietnam()
    {
        TimeZoneInfo zone;
        try { zone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh"); }
        catch (TimeZoneNotFoundException) { zone = TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time"); }
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zone).DateTime);
    }

    private static void ValidateFees(string name, decimal rent, decimal electricityRate, decimal waterFee, decimal serviceFee, decimal initialReading)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 100)
            throw new ApiException(StatusCodes.Status400BadRequest, "Room name is required and must be 100 characters or fewer.");
        if (rent < 0 || electricityRate < 0 || waterFee < 0 || serviceFee < 0 || initialReading < 0 ||
            rent > 1_000_000_000 || electricityRate > 10_000_000 || waterFee > 100_000_000 || serviceFee > 100_000_000 || initialReading > 1_000_000_000)
            throw new ApiException(StatusCodes.Status400BadRequest, "Room fees and meter readings must be non-negative values within supported limits.");
    }
}
