using System.Globalization;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using RoomRental.Api.Data;
using RoomRental.Api.Domain;
using RoomRental.Api.Services;

namespace RoomRental.Api.Endpoints;

public static class ReportsEndpoints
{
    private const int MaxPageSize = 200;
    private const int MaxExportRows = 20_000;
    private const string XlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private static readonly TimeZoneInfo VietnamTimeZone = ResolveVietnamTimeZone();

    public static void MapReportsEndpoints(this WebApplication app)
    {
        var routes = app.MapGroup("/api/reports").RequireAuthorization(policy => policy.RequireRole("Owner"));

        routes.MapGet("/receipts", async (DateOnly? dateFrom, DateOnly? dateTo, Guid? buildingId, Guid? roomId,
            int? page, int? pageSize, HttpContext context, AppDbContext db, CancellationToken ct) =>
        {
            var filters = ParseFilters(dateFrom, dateTo, buildingId, roomId, page, pageSize);
            await using var snapshot = await BeginReadSnapshotAsync(db, ct);
            var report = await GetReceiptsAsync(db, ApiSupport.OwnerId(context), filters, export: false, ct);
            await snapshot.CommitAsync(ct);
            return Results.Ok(report);
        });

        routes.MapGet("/debt", async (DateOnly? dateFrom, DateOnly? dateTo, Guid? buildingId, Guid? roomId,
            int? page, int? pageSize, HttpContext context, AppDbContext db, CancellationToken ct) =>
        {
            var filters = ParseFilters(dateFrom, dateTo, buildingId, roomId, page, pageSize);
            await using var snapshot = await BeginReadSnapshotAsync(db, ct);
            var report = await GetDebtAsync(db, ApiSupport.OwnerId(context), filters, export: false, ct);
            await snapshot.CommitAsync(ct);
            return Results.Ok(report);
        });

        routes.MapGet("/deposits", async (DateOnly? dateFrom, DateOnly? dateTo, Guid? buildingId, Guid? roomId,
            int? page, int? pageSize, HttpContext context, AppDbContext db, CancellationToken ct) =>
        {
            var filters = ParseFilters(dateFrom, dateTo, buildingId, roomId, page, pageSize);
            await using var snapshot = await BeginReadSnapshotAsync(db, ct);
            var report = await GetDepositsAsync(db, ApiSupport.OwnerId(context), filters, export: false, ct);
            await snapshot.CommitAsync(ct);
            return Results.Ok(report);
        });

        routes.MapGet("/{reportType}/export.xlsx", async (string reportType, DateOnly? dateFrom, DateOnly? dateTo,
            Guid? buildingId, Guid? roomId, HttpContext context, AppDbContext db, CancellationToken ct) =>
        {
            var filters = ParseFilters(dateFrom, dateTo, buildingId, roomId, page: 1, pageSize: MaxPageSize);
            var ownerId = ApiSupport.OwnerId(context);
            await using var snapshot = await BeginReadSnapshotAsync(db, ct);
            using var workbook = new XLWorkbook();
            switch (reportType.ToLowerInvariant())
            {
                case "receipts":
                {
                    var report = await GetReceiptsAsync(db, ownerId, filters, export: true, ct);
                    AddSummarySheet(workbook, "Thu tiền", filters,
                        ("Thu hóa đơn", report.Totals.InvoiceCash),
                        ("Thu tiền cọc", report.Totals.DepositCash),
                        ("Tổng tiền thu", report.Totals.TotalCash));
                    AddReceiptDetails(workbook, report.Items);
                    break;
                }
                case "debt":
                {
                    var report = await GetDebtAsync(db, ownerId, filters, export: true, ct);
                    AddSummarySheet(workbook, "Công nợ hiện tại", filters,
                        ("Công nợ hiện tại", report.Totals.CurrentOutstanding),
                        ("Công nợ quá hạn", report.Totals.OverdueOutstanding),
                        ("Số hóa đơn còn nợ", report.Totals.InvoiceCount),
                        ("Số hóa đơn quá hạn", report.Totals.OverdueInvoiceCount));
                    AddDebtDetails(workbook, report.Items);
                    break;
                }
                case "deposits":
                {
                    var report = await GetDepositsAsync(db, ownerId, filters, export: true, ct);
                    AddSummarySheet(workbook, "Tiền cọc", filters,
                        ("Tiền cọc nhận trong kỳ", report.Totals.PeriodReceived),
                        ("Tiền cọc hoàn trong kỳ", report.Totals.PeriodRefunded),
                        ("Tiền cọc khấu trừ trong kỳ", report.Totals.PeriodDeducted),
                        ("Tiền cọc đang giữ", report.Totals.CurrentHeld));
                    AddDepositDetails(workbook, report.Items);
                    break;
                }
                default:
                    throw new ApiException(StatusCodes.Status404NotFound, "Không tìm thấy loại báo cáo.");
            }

            await snapshot.CommitAsync(ct);
            await using var stream = new MemoryStream();
            workbook.SaveAs(stream);
            var fileName = $"rehouse-{reportType.ToLowerInvariant()}-{DateTime.UtcNow:yyyyMMdd-HHmmss}.xlsx";
            return Results.File(stream.ToArray(), XlsxContentType, fileName);
        });
    }

    private static async Task<PagedReportDto<ReceiptReportRow, ReceiptReportTotals>> GetReceiptsAsync(AppDbContext db, Guid ownerId,
        ReportFilters filters, bool export, CancellationToken ct)
    {
        var query = from receipt in db.Receipts.AsNoTracking()
                    join invoice in db.Invoices.AsNoTracking() on receipt.InvoiceId equals invoice.Id
                    where receipt.OwnerId == ownerId && invoice.OwnerId == ownerId &&
                          invoice.LifecycleState == InvoiceLifecycleState.Issued && receipt.Source != "Deposit"
                    select new { Receipt = receipt, Invoice = invoice };
        if (filters.BuildingId is Guid buildingId) query = query.Where(row => row.Invoice.BuildingId == buildingId);
        if (filters.RoomId is Guid roomId) query = query.Where(row => row.Invoice.RoomId == roomId);
        if (filters.FromUtc is DateTimeOffset from) query = query.Where(row => row.Receipt.CreatedAt >= from);
        if (filters.BeforeToUtc is DateTimeOffset beforeTo) query = query.Where(row => row.Receipt.CreatedAt < beforeTo);

        var totalCount = await query.LongCountAsync(ct);
        if (export) EnsureExportSize(totalCount);
        var invoiceCash = await SumMoneyAsync(db, query.Where(row => row.Invoice.Kind != "Deposit").Select(row => row.Receipt.Amount), ct);
        var depositCash = await SumMoneyAsync(db, query.Where(row => row.Invoice.Kind == "Deposit").Select(row => row.Receipt.Amount), ct);
        var totals = new ReceiptReportTotals(invoiceCash, depositCash, invoiceCash + depositCash);
        var ordered = query.OrderByDescending(row => row.Receipt.CreatedAt).ThenBy(row => row.Receipt.Id)
            .Select(row => new ReceiptReportRow(row.Receipt.Id, row.Receipt.CreatedAt, row.Receipt.Amount,
                row.Receipt.Source, row.Receipt.Note, row.Invoice.Id, row.Invoice.Kind, row.Invoice.Period,
                row.Invoice.OccupancyId, row.Invoice.RoomId, row.Invoice.RoomName, row.Invoice.BuildingId,
                row.Invoice.BuildingName, row.Invoice.TenantName));
        var items = export
            ? await ordered.ToListAsync(ct)
            : await ordered.Skip(filters.Offset).Take(filters.PageSize).ToListAsync(ct);
        return new PagedReportDto<ReceiptReportRow, ReceiptReportTotals>(items, filters.Page, filters.PageSize, totalCount, totals);
    }

    private static async Task<PagedReportDto<DebtReportRow, DebtReportTotals>> GetDebtAsync(AppDbContext db, Guid ownerId,
        ReportFilters filters, bool export, CancellationToken ct)
    {
        var query = db.Invoices.AsNoTracking().Where(invoice => invoice.OwnerId == ownerId &&
            invoice.LifecycleState == InvoiceLifecycleState.Issued && invoice.Total > invoice.Paid);
        if (filters.BuildingId is Guid buildingId) query = query.Where(invoice => invoice.BuildingId == buildingId);
        if (filters.RoomId is Guid roomId) query = query.Where(invoice => invoice.RoomId == roomId);
        if (filters.PeriodFrom is string fromPeriod) query = query.Where(invoice => invoice.Period.CompareTo(fromPeriod) >= 0);
        if (filters.PeriodTo is string toPeriod) query = query.Where(invoice => invoice.Period.CompareTo(toPeriod) <= 0);

        var totalCount = await query.LongCountAsync(ct);
        if (export) EnsureExportSize(totalCount);
        var today = OwnerManagementEndpoints.TodayVietnam();
        var overdueQuery = query.Where(invoice => invoice.DueDate < today);
        var overdueCount = await overdueQuery.LongCountAsync(ct);
        var totals = new DebtReportTotals(
            await SumMoneyAsync(db, query.Select(invoice => invoice.Total - invoice.Paid), ct),
            await SumMoneyAsync(db, overdueQuery.Select(invoice => invoice.Total - invoice.Paid), ct),
            totalCount,
            overdueCount);
        var ordered = query.OrderByDescending(invoice => invoice.Period).ThenBy(invoice => invoice.Id)
            .Select(invoice => new DebtReportRow(invoice.Id, invoice.Period, invoice.Kind, invoice.IssuedAt,
                invoice.DueDate, invoice.RoomId, invoice.RoomName, invoice.BuildingId, invoice.BuildingName,
                invoice.OccupancyId, invoice.TenantName, invoice.Total, invoice.Paid,
                invoice.Total - invoice.Paid));
        var items = export
            ? await ordered.ToListAsync(ct)
            : await ordered.Skip(filters.Offset).Take(filters.PageSize).ToListAsync(ct);
        return new PagedReportDto<DebtReportRow, DebtReportTotals>(items, filters.Page, filters.PageSize, totalCount, totals);
    }

    private static async Task<PagedReportDto<DepositReportRow, DepositReportTotals>> GetDepositsAsync(AppDbContext db, Guid ownerId,
        ReportFilters filters, bool export, CancellationToken ct)
    {
        var invoiceQuery = db.Invoices.AsNoTracking().Where(invoice => invoice.OwnerId == ownerId &&
            invoice.LifecycleState == InvoiceLifecycleState.Issued && invoice.Kind == "Deposit");
        if (filters.BuildingId is Guid buildingId) invoiceQuery = invoiceQuery.Where(invoice => invoice.BuildingId == buildingId);
        if (filters.RoomId is Guid roomId) invoiceQuery = invoiceQuery.Where(invoice => invoice.RoomId == roomId);

        var totalCount = await invoiceQuery.LongCountAsync(ct);
        if (export) EnsureExportSize(totalCount);
        var settlementQuery = from settlement in db.DepositSettlements.AsNoTracking()
                              join invoice in invoiceQuery on settlement.InvoiceId equals invoice.Id
                              select settlement;
        var periodSettlementQuery = settlementQuery;
        if (filters.FromUtc is DateTimeOffset settlementFrom)
        {
            var lowerBound = settlementFrom.ToString("O", CultureInfo.InvariantCulture);
            periodSettlementQuery = periodSettlementQuery.Where(row => row.RecordedAt.CompareTo(lowerBound) >= 0);
        }
        if (filters.BeforeToUtc is DateTimeOffset settlementBeforeTo)
        {
            var upperBound = settlementBeforeTo.ToString("O", CultureInfo.InvariantCulture);
            periodSettlementQuery = periodSettlementQuery.Where(row => row.RecordedAt.CompareTo(upperBound) < 0);
        }
        var receiptQuery = from receipt in db.Receipts.AsNoTracking()
                           join invoice in invoiceQuery on receipt.InvoiceId equals invoice.Id
                           where receipt.OwnerId == ownerId && receipt.Source != "Deposit"
                           select receipt;
        if (filters.FromUtc is DateTimeOffset from) receiptQuery = receiptQuery.Where(row => row.CreatedAt >= from);
        if (filters.BeforeToUtc is DateTimeOffset beforeTo) receiptQuery = receiptQuery.Where(row => row.CreatedAt < beforeTo);
        var heldQuery = from invoice in invoiceQuery
                        let settledAmount = db.DepositSettlements.Where(settlement => settlement.InvoiceId == invoice.Id)
                            .Select(settlement => (decimal?)settlement.Amount).Sum() ?? 0m
                        select invoice.Paid > settledAmount ? invoice.Paid - settledAmount : 0m;
        decimal currentHeld;
        if (db.Database.IsNpgsql()) currentHeld = await SumMoneyAsync(db, heldQuery, ct);
        else
        {
            var invoiceBalances = await invoiceQuery.Select(invoice => new { invoice.Id, invoice.Paid }).ToListAsync(ct);
            var settlementRows = await (from settlement in db.DepositSettlements.AsNoTracking()
                                        join invoice in invoiceQuery on settlement.InvoiceId equals invoice.Id
                                        select new { settlement.InvoiceId, settlement.Amount }).ToListAsync(ct);
            var settledByInvoice = settlementRows.GroupBy(row => row.InvoiceId)
                .ToDictionary(group => group.Key, group => group.Sum(row => row.Amount));
            currentHeld = invoiceBalances.Sum(invoice => Math.Max(0, invoice.Paid - settledByInvoice.GetValueOrDefault(invoice.Id)));
        }
        var totals = new DepositReportTotals(
            await SumMoneyAsync(db, receiptQuery.Select(row => row.Amount), ct),
            await SumMoneyAsync(db, periodSettlementQuery.Where(row => row.Kind == "Refund").Select(row => row.Amount), ct),
            await SumMoneyAsync(db, periodSettlementQuery.Where(row => row.Kind == "Deduction").Select(row => row.Amount), ct),
            currentHeld);

        var ordered = invoiceQuery.OrderByDescending(invoice => invoice.Period).ThenBy(invoice => invoice.Id);
        IQueryable<Invoice> pageQuery = export ? ordered : ordered.Skip(filters.Offset).Take(filters.PageSize);
        var pageInvoices = await pageQuery.ToListAsync(ct);
        var pageInvoiceIds = pageInvoices.Select(invoice => invoice.Id).ToList();
        var pageSettlements = pageInvoiceIds.Count == 0
            ? []
            : await db.DepositSettlements.AsNoTracking().Where(row => pageInvoiceIds.Contains(row.InvoiceId))
                .Select(row => new { row.InvoiceId, row.Amount, row.Kind, row.RecordedAt }).ToListAsync(ct);
        var pageReceipts = pageInvoiceIds.Count == 0
            ? []
            : await receiptQuery.Where(row => pageInvoiceIds.Contains(row.InvoiceId))
                .Select(row => new { row.InvoiceId, row.Amount }).ToListAsync(ct);
        var pageSettledByInvoice = pageSettlements.GroupBy(row => row.InvoiceId)
            .ToDictionary(group => group.Key, group => group.Sum(row => row.Amount));
        var heldByInvoice = pageInvoices.ToDictionary(invoice => invoice.Id,
            invoice => Math.Max(0, invoice.Paid - pageSettledByInvoice.GetValueOrDefault(invoice.Id)));
        var periodReceivedByInvoice = pageReceipts.GroupBy(row => row.InvoiceId)
            .ToDictionary(group => group.Key, group => group.Sum(row => row.Amount));
        var inPeriodSettlements = pageSettlements.Where(row => IsInSelectedDates(ParseRecordedAt(row.RecordedAt), filters));
        var periodRefundedByInvoice = inPeriodSettlements.Where(row => row.Kind == "Refund").GroupBy(row => row.InvoiceId)
            .ToDictionary(group => group.Key, group => group.Sum(row => row.Amount));
        var periodDeductedByInvoice = inPeriodSettlements.Where(row => row.Kind == "Deduction").GroupBy(row => row.InvoiceId)
            .ToDictionary(group => group.Key, group => group.Sum(row => row.Amount));
        var items = pageInvoices.Select(invoice => new DepositReportRow(invoice.Id, invoice.Period, invoice.RoomId,
            invoice.RoomName, invoice.BuildingId, invoice.BuildingName, invoice.OccupancyId, invoice.TenantName,
            invoice.Total, periodReceivedByInvoice.GetValueOrDefault(invoice.Id),
            periodRefundedByInvoice.GetValueOrDefault(invoice.Id), periodDeductedByInvoice.GetValueOrDefault(invoice.Id),
            heldByInvoice.GetValueOrDefault(invoice.Id))).ToList();
        return new PagedReportDto<DepositReportRow, DepositReportTotals>(items, filters.Page, filters.PageSize, totalCount, totals);
    }

    private static async Task<decimal> SumMoneyAsync(AppDbContext db, IQueryable<decimal> values, CancellationToken ct)
    {
        if (db.Database.IsNpgsql()) return await values.SumAsync(ct);
        // SQLite cannot aggregate decimal values. Keep the fallback to one decimal projection per matching row.
        return (await values.ToListAsync(ct)).Sum();
    }

    private static Task<IDbContextTransaction> BeginReadSnapshotAsync(AppDbContext db, CancellationToken ct) =>
        db.Database.BeginTransactionAsync(db.Database.IsNpgsql()
            ? System.Data.IsolationLevel.RepeatableRead
            : System.Data.IsolationLevel.Serializable, ct);

    private static ReportFilters ParseFilters(DateOnly? dateFrom, DateOnly? dateTo, Guid? buildingId, Guid? roomId,
        int? page, int? pageSize)
    {
        if (dateFrom is DateOnly fromDate && dateTo is DateOnly toDate && fromDate > toDate)
            throw new ApiException(StatusCodes.Status400BadRequest, "dateFrom must be on or before dateTo.");
        if (page is < 1 or > 1_000_000)
            throw new ApiException(StatusCodes.Status400BadRequest, "page must be between 1 and 1,000,000.");
        if (pageSize is < 1 or > MaxPageSize)
            throw new ApiException(StatusCodes.Status400BadRequest, $"pageSize must be between 1 and {MaxPageSize}.");
        if (dateTo == DateOnly.MaxValue)
            throw new ApiException(StatusCodes.Status400BadRequest, "dateTo is outside the supported range.");

        var fromUtc = dateFrom is DateOnly start ? StartOfVietnamDate(start) : (DateTimeOffset?)null;
        var beforeToUtc = dateTo is DateOnly end ? StartOfVietnamDate(end.AddDays(1)) : (DateTimeOffset?)null;
        var periodFrom = dateFrom?.ToString("yyyy-MM", CultureInfo.InvariantCulture);
        var periodTo = dateTo?.ToString("yyyy-MM", CultureInfo.InvariantCulture);
        var actualPage = page ?? 1;
        var actualPageSize = pageSize ?? 50;
        if ((long)(actualPage - 1) * actualPageSize > int.MaxValue)
            throw new ApiException(StatusCodes.Status400BadRequest, "The requested page is too large.");
        return new ReportFilters(dateFrom, dateTo, fromUtc, beforeToUtc, buildingId, roomId,
            actualPage, actualPageSize, (actualPage - 1) * actualPageSize, periodFrom, periodTo);
    }

    private static DateTimeOffset StartOfVietnamDate(DateOnly date)
    {
        var local = DateTime.SpecifyKind(date.ToDateTime(TimeOnly.MinValue), DateTimeKind.Unspecified);
        return new DateTimeOffset(local, VietnamTimeZone.GetUtcOffset(local)).ToUniversalTime();
    }

    private static bool IsInSelectedDates(DateTimeOffset value, ReportFilters filters) =>
        (filters.FromUtc is null || value >= filters.FromUtc.Value) &&
        (filters.BeforeToUtc is null || value < filters.BeforeToUtc.Value);

    private static DateTimeOffset ParseRecordedAt(string value)
    {
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed))
            return parsed;
        return DateTimeOffset.MinValue;
    }

    private static void EnsureExportSize(long count)
    {
        if (count > MaxExportRows)
            throw new ApiException(StatusCodes.Status413PayloadTooLarge,
                $"Excel export contains {count:N0} rows. Add filters to reduce it to {MaxExportRows:N0} rows or fewer.");
    }

    private static void AddSummarySheet(XLWorkbook workbook, string title, ReportFilters filters,
        params (string Label, object Value)[] totals)
    {
        var sheet = workbook.Worksheets.Add("Tổng hợp");
        sheet.Cell(1, 1).Value = title;
        sheet.Cell(1, 1).Style.Font.Bold = true;
        sheet.Cell(1, 1).Style.Font.FontSize = 16;
        sheet.Cell(2, 1).Value = "Xuất lúc";
        sheet.Cell(2, 2).Value = ToVietnamLocal(DateTimeOffset.UtcNow);
        sheet.Cell(2, 2).Style.DateFormat.Format = "dd/MM/yyyy HH:mm";
        sheet.Cell(4, 1).Value = "Bộ lọc";
        SetSafeText(sheet.Cell(4, 2), DescribeFilters(filters));
        sheet.Cell(6, 1).Value = "Chỉ số";
        sheet.Cell(6, 2).Value = "Giá trị";
        StyleHeader(sheet.Range(6, 1, 6, 2));
        for (var index = 0; index < totals.Length; index++)
        {
            var row = index + 7;
            SetSafeText(sheet.Cell(row, 1), totals[index].Label);
            if (totals[index].Value is decimal decimalValue)
            {
                sheet.Cell(row, 2).Value = decimalValue;
                sheet.Cell(row, 2).Style.NumberFormat.Format = "#,##0.##";
            }
            else if (totals[index].Value is int intValue)
            {
                sheet.Cell(row, 2).Value = intValue;
                sheet.Cell(row, 2).Style.NumberFormat.Format = "#,##0";
            }
            else if (totals[index].Value is long longValue)
            {
                sheet.Cell(row, 2).Value = Convert.ToDecimal(longValue, CultureInfo.InvariantCulture);
                sheet.Cell(row, 2).Style.NumberFormat.Format = "#,##0";
            }
            else SetSafeText(sheet.Cell(row, 2), Convert.ToString(totals[index].Value, CultureInfo.InvariantCulture));
        }
        sheet.Columns().AdjustToContents();
        sheet.Column(2).Width = Math.Min(70, Math.Max(18, sheet.Column(2).Width));
    }

    private static void AddReceiptDetails(XLWorkbook workbook, IReadOnlyList<ReceiptReportRow> rows)
    {
        var sheet = workbook.Worksheets.Add("Chi tiết");
        var headers = new[] { "Ngày thu", "Số tiền", "Nguồn", "Ghi chú", "Mã hóa đơn", "Loại hóa đơn", "Kỳ", "Mã dãy", "Dãy", "Mã phòng", "Phòng", "Mã lượt thuê", "Người thuê" };
        AddHeaders(sheet, headers);
        for (var index = 0; index < rows.Count; index++)
        {
            var row = index + 2;
            var item = rows[index];
            sheet.Cell(row, 1).Value = ToVietnamLocal(item.ReceiptDate);
            sheet.Cell(row, 1).Style.DateFormat.Format = "dd/MM/yyyy HH:mm";
            SetMoney(sheet.Cell(row, 2), item.Amount);
            SetSafeText(sheet.Cell(row, 3), item.Source);
            SetSafeText(sheet.Cell(row, 4), item.Note);
            SetSafeText(sheet.Cell(row, 5), item.InvoiceId.ToString("D"));
            SetSafeText(sheet.Cell(row, 6), item.InvoiceKind);
            SetPeriod(sheet.Cell(row, 7), item.Period);
            SetSafeText(sheet.Cell(row, 8), item.BuildingId.ToString("D"));
            SetSafeText(sheet.Cell(row, 9), item.BuildingName);
            SetSafeText(sheet.Cell(row, 10), item.RoomId.ToString("D"));
            SetSafeText(sheet.Cell(row, 11), item.RoomName);
            SetSafeText(sheet.Cell(row, 12), item.OccupancyId.ToString("D"));
            SetSafeText(sheet.Cell(row, 13), item.TenantName);
        }
        FinishDetails(sheet, headers.Length);
    }

    private static void AddDebtDetails(XLWorkbook workbook, IReadOnlyList<DebtReportRow> rows)
    {
        var sheet = workbook.Worksheets.Add("Chi tiết");
        var headers = new[] { "Kỳ hóa đơn", "Loại hóa đơn", "Ngày phát hành", "Hạn thanh toán", "Tổng hóa đơn", "Đã thu", "Còn nợ hiện tại", "Mã hóa đơn", "Mã dãy", "Dãy", "Mã phòng", "Phòng", "Mã lượt thuê", "Người thuê" };
        AddHeaders(sheet, headers);
        for (var index = 0; index < rows.Count; index++)
        {
            var row = index + 2;
            var item = rows[index];
            SetPeriod(sheet.Cell(row, 1), item.Period);
            SetSafeText(sheet.Cell(row, 2), item.InvoiceKind);
            sheet.Cell(row, 3).Value = ToVietnamLocal(item.IssuedAt);
            sheet.Cell(row, 3).Style.DateFormat.Format = "dd/MM/yyyy HH:mm";
            sheet.Cell(row, 4).Value = item.DueDate.ToDateTime(TimeOnly.MinValue);
            sheet.Cell(row, 4).Style.DateFormat.Format = "dd/MM/yyyy";
            SetMoney(sheet.Cell(row, 5), item.Total);
            SetMoney(sheet.Cell(row, 6), item.Paid);
            SetMoney(sheet.Cell(row, 7), item.Outstanding);
            SetSafeText(sheet.Cell(row, 8), item.InvoiceId.ToString("D"));
            SetSafeText(sheet.Cell(row, 9), item.BuildingId.ToString("D"));
            SetSafeText(sheet.Cell(row, 10), item.BuildingName);
            SetSafeText(sheet.Cell(row, 11), item.RoomId.ToString("D"));
            SetSafeText(sheet.Cell(row, 12), item.RoomName);
            SetSafeText(sheet.Cell(row, 13), item.OccupancyId.ToString("D"));
            SetSafeText(sheet.Cell(row, 14), item.TenantName);
        }
        FinishDetails(sheet, headers.Length);
    }

    private static void AddDepositDetails(XLWorkbook workbook, IReadOnlyList<DepositReportRow> rows)
    {
        var sheet = workbook.Worksheets.Add("Chi tiết");
        var headers = new[] { "Kỳ cọc", "Tiền cọc ban đầu", "Nhận trong kỳ", "Hoàn trong kỳ", "Khấu trừ trong kỳ", "Đang giữ hiện tại", "Mã hóa đơn cọc", "Mã dãy", "Dãy", "Mã phòng", "Phòng", "Mã lượt thuê", "Người thuê" };
        AddHeaders(sheet, headers);
        for (var index = 0; index < rows.Count; index++)
        {
            var row = index + 2;
            var item = rows[index];
            SetPeriod(sheet.Cell(row, 1), item.Period);
            SetMoney(sheet.Cell(row, 2), item.DepositAmount);
            SetMoney(sheet.Cell(row, 3), item.PeriodReceived);
            SetMoney(sheet.Cell(row, 4), item.PeriodRefunded);
            SetMoney(sheet.Cell(row, 5), item.PeriodDeducted);
            SetMoney(sheet.Cell(row, 6), item.CurrentHeld);
            SetSafeText(sheet.Cell(row, 7), item.InvoiceId.ToString("D"));
            SetSafeText(sheet.Cell(row, 8), item.BuildingId.ToString("D"));
            SetSafeText(sheet.Cell(row, 9), item.BuildingName);
            SetSafeText(sheet.Cell(row, 10), item.RoomId.ToString("D"));
            SetSafeText(sheet.Cell(row, 11), item.RoomName);
            SetSafeText(sheet.Cell(row, 12), item.OccupancyId.ToString("D"));
            SetSafeText(sheet.Cell(row, 13), item.TenantName);
        }
        FinishDetails(sheet, headers.Length);
    }

    private static void AddHeaders(IXLWorksheet sheet, IReadOnlyList<string> headers)
    {
        for (var index = 0; index < headers.Count; index++) SetSafeText(sheet.Cell(1, index + 1), headers[index]);
        StyleHeader(sheet.Range(1, 1, 1, headers.Count));
        sheet.SheetView.FreezeRows(1);
    }

    private static void FinishDetails(IXLWorksheet sheet, int columnCount)
    {
        sheet.Range(1, 1, Math.Max(1, sheet.LastRowUsed()?.RowNumber() ?? 1), columnCount).SetAutoFilter();
        sheet.Columns(1, columnCount).AdjustToContents(8, 48);
        sheet.Row(1).Height = 28;
    }

    private static void StyleHeader(IXLRange range)
    {
        range.Style.Font.Bold = true;
        range.Style.Fill.BackgroundColor = XLColor.FromHtml("#DCE8F5");
        range.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
    }

    private static void SetMoney(IXLCell cell, decimal value)
    {
        cell.Value = value;
        cell.Style.NumberFormat.Format = "#,##0.##";
    }

    private static void SetPeriod(IXLCell cell, string period)
    {
        if (DateOnly.TryParseExact(period + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var parsed))
        {
            cell.Value = parsed.ToDateTime(TimeOnly.MinValue);
            cell.Style.DateFormat.Format = "MM/yyyy";
        }
        else SetSafeText(cell, period);
    }

    private static void SetSafeText(IXLCell cell, string? value)
    {
        var text = value ?? string.Empty;
        var firstNonWhitespace = text.AsSpan().TrimStart();
        if (firstNonWhitespace.Length > 0 && firstNonWhitespace[0] is '=' or '+' or '-' or '@' or '\t' or '\r')
            text = "'" + text;
        cell.Value = text;
        cell.Style.NumberFormat.Format = "@";
    }

    private static string DescribeFilters(ReportFilters filters)
    {
        var values = new List<string>();
        if (filters.DateFrom is DateOnly from) values.Add($"Từ {from:dd/MM/yyyy}");
        if (filters.DateTo is DateOnly to) values.Add($"đến {to:dd/MM/yyyy}");
        if (filters.BuildingId is Guid buildingId) values.Add($"buildingId={buildingId:D}");
        if (filters.RoomId is Guid roomId) values.Add($"roomId={roomId:D}");
        return values.Count == 0 ? "Toàn bộ dữ liệu" : string.Join(" · ", values);
    }

    private static DateTime ToVietnamLocal(DateTimeOffset value) => TimeZoneInfo.ConvertTime(value, VietnamTimeZone).DateTime;

    private static TimeZoneInfo ResolveVietnamTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time"); }
    }

    private sealed record ReportFilters(DateOnly? DateFrom, DateOnly? DateTo, DateTimeOffset? FromUtc,
        DateTimeOffset? BeforeToUtc, Guid? BuildingId, Guid? RoomId, int Page, int PageSize, int Offset,
        string? PeriodFrom, string? PeriodTo);
}
