using System.Text.RegularExpressions;
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
        await db.Database.EnsureCreatedAsync();
        await UpgradeDepositSchemaAsync(db);
        await UpgradePayOsAttemptCheckoutSchemaAsync(db);
        // Additive upgrade for existing MVP databases: keep settings and financial data intact.
        const string webhookTableSql = """
            CREATE TABLE IF NOT EXISTS "PaymentWebhookRegistrations" (
                "OwnerId" __OWNER_ID_TYPE__ PRIMARY KEY,
                "SettingsVersion" TEXT NOT NULL,
                "WebhookUrl" TEXT NOT NULL,
                "Status" TEXT NOT NULL,
                "VerifiedAt" TEXT NULL,
                "Error" TEXT NULL
            );
            """;
        await db.Database.ExecuteSqlRawAsync(webhookTableSql.Replace("__OWNER_ID_TYPE__", db.Database.IsSqlite() ? "TEXT" : "uuid"));
        await db.Database.ExecuteSqlRawAsync(
            "CREATE UNIQUE INDEX IF NOT EXISTS \"IX_PayOsAttempts_InvoiceId_Pending\" ON \"PayOsAttempts\" (\"InvoiceId\") WHERE \"Status\" = 'Pending';");

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
        if (!IsStrongPassword(password))
            throw new InvalidOperationException("BootstrapAdmin__Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.");
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

    private static async Task UpgradeDepositSchemaAsync(AppDbContext db)
    {
        await db.Database.OpenConnectionAsync();
        var connection = db.Database.GetDbConnection();
        bool hasKind;
        using (var command = connection.CreateCommand())
        {
            if (db.Database.IsSqlite())
            {
                command.CommandText = "PRAGMA table_info('Invoices')";
                using var reader = await command.ExecuteReaderAsync();
                hasKind = false;
                while (await reader.ReadAsync()) if (reader.GetString(1) == "Kind") hasKind = true;
            }
            else
            {
                command.CommandText = "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='Invoices' AND column_name='Kind'";
                hasKind = Convert.ToInt64(await command.ExecuteScalarAsync()) > 0;
            }
        }
        bool hasDescription;
        using (var command = connection.CreateCommand())
        {
            if (db.Database.IsSqlite())
            {
                command.CommandText = "PRAGMA table_info('Invoices')";
                using var reader = await command.ExecuteReaderAsync();
                hasDescription = false;
                while (await reader.ReadAsync()) if (reader.GetString(1) == "Description") hasDescription = true;
            }
            else
            {
                command.CommandText = "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='Invoices' AND column_name='Description'";
                hasDescription = Convert.ToInt64(await command.ExecuteScalarAsync()) > 0;
            }
        }
        bool hasFinalMeter;
        using (var command = connection.CreateCommand())
        {
            if (db.Database.IsSqlite())
            {
                command.CommandText = "PRAGMA table_info('Invoices')";
                using var reader = await command.ExecuteReaderAsync();
                hasFinalMeter = false;
                while (await reader.ReadAsync()) if (reader.GetString(1) == "IsFinalMeterReading") hasFinalMeter = true;
            }
            else
            {
                command.CommandText = "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='Invoices' AND column_name='IsFinalMeterReading'";
                hasFinalMeter = Convert.ToInt64(await command.ExecuteScalarAsync()) > 0;
            }
        }
        await using var transaction = await db.Database.BeginTransactionAsync();
        if (!hasFinalMeter)
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Invoices\" ADD COLUMN \"IsFinalMeterReading\" BOOLEAN NOT NULL DEFAULT FALSE");
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS \"IX_Invoices_OccupancyId_FinalMeter\" ON \"Invoices\" (\"OccupancyId\") WHERE \"IsFinalMeterReading\" = TRUE");
        if (!hasDescription)
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Invoices\" ADD COLUMN \"Description\" TEXT NULL");
        if (!hasKind)
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Invoices\" ADD COLUMN \"Kind\" TEXT NOT NULL DEFAULT 'Monthly'");
        const string settlementSql = """
            CREATE TABLE IF NOT EXISTS "DepositSettlements" (
                "Id" __GUID__ PRIMARY KEY, "InvoiceId" __GUID__ NOT NULL,
                "Amount" __MONEY__ NOT NULL, "Kind" TEXT NOT NULL,
                "Reason" TEXT NOT NULL, "IdempotencyKey" TEXT NOT NULL,
                "TargetInvoiceId" __GUID__ NULL, "RecordedAt" TEXT NOT NULL,
                FOREIGN KEY ("InvoiceId") REFERENCES "Invoices" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_DepositSettlements_InvoiceId_IdempotencyKey"
                ON "DepositSettlements" ("InvoiceId", "IdempotencyKey");
            DROP INDEX IF EXISTS "IX_Invoices_RoomId_Period";
            CREATE UNIQUE INDEX "IX_Invoices_RoomId_Period" ON "Invoices" ("RoomId", "Period") WHERE "Kind" = 'Monthly';
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_Invoices_OccupancyId_Deposit" ON "Invoices" ("OccupancyId") WHERE "Kind" = 'Deposit';
            """;
        await db.Database.ExecuteSqlRawAsync(settlementSql.Replace("__GUID__", db.Database.IsSqlite() ? "TEXT" : "uuid")
            .Replace("__MONEY__", db.Database.IsSqlite() ? "TEXT" : "numeric(18,2)"));
        await transaction.CommitAsync();
        await db.Database.CloseConnectionAsync();
    }

    private static async Task UpgradePayOsAttemptCheckoutSchemaAsync(AppDbContext db)
    {
        await db.Database.OpenConnectionAsync();
        try
        {
            var existingColumns = new HashSet<string>(StringComparer.Ordinal);
            using (var command = db.Database.GetDbConnection().CreateCommand())
            {
                if (db.Database.IsSqlite())
                {
                    command.CommandText = "PRAGMA table_info('PayOsAttempts')";
                    using var reader = await command.ExecuteReaderAsync();
                    while (await reader.ReadAsync()) existingColumns.Add(reader.GetString(1));
                }
                else
                {
                    command.CommandText = "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='PayOsAttempts'";
                    using var reader = await command.ExecuteReaderAsync();
                    while (await reader.ReadAsync()) existingColumns.Add(reader.GetString(0));
                }
            }

            var columns = new[]
            {
                "QrCode",
                "AccountName",
                "AccountNumber",
                "BankBin",
                "Description",
                "ProviderStatus",
                "ExpiresAt"
            };

            await using var transaction = await db.Database.BeginTransactionAsync();
            foreach (var name in columns)
            {
                if (!existingColumns.Contains(name))
                {
                    var sql = name switch
                    {
                        "QrCode" => "ALTER TABLE \"PayOsAttempts\" ADD COLUMN \"QrCode\" TEXT NULL",
                        "AccountName" => "ALTER TABLE \"PayOsAttempts\" ADD COLUMN \"AccountName\" TEXT NULL",
                        "AccountNumber" => "ALTER TABLE \"PayOsAttempts\" ADD COLUMN \"AccountNumber\" TEXT NULL",
                        "BankBin" => "ALTER TABLE \"PayOsAttempts\" ADD COLUMN \"BankBin\" TEXT NULL",
                        "Description" => "ALTER TABLE \"PayOsAttempts\" ADD COLUMN \"Description\" TEXT NULL",
                        "ProviderStatus" => "ALTER TABLE \"PayOsAttempts\" ADD COLUMN \"ProviderStatus\" TEXT NULL",
                        "ExpiresAt" when db.Database.IsSqlite() => "ALTER TABLE \"PayOsAttempts\" ADD COLUMN \"ExpiresAt\" INTEGER NULL",
                        "ExpiresAt" => "ALTER TABLE \"PayOsAttempts\" ADD COLUMN \"ExpiresAt\" BIGINT NULL",
                        _ => throw new InvalidOperationException("Unknown payOS checkout metadata column.")
                    };
                    await db.Database.ExecuteSqlRawAsync(sql);
                }
            }
            await transaction.CommitAsync();
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
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

        var guest = tokenService.Create();
        db.Occupancies.AddRange(
            new Occupancy
            {
                RoomId = roomOne.Id, TenantName = "Nguyễn Minh Anh", Phone = "0901234567", People = 2,
                StartDate = new DateOnly(2026, 9, 1), TenantTokenHash = guest.Hash, ProtectedTenantToken = guest.ProtectedToken
            },
            new Occupancy
            {
                RoomId = roomTwo.Id, TenantName = "Trần Quốc Bảo", Phone = "0912345678", People = 1,
                StartDate = new DateOnly(2026, 10, 1)
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

    private static bool IsStrongPassword(string password) =>
        password.Length >= 12 && password.Length <= 256 &&
        Regex.IsMatch(password, "[A-Z]") && Regex.IsMatch(password, "[a-z]") &&
        Regex.IsMatch(password, "[0-9]") && Regex.IsMatch(password, "[^A-Za-z0-9]");

    private static bool ReadFlag(string? value) => bool.TryParse(value, out var enabled) && enabled;
}
