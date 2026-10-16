using System.Text;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using RoomRental.Api.Data;
using RoomRental.Api.Domain;
using RoomRental.Api.Services;

internal static class OperationalHardeningTests
{
    public static async Task RunAsync()
    {
        var key = Encoding.ASCII.GetBytes("12345678901234567890");
        foreach (var vector in new[] {(59L,"94287082"),(1111111109L,"07081804"),(1111111111L,"14050471"),(1234567890L,"89005924"),(2000000000L,"69279037"),(20000000000L,"65353130")})
            if (AdminMfaService.Code(key,vector.Item1/30,8) != vector.Item2) throw new Exception("RFC6238 vector failed");
        using var c = new SqliteConnection("Data Source=:memory:"); c.Open();
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(c).Options);
        db.Database.EnsureCreated();
        var now = DateTimeOffset.UtcNow;
        db.RegistrationVerifications.AddRange(new RegistrationVerification {Email="expired@example.invalid",ChallengeHash="expired",ExpiresAt=now.AddDays(-8),PasswordHash="sensitive"},
            new RegistrationVerification {Email="active@example.invalid",ChallengeHash="active",ExpiresAt=now.AddMinutes(20)},
            new RegistrationVerification {Email="cooldown@example.invalid",ChallengeHash="cooldown",ExpiresAt=now.AddMinutes(-40),WindowStartedAt=now});
        await db.SaveChangesAsync();
        await DataMaintenanceService.CleanAsync(db,now,default);
        if (await db.RegistrationVerifications.CountAsync()!=2) throw new Exception("Maintenance retention removed active/cooldown rows");
        for(int i=0;i<10;i++) await AccountLoginLimiter.ReserveAsync(db,"account@example.invalid",10,default);
        try { await AccountLoginLimiter.ReserveAsync(db,"account@example.invalid",10,default); throw new Exception("Account limit missing"); }
        catch(ApiException e) when(e.StatusCode==429) { }
        if (ApiSupport.SafePath("/api/tenant/secret/invoices") .Contains("secret")) throw new Exception("Token leaked");
        Console.WriteLine("PASS: RFC6238 six vectors; independent retention; persisted account throttling; tenant log redaction");
    }
}
