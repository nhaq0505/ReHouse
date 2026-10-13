namespace RoomRental.Api.Domain;

public sealed record UserDto(Guid Id, string Name, string Email, string Role, string Status);
public sealed record OwnerAdminDto(Guid Id, string Name, string Email, string? Phone, string Status, string? Reason, DateTimeOffset CreatedAt);
public sealed record RegisterRequest(string Name, string Email, string Password, string? Phone);
public sealed record LoginRequest(string Email, string Password);
public sealed record OwnerStatusRequest(string Status, string? Reason);
public sealed record BuildingRequest(string Name, string? Address);
public sealed record BuildingDto(Guid Id, string Name, string? Address);
public sealed record RoomCreateRequest(Guid BuildingId, string Name, decimal Rent, decimal ElectricityRate, decimal WaterFee, bool WaterPerPerson, decimal ServiceFee, decimal InitialReading);
public sealed record RoomUpdateRequest(string Name, decimal Rent, decimal ElectricityRate, decimal WaterFee, bool WaterPerPerson, decimal ServiceFee);
public sealed record OccupancyRequest(string TenantName, string? Phone, int People, DateOnly StartDate, decimal DepositAmount = 0);
public sealed record OccupancyDto(Guid Id, string TenantName, string? Phone, int People, DateOnly StartDate, string? Token, string? Url, Guid? DepositInvoiceId, decimal DepositRequired, decimal DepositPaid, decimal DepositHeld);
public sealed record RoomDto(Guid Id, Guid BuildingId, string BuildingName, string Name, decimal Rent, decimal ElectricityRate, decimal WaterFee, bool WaterPerPerson, decimal ServiceFee, decimal InitialReading, decimal PreviousReading, OccupancyDto? Occupancy);
public sealed record RotateLinkDto(string Token, string Url);
public sealed record ReadingRequest(Guid RoomId, string Period, decimal CurrentReading);
public sealed record ReadingDto(Guid Id, Guid RoomId, string RoomName, string BuildingName, string Period, decimal PreviousReading, decimal CurrentReading, decimal Consumption, DateTimeOffset RecordedAt);
public sealed record GenerateInvoiceRequest(string Period);
public sealed record InvoiceDto(Guid Id, Guid RoomId, string RoomName, string BuildingName, string Period, string TenantName, decimal PreviousReading, decimal CurrentReading, decimal Consumption, decimal Rent, decimal ElectricityAmount, decimal WaterAmount, decimal ServiceAmount, decimal Total, decimal Paid, decimal Outstanding, string Status, DateOnly DueDate, DateTimeOffset IssuedAt, string Kind, Guid OccupancyId, decimal DepositHeld, IReadOnlyList<DepositSettlement> DepositSettlements, string? Description, bool IsFinalMeterReading);
public sealed record ReceiptRequest(decimal Amount, string? Note, string? IdempotencyKey);
public sealed record PaymentSettingsRequest(string ClientId, string ApiKey, string ChecksumKey);
public sealed record PaymentSettingsDto(bool Configured, string? ClientId, string? WebhookUrl,
    string WebhookStatus, string? WebhookVerifiedAt, string? WebhookError);
public sealed record PaymentCheckoutDto(string CheckoutUrl, string? QrCode, int Amount, long OrderCode,
    string? AccountName, string? AccountNumber, string? BankBin, string? Description, string Status, long? ExpiresAt);
public sealed record TenantSummaryDto(RoomDto Room, OccupancyDto Occupancy, IReadOnlyList<InvoiceDto> Invoices);

public sealed record DepositSettlementRequest(decimal Amount, string Kind, string Reason, string IdempotencyKey, Guid? TargetInvoiceId);

public sealed record SupplementalInvoiceRequest(Guid RequestId, Guid OccupancyId, string Description, decimal Amount, DateOnly DueDate);

public sealed record FinalInvoiceRequest(Guid RequestId, Guid OccupancyId, decimal CurrentReading, decimal AdditionalAmount, string? Description);
public sealed record CompleteMoveoutRequest(Guid OccupancyId, Guid FinalInvoiceId);
