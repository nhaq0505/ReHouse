using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RoomRental.Api.Data;
using RoomRental.Api.Domain;
using RoomRental.Api.Endpoints;
using RoomRental.Api.Services;

// Actual production route handlers, in-memory HTTP/database and synthetic authentication.
// Every provider request is handled in-process; no live payOS connection is possible.
internal static class TenantLinkHttpTests
{
    private static readonly Guid OwnerId = Guid.NewGuid();

    public static async Task RunAsync()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        using var provider = new ConfirmWebhookHandler();
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        builder.Logging.ClearProviders();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["PublicBaseUrl"] = "https://roomie.example.invalid",
            ["WebhookBaseUrl"] = "https://callbacks.example.invalid",
            ["RequireVerifiedPaymentForTenantLink"] = "true"
        });
        builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connection));
        builder.Services.AddSingleton<IDataProtectionProvider>(new EphemeralDataProtectionProvider());
        builder.Services.AddSingleton<TenantTokenService>();
        builder.Services.AddScoped<PaymentWebhookService>();
        builder.Services.AddScoped<PayOsService>();
        builder.Services.AddScoped<InvoiceService>();
        builder.Services.AddScoped<ManualReceiptService>();
        builder.Services.AddSingleton<IHttpClientFactory>(provider);
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddAuthentication("fixture").AddScheme<AuthenticationSchemeOptions, FixtureAuthentication>("fixture", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(options => options.AddPolicy("tenant-payment",
            _ => System.Threading.RateLimiting.RateLimitPartition.GetNoLimiter("fixture")));
        await using var app = builder.Build();
        app.UseMiddleware<ApiExceptionMiddleware>();
        app.UseRouting();
        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapOwnerManagementEndpoints();
        app.MapBillingEndpoints();
        app.MapPaymentEndpoints();

        var buildingId = Guid.NewGuid();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Users.Add(new AppUser { Id = OwnerId, Name = "Fixture Owner", Email = "owner@example.invalid", PasswordHash = "unused-fixture", Role = UserRole.Owner });
            db.Buildings.Add(new Building { Id = buildingId, OwnerId = OwnerId, Name = "Fixture building" });
            await db.SaveChangesAsync();
        }
        await app.StartAsync();
        using var client = app.GetTestClient();
        var room = await JsonAsync(await client.PostAsJsonAsync("/api/rooms", new
        {
            buildingId, name = "Fixture room", rent = 1_000_000, electricityRate = 3000,
            waterFee = 50_000, serviceFee = 0, initialReading = 0
        }), HttpStatusCode.Created);
        var roomId = room.GetProperty("id").GetGuid();
        var occupancy = await JsonAsync(await client.PostAsJsonAsync($"/api/rooms/{roomId}/occupancy", new
        {
            tenantName = "Fixture Tenant", people = 1, startDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)), depositAmount = 100_000
        }));
        var occupancyId = occupancy.GetProperty("occupancy").GetProperty("id").GetGuid();
        Guid invoiceId;
        string? originalHash;
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            invoiceId = (await db.Invoices.SingleAsync()).Id;
            originalHash = (await db.Occupancies.SingleAsync()).TenantTokenHash;
        }
        AssertHidden(occupancy, "occupancy creation does not expose a link before payOS verification");
        await AssertReadLinksAsync(client, roomId, invoiceId, hidden: true);
        await AssertRejectedAsync(client, roomId);
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert((await db.Occupancies.SingleAsync()).TenantTokenHash == originalHash, "rejected rotation preserves the existing token");
        }
        AssertHidden(await JsonAsync(await client.PatchAsJsonAsync($"/api/rooms/{roomId}", new
        {
            name = "Edited fixture room", rent = 1_000_000, electricityRate = 3000, waterFee = 50_000, serviceFee = 0
        })), "room edits cannot leak a tenant link");
        AssertHidden(await JsonAsync(await client.PatchAsJsonAsync($"/api/rooms/{roomId}/occupancy", new
        {
            occupancyId, tenantName = "Edited Fixture Tenant", people = 1
        })), "occupancy edits cannot leak a tenant link");

        // Saved credentials are insufficient when confirmation fails.
        var settings = await JsonAsync(await client.PutAsJsonAsync("/api/settings/payment", new
        {
            clientId = "synthetic-client", apiKey = "synthetic-api", checksumKey = "synthetic-checksum"
        }));
        Assert(settings.GetProperty("webhookStatus").GetString() == "Failed", "saved but unverified payOS remains blocked");
        await AssertRejectedAsync(client, roomId);
        await AssertReadLinksAsync(client, roomId, invoiceId, hidden: true);

        provider.Verified = true;
        settings = await JsonAsync(await client.PostAsync("/api/settings/payment/verify-webhook", null));
        Assert(settings.GetProperty("webhookStatus").GetString() == "Verified", "fake provider verifies payOS through the HTTP endpoint");
        await AssertReadLinksAsync(client, roomId, invoiceId, hidden: false);
        var secondRoom = await JsonAsync(await client.PostAsJsonAsync("/api/rooms", new
        {
            buildingId, name = "Verified fixture room", rent = 1_000_000, electricityRate = 3000,
            waterFee = 50_000, serviceFee = 0, initialReading = 0
        }), HttpStatusCode.Created);
        var verifiedOccupancy = await JsonAsync(await client.PostAsJsonAsync($"/api/rooms/{secondRoom.GetProperty("id").GetGuid()}/occupancy", new
        {
            tenantName = "Verified Fixture Tenant", people = 1, startDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)), depositAmount = 0
        }));
        Assert(!string.IsNullOrEmpty(verifiedOccupancy.GetProperty("occupancy").GetProperty("token").GetString()),
            "occupancy creation exposes a link after payOS verification");
        var oldToken = (await JsonAsync(await client.GetAsync($"/api/rooms/{roomId}"))).GetProperty("occupancy").GetProperty("token").GetString();
        var rotated = await JsonAsync(await client.PostAsync($"/api/rooms/{roomId}/rotate-link", null));
        var newToken = rotated.GetProperty("token").GetString();
        Assert(!string.IsNullOrEmpty(newToken) && newToken != oldToken, "verified owner can rotate a link");
        using var revoked = await client.GetAsync($"/api/tenant/{oldToken}");
        Assert(revoked.StatusCode == HttpStatusCode.NotFound, "rotation revokes the old guest link");
        await JsonAsync(await client.GetAsync($"/api/tenant/{newToken}"));

        // Verification belongs to the current origin/credentials, not just a saved status.
        builder.Configuration["WebhookBaseUrl"] = "https://changed.example.invalid";
        await AssertRejectedAsync(client, roomId);
        await AssertReadLinksAsync(client, roomId, invoiceId, hidden: true);
        var existingGuest = await JsonAsync(await client.GetAsync($"/api/tenant/{newToken}"));
        Assert(existingGuest.GetProperty("room").GetProperty("id").GetGuid() == roomId,
            "previously shared links still show invoices after payment setup changes");
        builder.Configuration["WebhookBaseUrl"] = "https://callbacks.example.invalid";

        var otherOwner = Guid.NewGuid();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.Add(new AppUser { Id = otherOwner, Name = "Other Fixture", Email = "other@example.invalid", PasswordHash = "unused-fixture", Role = UserRole.Owner });
            await db.SaveChangesAsync();
        }
        client.DefaultRequestHeaders.Add("X-Fixture-Owner", otherOwner.ToString());
        await AssertRejectedAsync(client, roomId);
        client.DefaultRequestHeaders.Remove("X-Fixture-Owner");

        provider.Verified = false;
        await JsonAsync(await client.PutAsJsonAsync("/api/settings/payment", new
        {
            clientId = "synthetic-client", apiKey = "changed-synthetic-api", checksumKey = "changed-synthetic-checksum"
        }));
        await AssertRejectedAsync(client, roomId);
        await AssertReadLinksAsync(client, roomId, invoiceId, hidden: true);
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert(!await db.Receipts.AnyAsync() && !await db.PayOsAttempts.AnyAsync(), "link policy tests never create money or payment attempts");
        }
        Assert(provider.Calls == 3, "only three in-process webhook confirmations were made");
    }

    private static async Task AssertReadLinksAsync(HttpClient client, Guid roomId, Guid invoiceId, bool hidden)
    {
        var list = await JsonAsync(await client.GetAsync("/api/rooms"));
        var detail = await JsonAsync(await client.GetAsync($"/api/rooms/{roomId}"));
        var invoiceList = await JsonAsync(await client.GetAsync("/api/invoices"));
        var invoice = await JsonAsync(await client.GetAsync($"/api/invoices/{invoiceId}"));
        foreach (var room in new[] { list[0], detail })
        {
            var occupancy = room.GetProperty("occupancy");
            Assert((occupancy.GetProperty("token").ValueKind == JsonValueKind.Null) == hidden &&
                (occupancy.GetProperty("url").ValueKind == JsonValueKind.Null) == hidden,
                $"room list/detail link visibility follows verified payOS (hidden={hidden})");
        }
        foreach (var item in new[] { invoiceList[0], invoice })
            Assert((item.GetProperty("tenantToken").ValueKind == JsonValueKind.Null) == hidden,
                $"invoice list/detail cannot bypass link policy (hidden={hidden})");
    }

    private static async Task AssertRejectedAsync(HttpClient client, Guid roomId)
    {
        var result = await JsonAsync(await client.PostAsync($"/api/rooms/{roomId}/rotate-link", null), HttpStatusCode.BadRequest);
        Assert(result.GetProperty("message").GetString()!.Contains("payOS"), "unverified rotation returns the actual endpoint's payOS rejection");
    }

    private static void AssertHidden(JsonElement room, string label)
    {
        var occupancy = room.GetProperty("occupancy");
        Assert(occupancy.GetProperty("token").ValueKind == JsonValueKind.Null && occupancy.GetProperty("url").ValueKind == JsonValueKind.Null, label);
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response, HttpStatusCode expected = HttpStatusCode.OK)
    {
        using (response)
        {
            var body = await response.Content.ReadAsStringAsync();
            if (response.StatusCode != expected) throw new Exception($"Tenant link HTTP test: expected {expected}, got {response.StatusCode}: {body}");
            using var document = JsonDocument.Parse(body);
            return document.RootElement.Clone();
        }
    }

    private static void Assert(bool condition, string label)
    {
        if (!condition) throw new Exception(label);
        Console.WriteLine("PASS: " + label);
    }

    private sealed class FixtureAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var owner = Request.Headers["X-Fixture-Owner"].FirstOrDefault() ?? OwnerId.ToString();
            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, owner), new Claim(ClaimTypes.Role, "Owner")], Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }

    private sealed class ConfirmWebhookHandler : HttpMessageHandler, IHttpClientFactory
    {
        public bool Verified;
        public int Calls;
        public HttpClient CreateClient(string name) => new(this, disposeHandler: false);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.RequestUri?.AbsoluteUri != "https://api-merchant.payos.vn/confirm-webhook")
                throw new InvalidOperationException("Unexpected external request in isolated HTTP fixture");
            Calls++;
            var data = await request.Content!.ReadFromJsonAsync<JsonElement>(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new { code = Verified ? "00" : "01", data = new { webhookUrl = data.GetProperty("webhookUrl").GetString() } })
            };
        }
    }
}
