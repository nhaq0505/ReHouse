using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using RoomRental.Api.Data;
using RoomRental.Api.Domain;

if (args.Length == 0 || args.Contains("--help", StringComparer.Ordinal))
{
    Console.WriteLine("Usage: RoomRental.DbMigrator --source <sqlite-backup> --credentials <protected-postgres.env> --database <empty-target-db> [--host 127.0.0.1] [--port 15432]");
    return;
}

var finalTargetConfirmed = args.Contains("--confirm-final-target", StringComparer.Ordinal);
if (finalTargetConfirmed && args.Count(argument => argument == "--confirm-final-target") != 1)
    throw new ArgumentException("--confirm-final-target can only be supplied once.");
var arguments = ParseArguments(args.Where(argument => argument != "--confirm-final-target").ToArray());
var sourcePath = Path.GetFullPath(Required(arguments, "source"));
var credentialsPath = Path.GetFullPath(Required(arguments, "credentials"));
var targetDatabase = Required(arguments, "database");
if (string.Equals(targetDatabase, "room_rental", StringComparison.Ordinal) != finalTargetConfirmed)
    throw new InvalidOperationException("The reserved room_rental cutover database requires --confirm-final-target; that flag is valid only for room_rental.");
var targetHost = arguments.GetValueOrDefault("host", "127.0.0.1");
if (!int.TryParse(arguments.GetValueOrDefault("port", "15432"), out var targetPort) || targetPort is < 1 or > 65535)
    throw new ArgumentException("--port must be a valid TCP port.");

if (!File.Exists(sourcePath)) throw new FileNotFoundException("SQLite backup was not found.", sourcePath);
if (!File.Exists(credentialsPath)) throw new FileNotFoundException("Protected PostgreSQL environment file was not found.", credentialsPath);
EnsurePrivateFile(credentialsPath);

var credentials = ReadEnvFile(credentialsPath);
var username = credentials.GetValueOrDefault("POSTGRES_USER", "room_rental");
var password = Required(credentials, "POSTGRES_PASSWORD");
var connectionString = new NpgsqlConnectionStringBuilder
{
    Host = targetHost,
    Port = targetPort,
    Database = targetDatabase,
    Username = username,
    Password = password,
    Pooling = false,
    Timeout = 15,
    CommandTimeout = 120,
    ApplicationName = "RoomRental.DbMigrator"
}.ConnectionString;

var expectedTables = new[]
{
    "AuthSessions", "Buildings", "DepositSettlements", "InvoiceRevisions", "Invoices", "MoveoutCompletions",
    "Occupancies", "PayOsAttempts", "PaymentSettings", "PaymentWebhookRegistrations", "ProcessedWebhooks",
    "Readings", "Receipts", "Rooms", "Users"
};

await using var sqliteConnection = new Microsoft.Data.Sqlite.SqliteConnection(
    new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder { DataSource = sourcePath, Mode = Microsoft.Data.Sqlite.SqliteOpenMode.ReadOnly }.ToString());
await sqliteConnection.OpenAsync();
await ValidateSqliteBackupAsync(sqliteConnection, expectedTables);

var sourceOptions = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(sqliteConnection).Options;
var targetOptions = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options;
await using var source = new AppDbContext(sourceOptions);
await using var target = new AppDbContext(targetOptions);

await target.Database.OpenConnectionAsync();
var existingTables = await ReadPostgresTablesAsync(target);
if (existingTables.Count != 0)
    throw new InvalidOperationException("Target database is not empty; no data was imported. Use a fresh database for this snapshot.");

if (!await target.Database.EnsureCreatedAsync())
    throw new InvalidOperationException("PostgreSQL schema initialization did not create a fresh schema.");

var createdTables = await ReadPostgresTablesAsync(target);
if (!createdTables.SetEquals(expectedTables))
    throw new InvalidOperationException("The PostgreSQL schema table set does not match the current application model.");

await using var transaction = await target.Database.BeginTransactionAsync();
try
{
    var counts = new SortedDictionary<string, int>(StringComparer.Ordinal);
    counts["Users"] = await CopySetAsync<AppUser>(source, target);
    counts["AuthSessions"] = await CopySetAsync<AuthSession>(source, target);
    counts["Buildings"] = await CopySetAsync<Building>(source, target);
    counts["Rooms"] = await CopySetAsync<Room>(source, target);
    counts["Occupancies"] = await CopySetAsync<Occupancy>(source, target);
    counts["Readings"] = await CopySetAsync<MonthlyReading>(source, target);
    counts["Invoices"] = await CopySetAsync<Invoice>(source, target);
    counts["InvoiceRevisions"] = await CopySetAsync<InvoiceRevision>(source, target);
    counts["DepositSettlements"] = await CopySetAsync<DepositSettlement>(source, target);
    counts["MoveoutCompletions"] = await CopySetAsync<MoveoutCompletion>(source, target);
    counts["Receipts"] = await CopySetAsync<PaymentReceipt>(source, target);
    counts["PaymentSettings"] = await CopySetAsync<OwnerPaymentSettings>(source, target);
    counts["PaymentWebhookRegistrations"] = await CopySetAsync<PaymentWebhookRegistration>(source, target);
    counts["PayOsAttempts"] = await CopySetAsync<PayOsAttempt>(source, target);
    counts["ProcessedWebhooks"] = await CopySetAsync<ProcessedWebhook>(source, target);

    foreach (var pair in counts)
    {
        var targetCount = await CountTargetRowsAsync(target, pair.Key);
        if (targetCount != pair.Value)
            throw new InvalidOperationException($"Row count mismatch for {pair.Key}: source={pair.Value}, target={targetCount}.");
    }

    await transaction.CommitAsync();
    foreach (var pair in counts) Console.WriteLine($"{pair.Key}: {pair.Value}");
    Console.WriteLine("Import committed. Values were copied through the EF entity model; timestamps were normalized to UTC.");
}
catch
{
    await transaction.RollbackAsync();
    throw;
}

static Dictionary<string, string> ParseArguments(string[] args)
{
    var result = new Dictionary<string, string>(StringComparer.Ordinal);
    for (var i = 0; i < args.Length; i++)
    {
        if (!args[i].StartsWith("--", StringComparison.Ordinal) || i + 1 >= args.Length || args[i + 1].StartsWith("--", StringComparison.Ordinal))
            throw new ArgumentException("Arguments must be --name value pairs.");
        if (!result.TryAdd(args[i][2..], args[++i]))
            throw new ArgumentException("An argument was supplied more than once.");
    }
    var allowed = new HashSet<string>(["source", "credentials", "database", "host", "port"], StringComparer.Ordinal);
    if (result.Keys.Any(key => !allowed.Contains(key))) throw new ArgumentException("An unknown argument was supplied.");
    return result;
}

static string Required(IReadOnlyDictionary<string, string> values, string key) =>
    values.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value)
        ? value
        : throw new ArgumentException($"Missing required value: {key}.");

static Dictionary<string, string> ReadEnvFile(string path)
{
    var values = new Dictionary<string, string>(StringComparer.Ordinal);
    foreach (var raw in File.ReadLines(path))
    {
        var line = raw.Trim();
        if (line.Length == 0 || line.StartsWith('#')) continue;
        var separator = line.IndexOf('=');
        if (separator <= 0) throw new InvalidDataException("The PostgreSQL environment file contains an invalid line.");
        values[line[..separator].Trim()] = line[(separator + 1)..].Trim();
    }
    return values;
}

static void EnsurePrivateFile(string path)
{
    if (OperatingSystem.IsWindows()) return;
    var mode = File.GetUnixFileMode(path);
    if ((mode & (UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute |
                 UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute)) != 0)
        throw new UnauthorizedAccessException("The PostgreSQL environment file must not be accessible to group or other users.");
}

static async Task ValidateSqliteBackupAsync(Microsoft.Data.Sqlite.SqliteConnection connection, IReadOnlyCollection<string> expectedTables)
{
    await using (var command = connection.CreateCommand())
    {
        command.CommandText = "PRAGMA integrity_check;";
        var integrity = Convert.ToString(await command.ExecuteScalarAsync());
        if (!string.Equals(integrity, "ok", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("SQLite backup failed PRAGMA integrity_check.");
    }

    await using (var command = connection.CreateCommand())
    {
        command.CommandText = "PRAGMA foreign_key_check;";
        await using var reader = await command.ExecuteReaderAsync();
        if (await reader.ReadAsync()) throw new InvalidDataException("SQLite backup contains foreign-key violations.");
    }

    var actual = new HashSet<string>(StringComparer.Ordinal);
    await using (var command = connection.CreateCommand())
    {
        command.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'SchemaUpgrades';";
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) actual.Add(reader.GetString(0));
    }
    if (!actual.SetEquals(expectedTables))
        throw new InvalidDataException("SQLite table set does not match the supported application model; refusing a partial import.");
}

static async Task<HashSet<string>> ReadPostgresTablesAsync(AppDbContext context)
{
    var result = new HashSet<string>(StringComparer.Ordinal);
    await using var command = context.Database.GetDbConnection().CreateCommand();
    command.CommandText = "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = current_schema() AND tablename <> 'SchemaUpgrades';";
    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync()) result.Add(reader.GetString(0));
    return result;
}

[System.Diagnostics.CodeAnalysis.SuppressMessage("Usage", "EF1002:Risk of vulnerability to SQL injection.",
    Justification = "Raw SQL selects from trusted, fixed entity columns with hardcoded fallback expressions.")]
static async Task<int> CopySetAsync<TEntity>(AppDbContext source, AppDbContext target) where TEntity : class
{
    // Read pre-upgrade SQLite backups without changing the read-only source.
    IQueryable<TEntity> query = source.Set<TEntity>();
    if (typeof(TEntity) == typeof(AppUser) || typeof(TEntity) == typeof(MonthlyReading) || typeof(TEntity) == typeof(PayOsAttempt))
    {
        var tableName = typeof(TEntity) == typeof(AppUser) ? "Users"
                      : typeof(TEntity) == typeof(MonthlyReading) ? "Readings"
                      : "PayOsAttempts";
        var columns = new HashSet<string>(StringComparer.Ordinal);
        using var command = source.Database.GetDbConnection().CreateCommand();
        command.CommandText = $"PRAGMA table_info('{tableName}')";
        using (var reader = await command.ExecuteReaderAsync())
            while (await reader.ReadAsync()) columns.Add(reader.GetString(1));

        if (typeof(TEntity) == typeof(AppUser))
        {
            var selectParts = new List<string> { "*" };
            if (!columns.Contains("PasswordResetHash"))
            {
                selectParts.Add("NULL AS PasswordResetHash");
                selectParts.Add("NULL AS PasswordResetExpiresAt");
            }
            if (!columns.Contains("SubscriptionTier"))
                selectParts.Add("'Free' AS SubscriptionTier");
            if (!columns.Contains("SubscriptionExpiresAt"))
                selectParts.Add("NULL AS SubscriptionExpiresAt");
            if (selectParts.Count > 1)
                query = source.Set<TEntity>().FromSqlRaw($"SELECT {string.Join(", ", selectParts)} FROM Users");
        }
        else if (typeof(TEntity) == typeof(MonthlyReading))
        {
            if (!columns.Contains("OccupantsCount"))
                query = source.Set<TEntity>().FromSqlRaw("SELECT *, NULL AS OccupantsCount FROM Readings");
        }
        else if (typeof(TEntity) == typeof(PayOsAttempt))
        {
            var selectParts = new List<string> { "*" };
            if (!columns.Contains("Kind"))
                selectParts.Add("'Invoice' AS Kind");
            if (!columns.Contains("SubscriptionDays"))
                selectParts.Add("NULL AS SubscriptionDays");
            if (selectParts.Count > 1)
                query = source.Set<TEntity>().FromSqlRaw($"SELECT {string.Join(", ", selectParts)} FROM PayOsAttempts");
        }
    }
    var sourceRows = await query.AsNoTracking().ToListAsync();
    NormalizeDateTimes(sourceRows);
    target.Set<TEntity>().AddRange(sourceRows);
    await target.SaveChangesAsync();
    return sourceRows.Count;
}

static void NormalizeDateTimes<TEntity>(IEnumerable<TEntity> rows) where TEntity : class
{
    var properties = typeof(TEntity).GetProperties(BindingFlags.Instance | BindingFlags.Public)
        .Where(property => property.CanRead && property.CanWrite &&
                           (property.PropertyType == typeof(DateTimeOffset) || property.PropertyType == typeof(DateTimeOffset?)))
        .ToArray();
    foreach (var row in rows)
    foreach (var property in properties)
    {
        var value = property.GetValue(row);
        if (value is DateTimeOffset dateTimeOffset) property.SetValue(row, dateTimeOffset.ToUniversalTime());
    }
}

static Task<int> CountTargetRowsAsync(AppDbContext target, string table) => table switch
{
    "Users" => target.Users.CountAsync(),
    "AuthSessions" => target.AuthSessions.CountAsync(),
    "Buildings" => target.Buildings.CountAsync(),
    "Rooms" => target.Rooms.CountAsync(),
    "Occupancies" => target.Occupancies.CountAsync(),
    "Readings" => target.Readings.CountAsync(),
    "Invoices" => target.Invoices.CountAsync(),
    "InvoiceRevisions" => target.InvoiceRevisions.CountAsync(),
    "DepositSettlements" => target.DepositSettlements.CountAsync(),
    "MoveoutCompletions" => target.MoveoutCompletions.CountAsync(),
    "Receipts" => target.Receipts.CountAsync(),
    "PaymentSettings" => target.PaymentSettings.CountAsync(),
    "PaymentWebhookRegistrations" => target.PaymentWebhookRegistrations.CountAsync(),
    "PayOsAttempts" => target.PayOsAttempts.CountAsync(),
    "ProcessedWebhooks" => target.ProcessedWebhooks.CountAsync(),
    _ => throw new ArgumentOutOfRangeException(nameof(table))
};
