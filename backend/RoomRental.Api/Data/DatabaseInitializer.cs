using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using RoomRental.Api.Domain;
using RoomRental.Api.Services;

namespace RoomRental.Api.Data;

public static class DatabaseInitializer
{
    private static readonly PasswordHasher<AppUser> PasswordHasher = new();

    public static async Task InitializeAsync(WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (app.Configuration.GetValue("Database:MigrateOnly", false))
        {
            await db.Database.MigrateAsync();
            await BootstrapAdminAsync(db, app.Configuration);
            return;
        }
        if (app.Environment.IsDevelopment() && app.Configuration.GetValue("Database:MigrateOnStartup", true))
            await db.Database.MigrateAsync();
        else if ((await db.Database.GetPendingMigrationsAsync()).Any())
            throw new InvalidOperationException("Apply database migrations with the deployment identity before starting the application.");

        var seedDevelopmentData = ReadFlag(app.Configuration["SeedDemo"]) || ReadFlag(app.Configuration["SeedDevelopmentData"]);
        if (app.Environment.IsDevelopment() && seedDevelopmentData)
        {
            await SeedDevelopmentAsync(db, scope.ServiceProvider.GetRequiredService<TenantTokenService>());
        }
        else
        {
            await BootstrapAdminAsync(db, app.Configuration);
        }
    }

    private static async Task BootstrapAdminAsync(AppDbContext db, IConfiguration configuration)
    {
        var email = configuration["BootstrapAdmin:Email"]?.Trim().ToLowerInvariant();
        var password = configuration["BootstrapAdmin:Password"];
        if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(password)) return;
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("Set both BootstrapAdmin__Email and BootstrapAdmin__Password to bootstrap the initial administrator.");
        if (!PasswordSecurity.IsValidNewPassword(password))
            throw new InvalidOperationException("BootstrapAdmin__Password must contain 9 to 256 characters.");
        if (await db.Users.AnyAsync(user => user.Email == email)) return;

        var admin = new AppUser
        {
            Name = "Administrator",
            Email = email,
            PasswordHash = "",
            Role = UserRole.Admin,
            Status = OwnerStatus.Approved
        };
        admin.PasswordHash = PasswordHasher.HashPassword(admin, password);
        db.Users.Add(admin);
        await db.SaveChangesAsync();
    }

    private static async Task SeedDevelopmentAsync(AppDbContext db, TenantTokenService tokenService)
    {
        _ = await FindOrAddDevUserAsync(db, "Admin", "admin@phongtro.local", "Admin123!", UserRole.Admin, OwnerStatus.Approved);
        var owner = await FindOrAddDevUserAsync(db, "Chủ trọ mẫu", "owner@phongtro.local", "Owner123!", UserRole.Owner, OwnerStatus.Approved);
        if (await db.Buildings.AnyAsync(building => building.OwnerId == owner.Id)) return;

        var building = new Building { OwnerId = owner.Id, Name = "Nhà trọ Bình An", Address = "12 Nguyễn Trãi, Quận 5, TP. Hồ Chí Minh" };
        db.Buildings.Add(building);
        var roomOne = new Room
        {
            BuildingId = building.Id, Name = "P101", Rent = 3_500_000, ElectricityRate = 4_000,
            WaterFee = 80_000, WaterPerPerson = true, ServiceFee = 120_000, InitialReading = 1250
        };
        var roomTwo = new Room
        {
            BuildingId = building.Id, Name = "P102", Rent = 3_000_000, ElectricityRate = 4_000,
            WaterFee = 100_000, WaterPerPerson = false, ServiceFee = 100_000, InitialReading = 970
        };
        var roomThree = new Room
        {
            BuildingId = building.Id, Name = "P201", Rent = 3_800_000, ElectricityRate = 4_000,
            WaterFee = 80_000, WaterPerPerson = true, ServiceFee = 150_000, InitialReading = 700
        };
        db.Rooms.AddRange(roomOne, roomTwo, roomThree);

        var guestOne = tokenService.Create();
        var guestTwo = tokenService.Create();
        db.Occupancies.AddRange(
            new Occupancy
            {
                RoomId = roomOne.Id, TenantName = "Nguyễn Minh Anh", Phone = "0901234567", People = 2,
                StartDate = new DateOnly(2026, 9, 1), TenantTokenHash = guestOne.Hash, ProtectedTenantToken = guestOne.ProtectedToken
            },
            new Occupancy
            {
                RoomId = roomTwo.Id, TenantName = "Trần Quốc Bảo", Phone = "0912345678", People = 1,
                StartDate = new DateOnly(2026, 10, 1), TenantTokenHash = guestTwo.Hash, ProtectedTenantToken = guestTwo.ProtectedToken
            });
        await db.SaveChangesAsync();
    }

    private static async Task<AppUser> FindOrAddDevUserAsync(AppDbContext db, string name, string email, string password, UserRole role, OwnerStatus status)
    {
        var existing = await db.Users.SingleOrDefaultAsync(user => user.Email == email);
        if (existing is not null) return existing;
        var user = new AppUser { Name = name, Email = email, PasswordHash = "", Role = role, Status = status };
        user.PasswordHash = PasswordHasher.HashPassword(user, password);
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static bool ReadFlag(string? value) => bool.TryParse(value, out var enabled) && enabled;
}
