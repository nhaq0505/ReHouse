namespace RoomRental.Api.Domain;

public sealed record ReceiptReportRow(
    Guid ReceiptId,
    DateTimeOffset ReceiptDate,
    decimal Amount,
    string Source,
    string? Note,
    Guid InvoiceId,
    string InvoiceKind,
    string Period,
    Guid OccupancyId,
    Guid RoomId,
    string RoomName,
    Guid BuildingId,
    string BuildingName,
    string TenantName);

public sealed record ReceiptReportTotals(decimal InvoiceCash, decimal DepositCash, decimal TotalCash);

public sealed record DebtReportRow(
    Guid InvoiceId,
    string Period,
    string InvoiceKind,
    DateTimeOffset IssuedAt,
    DateOnly DueDate,
    Guid RoomId,
    string RoomName,
    Guid BuildingId,
    string BuildingName,
    Guid OccupancyId,
    string TenantName,
    decimal Total,
    decimal Paid,
    decimal Outstanding);

public sealed record DebtReportTotals(decimal CurrentOutstanding, decimal OverdueOutstanding, long InvoiceCount, long OverdueInvoiceCount);

public sealed record DepositReportRow(
    Guid InvoiceId,
    string Period,
    Guid RoomId,
    string RoomName,
    Guid BuildingId,
    string BuildingName,
    Guid OccupancyId,
    string TenantName,
    decimal DepositAmount,
    decimal PeriodReceived,
    decimal PeriodRefunded,
    decimal PeriodDeducted,
    decimal CurrentHeld);

public sealed record DepositReportTotals(decimal PeriodReceived, decimal PeriodRefunded, decimal PeriodDeducted, decimal CurrentHeld);

public sealed record PagedReportDto<T, TTotals>(IReadOnlyList<T> Items, int Page, int PageSize, long TotalCount, TTotals Totals);
