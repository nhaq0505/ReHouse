using Microsoft.AspNetCore.Identity;
using RoomRental.Api.Domain;
using RoomRental.Api.Services;

internal static class AccountOccupancyTests
{
    public static void Run()
    {
        void Check(bool condition, string description)
        {
            if (!condition) throw new Exception(description);
            Console.WriteLine("PASS: " + description);
        }
        Check(ApiSupport.VietnamDate(DateTimeOffset.Parse("2026-10-31T16:59:59Z")) == new DateOnly(2026, 10, 31), "Vietnam month boundary before midnight");
        Check(ApiSupport.VietnamDate(DateTimeOffset.Parse("2026-10-31T17:00:00Z")) == new DateOnly(2026, 11, 1), "Vietnam month boundary at midnight");
        Check(ApiSupport.VietnamDate(DateTimeOffset.Parse("2026-12-31T17:00:00Z")) == new DateOnly(2027, 1, 1), "Vietnam year boundary");
        var room = new Room { Name = "Fixture", BuildingId = Guid.NewGuid() };
        var building = new Building { Name = "Fixture", OwnerId = Guid.NewGuid() };
        var occupancy = new Occupancy { RoomId = room.Id, TenantName = "Fixture", People = 7, StartDate = new DateOnly(2026, 10, 1) };
        var reading = new MonthlyReading
        {
            RoomId = room.Id, OccupancyId = occupancy.Id, Period = "2026-10", OccupantsCount = 2,
            MonthlyRentRate = 1000, ElectricityRate = 100, WaterRate = 80, WaterPerPerson = true,
            ServiceRate = 0, PreviousReading = 100, CurrentReading = 110, Consumption = 10,
            BillingStartDate = new DateOnly(2026, 10, 1), BillingEndDate = new DateOnly(2026, 10, 31), BillableDays = 31, MonthDays = 31
        };
        var invoice = InvoiceService.CreateMonthlyInvoice(building.OwnerId, room, building, occupancy, reading, InvoiceLifecycleState.Issued);
        Check(invoice.WaterAmount == 160, "Invoice regeneration uses saved headcount rather than current occupancy");
        reading.OccupantsCount = null;
        try
        {
            InvoiceService.CreateMonthlyInvoice(building.OwnerId, room, building, occupancy, reading, InvoiceLifecycleState.Issued);
            throw new Exception("Missing historical headcount was accepted");
        }
        catch (ApiException error) { Check(error.StatusCode == 409, "Missing historical per-person snapshot is rejected"); }
        reading.WaterPerPerson = false;
        Check(InvoiceService.CreateMonthlyInvoice(building.OwnerId, room, building, occupancy, reading, InvoiceLifecycleState.Issued).WaterAmount == 80,
            "Legacy fixed room water fee does not require a headcount snapshot");
        var user = new AppUser { Name = "Fixture", Email = "fixture@example.invalid", PasswordHash = "" };
        var hasher = new PasswordHasher<AppUser>();
        user.PasswordHash = hasher.HashPassword(user, "Legacy123!");
        PasswordSecurity.VerifyCurrentPassword(user, "Legacy123!", hasher);
        PasswordSecurity.ValidateNewPassword("NewPassword123!", "NewPassword123!");
        Check(PasswordSecurity.MatchesToken("fixture-token", PasswordSecurity.HashToken("fixture-token")), "Recovery token hash round trip");
        Check(!PasswordSecurity.MatchesToken("wrong-token", PasswordSecurity.HashToken("fixture-token")), "Wrong recovery token rejected");
        foreach (var weak in new[] { "short", "lowercaseonly123!", "UPPERCASEONLY123!", "NoDigitsPassword!", "NoSymbolsPassword123" })
        {
            try { PasswordSecurity.ValidateNewPassword(weak, weak); throw new Exception("Weak password accepted"); }
            catch (ApiException error) { Check(error.StatusCode == 400, "Weak password rejected"); }
        }
    }
}
