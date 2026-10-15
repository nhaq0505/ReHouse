using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace RoomRental.Api.Data;

// Each provider has its own migration snapshot; the entity model stays shared.
public sealed class SqliteAppDbContext(DbContextOptions<SqliteAppDbContext> options) : AppDbContext(options);

public sealed class PostgresAppDbContext(DbContextOptions<PostgresAppDbContext> options) : AppDbContext(options);

public sealed class SqliteDesignTimeFactory : IDesignTimeDbContextFactory<SqliteAppDbContext>
{
    public SqliteAppDbContext CreateDbContext(string[] args) => new(
        new DbContextOptionsBuilder<SqliteAppDbContext>()
            .UseSqlite(Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
                ?? "Data Source=roomie-design.db").Options);
}

public sealed class PostgresDesignTimeFactory : IDesignTimeDbContextFactory<PostgresAppDbContext>
{
    public PostgresAppDbContext CreateDbContext(string[] args) => new(
        new DbContextOptionsBuilder<PostgresAppDbContext>()
            .UseNpgsql(Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
                ?? "Host=localhost;Database=roomie_design;Username=roomie").Options);
}
