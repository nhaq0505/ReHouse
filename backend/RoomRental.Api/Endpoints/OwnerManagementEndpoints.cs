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

        routes.MapGet("/dashboard", async (HttpContext context, AppDbContext db, TimeProvider clock, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var rooms = from room in db.Rooms.AsNoTracking()
                        join building in db.Buildings.AsNoTracking() on room.BuildingId equals building.Id
                        where building.OwnerId == ownerId && building.ArchivedAt == null && room.ArchivedAt == null
                        select room.Id;
            var activeOccupancies = db.Occupancies.AsNoTracking().Where(row => row.IsActive && rooms.Contains(row.RoomId));
            var occupiedRooms = await activeOccupancies.CountAsync(cancellationToken);
            var invoices = db.Invoices.AsNoTracking().Where(row => row.OwnerId == ownerId &&
                row.LifecycleState == InvoiceLifecycleState.Issued && row.Kind != "Deposit");
            var billed = await QueryAggregates.SumMoneyAsync(db, invoices.Select(row => row.Total), cancellationToken);
            var paid = await QueryAggregates.SumMoneyAsync(db, invoices.Select(row => row.Paid), cancellationToken);
            var period = ApiSupport.VietnamDate(clock.GetUtcNow()).ToString("yyyy-MM");
            var monthly = invoices.Where(row => row.Period == period);
            var monthlyBilled = await QueryAggregates.SumMoneyAsync(db, monthly.Select(row => row.Total), cancellationToken);
            var monthlyPaid = await QueryAggregates.SumMoneyAsync(db, monthly.Select(row => row.Paid), cancellationToken);
            var monthlyOutstanding = await QueryAggregates.SumMoneyAsync(db,
                monthly.Select(row => row.Total > row.Paid ? row.Total - row.Paid : 0m), cancellationToken);
            var roomCount = await rooms.CountAsync(cancellationToken);
            var pendingReadings = await activeOccupancies.CountAsync(occupancy =>
                !db.Readings.Any(reading => reading.OccupancyId == occupancy.Id && reading.Period == period), cancellationToken);
            return Results.Ok(new
            {
                totalRooms = roomCount,
                occupiedRooms,
                totalBilled = billed,
                totalPaid = paid,
                totalOutstanding = Math.Max(0, billed - paid),
                pendingReadings,
                period,
                monthlyBilled,
                monthlyPaid,
                monthlyOutstanding,
                collectionRate = monthlyBilled == 0 ? 0 : decimal.Round(monthlyPaid / monthlyBilled * 100, 2)
            });
        });

        routes.MapGet("/buildings", async (bool? includeArchived, HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var rows = await db.Buildings.AsNoTracking().Where(row => row.OwnerId == ownerId &&
                    (includeArchived == true || row.ArchivedAt == null))
                .OrderBy(row => row.Name).ThenBy(row => row.Id)
                .Select(row => new { row.Id, row.Name, row.Address, isArchived = row.ArchivedAt != null,
                    archivedAt = row.ArchivedAt, archiveBatchId = row.ArchiveBatchId }).ToListAsync(cancellationToken);
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

        routes.MapDelete("/buildings/{id:guid}", async (Guid id, HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            var building = await db.Buildings.SingleOrDefaultAsync(row => row.Id == id && row.OwnerId == ownerId, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Building was not found.");
            if (building.ArchivedAt is not null)
                throw new ApiException(StatusCodes.Status409Conflict, "Dãy trọ đã được lưu trữ.");

            var rooms = await db.Rooms.Where(room => room.BuildingId == building.Id && room.ArchivedAt == null)
                .OrderBy(room => room.Name).ThenBy(room => room.Id).ToListAsync(cancellationToken);
            foreach (var room in rooms)
            {
                var blockReason = await RoomArchiveBlockReasonAsync(db, ownerId, room.Id, cancellationToken);
                if (blockReason is not null)
                    throw new ApiException(StatusCodes.Status409Conflict,
                        $"Không thể lưu trữ dãy vì phòng {room.Name}: {blockReason}");
            }

            var archivedAt = DateTimeOffset.UtcNow;
            var batchId = Guid.NewGuid();
            building.ArchivedAt = archivedAt;
            building.ArchivedBy = ownerId;
            building.ArchiveBatchId = batchId;
            foreach (var room in rooms)
            {
                room.ArchivedAt = archivedAt;
                room.ArchivedBy = ownerId;
                room.ArchiveBatchId = batchId;
            }
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { archived = true, archiveBatchId = batchId });
        });

        routes.MapPost("/buildings/{id:guid}/restore", async (Guid id, HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            var building = await db.Buildings.SingleOrDefaultAsync(row => row.Id == id && row.OwnerId == ownerId, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Building was not found.");
            if (building.ArchivedAt is null)
                throw new ApiException(StatusCodes.Status409Conflict, "Dãy trọ chưa được lưu trữ.");

            var batchId = building.ArchiveBatchId;
            building.ArchivedAt = null;
            building.ArchivedBy = null;
            building.ArchiveBatchId = null;
            var restoredRoomIds = batchId is Guid archiveBatchId
                ? await db.Rooms.Where(room => room.BuildingId == building.Id && room.ArchiveBatchId == archiveBatchId)
                    .Select(room => room.Id).ToListAsync(cancellationToken)
                : [];
            if (batchId is Guid batch)
            {
                var rooms = await db.Rooms.Where(room => room.BuildingId == building.Id && room.ArchiveBatchId == batch)
                    .ToListAsync(cancellationToken);
                foreach (var room in rooms)
                {
                    room.ArchivedAt = null;
                    room.ArchivedBy = null;
                    room.ArchiveBatchId = null;
                }
            }
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { restored = true, restoredRoomIds });
        });

        routes.MapGet("/rooms", async (string? period, bool? includeArchived, HttpContext context, AppDbContext db, TenantTokenService tokenService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            var readingPeriod = period is null ? CurrentVietnamPeriod() : ApiSupport.NormalizePeriod(period);
            var rows = await (from room in db.Rooms.AsNoTracking()
                              join building in db.Buildings.AsNoTracking() on room.BuildingId equals building.Id
                              where building.OwnerId == ownerId && (includeArchived == true || (room.ArchivedAt == null && building.ArchivedAt == null))
                              orderby building.Name, room.Name, room.Id
                              select new { Room = room, Building = building }).ToListAsync(cancellationToken);
            var roomIds = rows.Select(row => row.Room.Id).ToList();
            var activeOccupancies = await db.Occupancies.AsNoTracking()
                .Where(row => row.IsActive && roomIds.Contains(row.RoomId))
                .ToListAsync(cancellationToken);
            var occupancyByRoom = activeOccupancies.ToDictionary(row => row.RoomId);
            var allReadings = roomIds.Count == 0
                ? []
                : await db.Readings.AsNoTracking()
                    .Where(row => roomIds.Contains(row.RoomId) && (row.Period == readingPeriod ||
                        row.Id == db.Readings.Where(prior => prior.RoomId == row.RoomId && string.Compare(prior.Period, readingPeriod) < 0)
                            .OrderByDescending(prior => prior.Period).ThenByDescending(prior => prior.RecordedAt)
                            .Select(prior => prior.Id).FirstOrDefault()))
                    .OrderByDescending(row => row.Period).ThenByDescending(row => row.RecordedAt)
                    .ToListAsync(cancellationToken);
            var readingsByRoom = allReadings.GroupBy(row => row.RoomId).ToDictionary(g => g.Key, g => (IReadOnlyList<MonthlyReading>)g.ToList());
            // Aggregate physical meter maxima independently of the selected period/occupancy.
            var meterMaxima = await db.Readings.AsNoTracking().Where(x => roomIds.Contains(x.RoomId))
                .GroupBy(x => x.RoomId).Select(g => new { RoomId = g.Key, Maximum = g.Max(x => (double)x.CurrentReading) })
                .ToDictionaryAsync(x => x.RoomId, x => (decimal)x.Maximum, cancellationToken);
            var maxFinalByRoom = await db.Invoices.AsNoTracking()
                .Where(x => roomIds.Contains(x.RoomId) && x.IsFinalMeterReading)
                .GroupBy(x => x.RoomId).Select(g => new { RoomId = g.Key, Maximum = g.Max(x => (double)x.CurrentReading) })
                .ToDictionaryAsync(x => x.RoomId, x => (decimal)x.Maximum, cancellationToken);
            var activeOccupancyIds = activeOccupancies.Select(x => x.Id).ToList();
            var deposits = activeOccupancyIds.Count == 0
                ? []
                : await db.Invoices.Include(x => x.DepositSettlements).AsNoTracking()
                    .Where(x => activeOccupancyIds.Contains(x.OccupancyId) && x.Kind == "Deposit")
                    .ToListAsync(cancellationToken);
            var depositByOccupancy = deposits.ToDictionary(x => x.OccupancyId);

            var result = new List<object>(rows.Count);
            foreach (var row in rows)
            {
                occupancyByRoom.TryGetValue(row.Room.Id, out var occupancy);
                var roomReadings = readingsByRoom.GetValueOrDefault(row.Room.Id) ?? [];
                var maxFinal = maxFinalByRoom.GetValueOrDefault(row.Room.Id, 0m);
                var deposit = occupancy is not null ? depositByOccupancy.GetValueOrDefault(occupancy.Id) : null;
                var dto = BuildRoomDto(tokenService, row.Room, row.Building, occupancy, readingPeriod, roomReadings, maxFinal, deposit, meterMaxima.GetValueOrDefault(row.Room.Id, row.Room.InitialReading));
                result.Add(new { dto.Id, dto.BuildingId, dto.BuildingName, dto.Name, dto.Rent, dto.ElectricityRate, dto.WaterFee,
                    dto.WaterPerPerson, dto.ServiceFee, dto.InitialReading, dto.PreviousReading, dto.Occupancy,
                    isArchived = row.Room.ArchivedAt is not null, archivedAt = row.Room.ArchivedAt,
                    archiveBatchId = row.Room.ArchiveBatchId, buildingArchived = row.Building.ArchivedAt is not null });
            }
            return Results.Ok(result);
        });

        routes.MapPost("/rooms", async (RoomCreateRequest request, HttpContext context, AppDbContext db, TenantTokenService tokenService, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            var owner = await db.Users.SingleOrDefaultAsync(u => u.Id == ownerId, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Owner was not found.");
            if (!owner.IsPro)
            {
                var activeRooms = await (from r in db.Rooms
                                         join b in db.Buildings on r.BuildingId equals b.Id
                                         where b.OwnerId == ownerId && r.ArchivedAt == null && b.ArchivedAt == null
                                         select r.Id).CountAsync(cancellationToken);
                if (activeRooms >= AppUser.FreeTierMaxRooms)
                    throw new ApiException(StatusCodes.Status403Forbidden,
                        $"Gói Miễn phí chỉ được tạo tối đa {AppUser.FreeTierMaxRooms} phòng. Vui lòng nâng cấp tài khoản Pro để thêm phòng.");
            }
            var building = await FindBuildingAsync(db, ownerId, request.BuildingId, cancellationToken);
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
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/rooms/{room.Id}", await ToRoomDtoAsync(db, tokenService, room, building, null, CurrentVietnamPeriod(), cancellationToken));
        });

        routes.MapGet("/rooms/{id:guid}", async (Guid id, string? period, bool? includeArchived, HttpContext context, AppDbContext db, TenantTokenService tokenService, CancellationToken cancellationToken) =>
        {
            var row = await FindRoomAsync(db, ApiSupport.OwnerId(context), id, cancellationToken, includeArchived == true);
            var occupancy = await db.Occupancies.AsNoTracking().SingleOrDefaultAsync(item => item.RoomId == id && item.IsActive, cancellationToken);
            var readingPeriod = period is null ? CurrentVietnamPeriod() : ApiSupport.NormalizePeriod(period);
            var dto = await ToRoomDtoAsync(db, tokenService, row.Room, row.Building, occupancy, readingPeriod, cancellationToken);
            return Results.Ok(new { dto.Id, dto.BuildingId, dto.BuildingName, dto.Name, dto.Rent, dto.ElectricityRate, dto.WaterFee,
                dto.WaterPerPerson, dto.ServiceFee, dto.InitialReading, dto.PreviousReading, dto.Occupancy,
                isArchived = row.Room.ArchivedAt is not null, archivedAt = row.Room.ArchivedAt,
                archiveBatchId = row.Room.ArchiveBatchId, buildingArchived = row.Building.ArchivedAt is not null });
        });

        routes.MapMethods("/rooms/{id:guid}", ["PATCH"], async (Guid id, RoomUpdateRequest request, HttpContext context, AppDbContext db, TenantTokenService tokenService, CancellationToken cancellationToken) =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            var (room, building) = await FindRoomAsync(db, ApiSupport.OwnerId(context), id, cancellationToken);
            ValidateFees(request.Name, request.Rent, request.ElectricityRate, request.WaterFee, request.ServiceFee, 0);
            room.Name = request.Name.Trim();
            room.Rent = ApiSupport.RoundVnd(request.Rent);
            room.ElectricityRate = ApiSupport.RoundVnd(request.ElectricityRate);
            room.WaterFee = ApiSupport.RoundVnd(request.WaterFee);
            room.WaterPerPerson = request.WaterPerPerson;
            room.ServiceFee = ApiSupport.RoundVnd(request.ServiceFee);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            var occupancy = await db.Occupancies.AsNoTracking().SingleOrDefaultAsync(item => item.RoomId == id && item.IsActive, cancellationToken);
            return Results.Ok(await ToRoomDtoAsync(db, tokenService, room, building, occupancy, CurrentVietnamPeriod(), cancellationToken));
        });

        routes.MapDelete("/rooms/{id:guid}", async (Guid id, HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            var row = await (from room in db.Rooms
                             join building in db.Buildings on room.BuildingId equals building.Id
                             where room.Id == id && building.OwnerId == ownerId
                             select new { Room = room, Building = building }).SingleOrDefaultAsync(cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Room was not found.");
            if (row.Room.ArchivedAt is not null)
                throw new ApiException(StatusCodes.Status409Conflict, "Phòng đã được lưu trữ.");
            if (row.Building.ArchivedAt is not null)
                throw new ApiException(StatusCodes.Status409Conflict, "Không thể lưu trữ phòng khi dãy trọ đã được lưu trữ.");
            var blockReason = await RoomArchiveBlockReasonAsync(db, ownerId, row.Room.Id, cancellationToken);
            if (blockReason is not null)
                throw new ApiException(StatusCodes.Status409Conflict, $"Không thể lưu trữ phòng: {blockReason}");

            var batchId = Guid.NewGuid();
            row.Room.ArchivedAt = DateTimeOffset.UtcNow;
            row.Room.ArchivedBy = ownerId;
            row.Room.ArchiveBatchId = batchId;
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { archived = true, archiveBatchId = batchId });
        });

        routes.MapPost("/rooms/{id:guid}/restore", async (Guid id, HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            var row = await (from room in db.Rooms
                             join building in db.Buildings on room.BuildingId equals building.Id
                             where room.Id == id && building.OwnerId == ownerId
                             select new { Room = room, Building = building }).SingleOrDefaultAsync(cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Room was not found.");
            if (row.Room.ArchivedAt is null)
                throw new ApiException(StatusCodes.Status409Conflict, "Phòng chưa được lưu trữ.");
            if (row.Building.ArchivedAt is not null)
                throw new ApiException(StatusCodes.Status409Conflict, "Cần khôi phục dãy trọ trước khi khôi phục phòng.");
            var owner = await db.Users.SingleOrDefaultAsync(u => u.Id == ownerId, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Owner was not found.");
            if (!owner.IsPro)
            {
                var activeRooms = await (from r in db.Rooms
                                         join b in db.Buildings on r.BuildingId equals b.Id
                                         where b.OwnerId == ownerId && r.ArchivedAt == null && b.ArchivedAt == null
                                         select r.Id).CountAsync(cancellationToken);
                if (activeRooms >= AppUser.FreeTierMaxRooms)
                    throw new ApiException(StatusCodes.Status403Forbidden,
                        $"Gói Miễn phí chỉ được tạo tối đa {AppUser.FreeTierMaxRooms} phòng. Vui lòng nâng cấp tài khoản Pro để khôi phục phòng.");
            }
            row.Room.ArchivedAt = null;
            row.Room.ArchivedBy = null;
            row.Room.ArchiveBatchId = null;
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { restored = true });
        });

        routes.MapMethods("/rooms/{id:guid}/occupancy", ["PATCH"], async (Guid id, OccupancyUpdateRequest request,
            HttpContext context, AppDbContext db, TenantTokenService tokenService, CancellationToken ct) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var (room, building) = await FindRoomAsync(db, ownerId, id, ct);
            var occupancy = await db.Occupancies.SingleOrDefaultAsync(x => x.Id == request.OccupancyId && x.RoomId == id && x.IsActive, ct)
                ?? throw new ApiException(409, "Lượt thuê đã thay đổi hoặc không còn hoạt động. Vui lòng tải lại phòng.");
            if (string.IsNullOrWhiteSpace(request.TenantName) || request.TenantName.Trim().Length > 160)
                throw new ApiException(400, "Tên người thuê cần từ 1 đến 160 ký tự.");
            if (request.Phone?.Trim().Length > 60) throw new ApiException(400, "Số điện thoại tối đa 60 ký tự.");
            if (request.People is < 1 or > 30) throw new ApiException(400, "Số người ở cần từ 1 đến 30.");
            var peopleChanged = occupancy.People != request.People;
            occupancy.TenantName = request.TenantName.Trim();
            occupancy.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
            occupancy.People = request.People;
            if (peopleChanged)
            {
                // Issued invoices (including unpaid ones) are finalized snapshots. Only unpaid drafts may change.
                var drafts = await db.Invoices.Where(x => x.OwnerId == ownerId && x.OccupancyId == occupancy.Id &&
                    x.Kind == "Monthly" && x.LifecycleState == InvoiceLifecycleState.Draft && x.WaterPerPerson == true).ToListAsync(ct);
                foreach (var draft in drafts)
                {
                    if (draft.Paid != 0 || draft.Status == InvoiceStatus.Paid ||
                        await db.Receipts.AnyAsync(x => x.InvoiceId == draft.Id, ct) ||
                        await db.PayOsAttempts.AnyAsync(x => x.InvoiceId == draft.Id && x.Status == PaymentAttemptStatus.Pending, ct))
                        throw new ApiException(409, "Hóa đơn nháp có thanh toán hoặc giao dịch đang chờ. Cần xử lý trước khi đổi số người.");
                    if (draft.WaterRate is null) throw new ApiException(409, "Hóa đơn nháp thiếu bảng phí nước đã lưu.");
                    var before = BillingEndpoints.SerializeSnapshot(draft);
                    draft.WaterAmount = ApiSupport.RoundVnd(draft.WaterRate.Value * occupancy.People);
                    draft.Total = InvoiceService.ValidateTotal(draft.Rent, draft.ElectricityAmount, draft.WaterAmount, draft.ServiceAmount);
                    draft.Version++;
                    InvoiceService.RecalculateStatus(draft);
                    await BillingEndpoints.AddRevisionAsync(db, draft, Guid.NewGuid(), BillingEndpoints.Fingerprint(request),
                        "Cập nhật số người ở cho hóa đơn nháp.", ownerId, before, BillingEndpoints.SerializeSnapshot(draft), ct);
                }
            }
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.Ok(await ToRoomDtoAsync(db, tokenService, room, building, occupancy, CurrentVietnamPeriod(), ct));
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
                    BuildingId = building.Id, RoomName = room.Name, BuildingName = building.Name, TenantName = occupancy.TenantName,
                    Period = currentPeriod, Kind = "Deposit", Total = request.DepositAmount, DueDate = today });
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(await ToRoomDtoAsync(db, tokenService, room, building, occupancy, currentPeriod, cancellationToken));
        });

        routes.MapPost("/rooms/{id:guid}/end-occupancy", async (Guid id, CompleteMoveoutRequest request,
            HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
            await MoveoutEndpoints.CompleteMoveoutAsync(id, request, context, db, cancellationToken));

        routes.MapPost("/rooms/{id:guid}/rotate-link", async (Guid id, HttpContext context, AppDbContext db,
            TenantTokenService tokenService, PaymentWebhookService webhookService, IConfiguration configuration, CancellationToken cancellationToken) =>
        {
            var ownerId = ApiSupport.OwnerId(context);
            if (configuration.GetValue("RequireVerifiedPaymentForTenantLink", true))
            {
                var settings = await webhookService.GetAsync(ownerId, cancellationToken);
                if (settings.WebhookStatus != "Verified")
                    throw new ApiException(StatusCodes.Status400BadRequest, "Chưa lưu cấu hình payOS đã được xác minh. Vui lòng thiết lập thanh toán trước khi cấp link cho khách.");
            }

            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            _ = await FindRoomAsync(db, ownerId, id, cancellationToken);
            var occupancy = await db.Occupancies.SingleOrDefaultAsync(row => row.RoomId == id && row.IsActive, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status409Conflict, "This room has no active occupancy.");
            var token = tokenService.Create();
            occupancy.TenantTokenHash = token.Hash;
            occupancy.ProtectedTenantToken = token.ProtectedToken;
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new RotateLinkDto(token.Token, tokenService.Url(token.Token)));
        });
    }

    internal static async Task<Building> FindBuildingAsync(AppDbContext db, Guid ownerId, Guid buildingId, CancellationToken cancellationToken)
    {
        var building = await db.Buildings.SingleOrDefaultAsync(row => row.Id == buildingId && row.OwnerId == ownerId, cancellationToken)
            ?? throw new ApiException(StatusCodes.Status404NotFound, "Building was not found.");
        if (building.ArchivedAt is not null)
            throw new ApiException(StatusCodes.Status409Conflict, "Dãy trọ đã được lưu trữ. Khôi phục dãy trước khi tạo phòng.");
        return building;
    }

    internal static async Task<(Room Room, Building Building)> FindRoomAsync(AppDbContext db, Guid ownerId, Guid roomId,
        CancellationToken cancellationToken, bool allowArchived = false)
    {
        var row = await (from room in db.Rooms
                         join building in db.Buildings on room.BuildingId equals building.Id
                         where room.Id == roomId && building.OwnerId == ownerId
                         select new { Room = room, Building = building }).SingleOrDefaultAsync(cancellationToken);
        if (row is null) throw new ApiException(StatusCodes.Status404NotFound, "Room was not found.");
        if (!allowArchived && row.Building.ArchivedAt is not null)
            throw new ApiException(StatusCodes.Status409Conflict, "Dãy trọ đã được lưu trữ. Khôi phục dãy trước khi tiếp tục.");
        if (!allowArchived && row.Room.ArchivedAt is not null)
            throw new ApiException(StatusCodes.Status409Conflict, "Phòng đã được lưu trữ. Khôi phục phòng trước khi tiếp tục.");
        return (row.Room, row.Building);
    }

    private static async Task<string?> RoomArchiveBlockReasonAsync(AppDbContext db, Guid ownerId, Guid roomId, CancellationToken ct)
    {
        if (await db.Occupancies.AnyAsync(row => row.RoomId == roomId && row.IsActive, ct))
            return "còn người thuê đang ở.";
        if (await db.Invoices.AnyAsync(invoice => invoice.OwnerId == ownerId && invoice.RoomId == roomId &&
                invoice.LifecycleState == InvoiceLifecycleState.Draft, ct))
            return "còn hóa đơn nháp.";
        if (await db.Invoices.AnyAsync(invoice => invoice.OwnerId == ownerId && invoice.RoomId == roomId &&
                invoice.LifecycleState == InvoiceLifecycleState.Issued && invoice.Kind != "Deposit" && invoice.Total > invoice.Paid, ct))
            return "còn hóa đơn đã phát hành chưa thu đủ.";

        var depositRows = await db.Invoices.AsNoTracking()
            .Where(invoice => invoice.OwnerId == ownerId && invoice.RoomId == roomId &&
                              invoice.LifecycleState == InvoiceLifecycleState.Issued && invoice.Kind == "Deposit")
            .Select(invoice => new { invoice.Id, invoice.Total, invoice.Paid }).ToListAsync(ct);
        if (depositRows.Any(invoice => invoice.Paid < invoice.Total))
            return "còn khoản cọc chưa thu đủ.";
        var depositIds = depositRows.Select(invoice => invoice.Id).ToList();
        if (depositIds.Count > 0)
        {
            var settlements = await db.DepositSettlements.AsNoTracking().Where(row => depositIds.Contains(row.InvoiceId))
                .Select(row => new { row.InvoiceId, row.Amount }).ToListAsync(ct);
            var settledByInvoice = settlements.GroupBy(row => row.InvoiceId)
                .ToDictionary(group => group.Key, group => group.Sum(row => row.Amount));
            if (depositRows.Any(invoice => invoice.Paid > settledByInvoice.GetValueOrDefault(invoice.Id)))
                return "còn tiền cọc đang giữ.";
        }
        if (await (from attempt in db.PayOsAttempts.AsNoTracking()
                   join invoice in db.Invoices.AsNoTracking() on attempt.InvoiceId equals invoice.Id
                   where invoice.OwnerId == ownerId && invoice.RoomId == roomId && attempt.Status == PaymentAttemptStatus.Pending
                   select attempt.Id).AnyAsync(ct))
            return "còn giao dịch payOS đang chờ đối soát.";
        return null;
    }

    internal static async Task<RoomDto> ToRoomDtoAsync(AppDbContext db, TenantTokenService tokenService, Room room, Building building, Occupancy? occupancy, string period, CancellationToken cancellationToken)
    {
        var readings = await db.Readings.AsNoTracking().Where(row => row.RoomId == room.Id && (row.Period == period ||
                row.Id == db.Readings.Where(prior => prior.RoomId == room.Id && string.Compare(prior.Period, period) < 0)
                    .OrderByDescending(prior => prior.Period).ThenByDescending(prior => prior.RecordedAt)
                    .Select(prior => prior.Id).FirstOrDefault()))
            .OrderByDescending(row => row.Period).ThenByDescending(row => row.RecordedAt).ToListAsync(cancellationToken);
        var maxReading = await QueryAggregates.MaxReadingAsync(db,
            db.Readings.AsNoTracking().Where(x => x.RoomId == room.Id).Select(x => x.CurrentReading), cancellationToken);
        var maxFinal = await QueryAggregates.MaxReadingAsync(db,
            db.Invoices.AsNoTracking().Where(x => x.RoomId == room.Id && x.IsFinalMeterReading).Select(x => x.CurrentReading), cancellationToken);
        var deposit = occupancy is null
            ? null
            : await db.Invoices.Include(x => x.DepositSettlements).AsNoTracking()
                .SingleOrDefaultAsync(x => x.OccupancyId == occupancy.Id && x.Kind == "Deposit", cancellationToken);
        return BuildRoomDto(tokenService, room, building, occupancy, period, readings, maxFinal, deposit, maxReading);
    }

    internal static RoomDto BuildRoomDto(TenantTokenService tokenService, Room room, Building building, Occupancy? occupancy, string period,
        IReadOnlyList<MonthlyReading> readings, decimal maxFinalReading, Invoice? deposit, decimal? maxPhysicalReading = null)
    {
        // The physical room can have one reading per occupancy in the same month.
        // Prefer the active occupancy's reading for the room's current-reading field;
        // when it has none yet, use only an earlier period as the prior reading.
        var currentPeriodReadings = readings.Where(row => row.Period == period);
        var currentReading = occupancy is null
            ? currentPeriodReadings.FirstOrDefault()
            : currentPeriodReadings.SingleOrDefault(row => row.OccupancyId == occupancy.Id);
        var priorReading = readings.FirstOrDefault(row => string.CompareOrdinal(row.Period, period) < 0);
        var previousReading = currentReading is not null ? currentReading.PreviousReading : priorReading?.CurrentReading ?? room.InitialReading;
        if (currentReading is null)
        {
            var maxReading = maxPhysicalReading ?? (readings.Count > 0 ? readings.Max(r => r.CurrentReading) : room.InitialReading);
            var baseline = Math.Max(Math.Max(room.InitialReading, maxReading), maxFinalReading);
            previousReading = Math.Max(previousReading, baseline);
        }
        OccupancyDto? occupancyDto = null;
        if (occupancy is not null)
        {
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
        return ApiSupport.VietnamDate(DateTimeOffset.UtcNow);
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
