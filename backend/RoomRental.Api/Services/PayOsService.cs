using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using RoomRental.Api.Data;
using RoomRental.Api.Domain;

namespace RoomRental.Api.Services;

public sealed class PayOsService(
    AppDbContext db,
    IDataProtectionProvider protectionProvider,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<PayOsService> logger)
{
    private readonly IDataProtector _protector = protectionProvider.CreateProtector("RoomRental.OwnerPayOsCredentials.v1");
    private const string ApiBaseUrl = "https://api-merchant.payos.vn";
    private const int CheckoutExpirySeconds = 600;

    public async Task<string> CreateOrGetCheckoutUrlAsync(Guid ownerId, Invoice invoice, string tenantToken, CancellationToken cancellationToken) =>
        (await CreateOrGetCheckoutAsync(ownerId, invoice, tenantToken, cancellationToken)).CheckoutUrl;

    public async Task<PaymentCheckoutDto> CreateOrGetCheckoutAsync(Guid ownerId, Invoice invoice, string tenantToken, CancellationToken cancellationToken)
    {
        if (invoice.OwnerId != ownerId) throw new ApiException(StatusCodes.Status404NotFound, "Invoice was not found.");
        PayOsAttempt? existing = null;
        PayOsAttempt? attempt = null;
        (string ClientId, string ApiKey, string ChecksumKey)? credentials = null;
        try
        {
            // Reserve one pending payment per invoice under a serializable transaction.
            // The partial unique index also protects this invariant across app instances.
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            var owner = await db.Users.AsNoTracking().SingleOrDefaultAsync(user => user.Id == ownerId, cancellationToken);
            if (owner is null || owner.Role != UserRole.Owner || owner.Status != OwnerStatus.Approved)
                throw new ApiException(StatusCodes.Status403Forbidden, "The owner account is not approved to accept new payments.");

            var currentInvoice = await db.Invoices.SingleOrDefaultAsync(row => row.Id == invoice.Id && row.OwnerId == ownerId, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Invoice was not found.");
            await db.Entry(currentInvoice).ReloadAsync(cancellationToken);
            if (currentInvoice.LifecycleState != InvoiceLifecycleState.Issued)
                throw new ApiException(StatusCodes.Status409Conflict, "Draft invoices cannot accept payOS payments. Publish the invoice first.");
            var outstanding = ApiSupport.RoundVnd(currentInvoice.Total - currentInvoice.Paid);
            if (outstanding <= 0) throw new ApiException(StatusCodes.Status409Conflict, "This invoice is already paid.");

            existing = await db.PayOsAttempts
                .Where(row => row.OwnerId == ownerId && row.InvoiceId == currentInvoice.Id && row.Status == PaymentAttemptStatus.Pending)
                .OrderByDescending(row => row.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            if (existing is null)
            {
                var settings = await db.PaymentSettings.AsNoTracking().SingleOrDefaultAsync(row => row.OwnerId == ownerId, cancellationToken);
                if (settings is null) throw new ApiException(StatusCodes.Status400BadRequest, "Vui lòng thiết lập payOS trước khi tạo liên kết thanh toán.");
                credentials = Decrypt(settings);

                if (outstanding > int.MaxValue)
                    throw new ApiException(StatusCodes.Status400BadRequest, "Invoice amount exceeds the payOS supported limit.");
                var amount = decimal.ToInt32(outstanding);
                if (amount <= 0) throw new ApiException(StatusCodes.Status400BadRequest, "Payment amount must be at least 1 VND.");

                var createdAt = DateTimeOffset.UtcNow;
                var expiresAt = checked((int)createdAt.AddSeconds(CheckoutExpirySeconds).ToUnixTimeSeconds());
                attempt = new PayOsAttempt
                {
                    OwnerId = ownerId,
                    InvoiceId = currentInvoice.Id,
                    OrderCode = NewOrderCode(),
                    Amount = amount,
                    Status = PaymentAttemptStatus.Pending,
                    CreatedAt = createdAt,
                    ExpiresAt = expiresAt
                };
                db.PayOsAttempts.Add(attempt);
                currentInvoice.Version++;
                await db.SaveChangesAsync(cancellationToken);
            }
            await transaction.CommitAsync(cancellationToken);
        }
        catch (Exception exception) when (IsPaymentReservationConflict(exception))
        {
            throw new ApiException(StatusCodes.Status409Conflict, "A payment attempt is already being created for this invoice. Retry shortly.");
        }

        if (existing is not null)
        {
            var reconciled = await ReconcileAttemptAsync(ownerId, existing, cancellationToken);
            if (existing.Status == PaymentAttemptStatus.Paid)
                throw new ApiException(StatusCodes.Status409Conflict, "This invoice is already paid.");
            if (existing.Status == PaymentAttemptStatus.Pending && !string.IsNullOrWhiteSpace(existing.CheckoutUrl)) return ToCheckoutDto(existing);
            if (existing.Status == PaymentAttemptStatus.Failed && reconciled is "Cancelled" or "Expired")
                throw new ApiException(StatusCodes.Status409Conflict, "The previous payOS order was cancelled. Start a new payment attempt.");
            throw new ApiException(StatusCodes.Status409Conflict, "A payment link is still being prepared. Retry after the order status has been reconciled.");
        }

        var paymentCredentials = credentials!.Value;
        var reservedAttempt = attempt!;

        var publicBaseUrl = configuration["PublicBaseUrl"] ?? configuration["APP_PUBLIC_URL"] ?? "http://localhost:5173";
        if (!Uri.TryCreate(publicBaseUrl, UriKind.Absolute, out var baseUri))
        {
            reservedAttempt.Status = PaymentAttemptStatus.Failed;
            await db.SaveChangesAsync(cancellationToken);
            throw new ApiException(StatusCodes.Status500InternalServerError, "PublicBaseUrl must be configured as an absolute URL.");
        }
        var tenantPath = $"/t/{Uri.EscapeDataString(tenantToken)}";
        var returnUrl = new Uri(baseUri, tenantPath + "?payment=returned").ToString();
        var cancelUrl = new Uri(baseUri, tenantPath + "?payment=cancelled").ToString();
        var description = $"P{reservedAttempt.OrderCode % 100_000_000:D8}";
        var signedFields = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["amount"] = reservedAttempt.Amount.ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["cancelUrl"] = cancelUrl,
            ["description"] = description,
            ["orderCode"] = reservedAttempt.OrderCode.ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["returnUrl"] = returnUrl
        };
        var body = new
        {
            orderCode = reservedAttempt.OrderCode,
            amount = reservedAttempt.Amount,
            description,
            buyerName = invoice.TenantName,
            cancelUrl,
            returnUrl,
            expiredAt = reservedAttempt.ExpiresAt!.Value,
            signature = PayOsSignature.Create(paymentCredentials.ChecksumKey, signedFields)
        };

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"{ApiBaseUrl}/v2/payment-requests")
            {
                Content = JsonContent.Create(body)
            };
            request.Headers.TryAddWithoutValidation("x-client-id", paymentCredentials.ClientId);
            request.Headers.TryAddWithoutValidation("x-api-key", paymentCredentials.ApiKey);
            using var response = await httpClientFactory.CreateClient("payOS").SendAsync(request, cancellationToken);
            using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            var root = json.RootElement;
            var code = root.TryGetProperty("code", out var codeElement) ? codeElement.GetString() : null;
            if (!response.IsSuccessStatusCode || code != "00")
            {
                if ((int)response.StatusCode is >= 400 and < 500 && (int)response.StatusCode is not (408 or 429) || response.IsSuccessStatusCode)
                {
                    reservedAttempt.Status = PaymentAttemptStatus.Failed;
                    await db.SaveChangesAsync(cancellationToken);
                }
                logger.LogWarning("payOS checkout creation failed with HTTP {StatusCode} and response code {ProviderCode}.", (int)response.StatusCode, code);
                throw new ApiException(StatusCodes.Status502BadGateway, "payOS could not create the payment link. Check the credentials and try again.");
            }

            if (!root.TryGetProperty("data", out var data) || !root.TryGetProperty("signature", out var signatureElement) ||
                !PayOsSignature.VerifyData(paymentCredentials.ChecksumKey, data, signatureElement.GetString()) ||
                !TryGetLong(data, "orderCode", out var responseOrderCode) || responseOrderCode != reservedAttempt.OrderCode ||
                !TryGetDecimal(data, "amount", out var responseAmount) || responseAmount != reservedAttempt.Amount ||
                !data.TryGetProperty("checkoutUrl", out var checkoutUrlElement) || string.IsNullOrWhiteSpace(checkoutUrlElement.GetString()))
                throw new ApiException(StatusCodes.Status502BadGateway, "payOS returned an invalid or unsigned payment link. Reconcile the order before retrying.");

            if (TryGetLong(data, "expiredAt", out var providerExpiresAt) && providerExpiresAt != reservedAttempt.ExpiresAt)
                throw new ApiException(StatusCodes.Status502BadGateway, "payOS returned a payment link with an unexpected expiry. Reconcile the order before retrying.");

            reservedAttempt.CheckoutUrl = checkoutUrlElement.GetString();
            reservedAttempt.PaymentLinkId = data.TryGetProperty("paymentLinkId", out var linkId) ? linkId.GetString() : null;
            reservedAttempt.QrCode = ReadString(data, "qrCode");
            reservedAttempt.AccountName = ReadString(data, "accountName");
            reservedAttempt.AccountNumber = ReadString(data, "accountNumber");
            reservedAttempt.BankBin = ReadString(data, "bin");
            reservedAttempt.Description = ReadString(data, "description");
            reservedAttempt.ProviderStatus = ReadString(data, "status");
            // The create request's Unix expiry is persisted before contacting payOS.
            // The response schema may omit it; if signed metadata includes it, the
            // check above requires the exact requested timestamp.
            await db.SaveChangesAsync(cancellationToken);
            return ToCheckoutDto(reservedAttempt);
        }
        catch (ApiException) { throw; }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or JsonException)
        {
            logger.LogWarning(exception, "Could not reach or parse the payOS payment link response.");
            throw new ApiException(StatusCodes.Status502BadGateway, "payOS response is uncertain. Reconcile the order before retrying.");
        }
    }

    public async Task<bool> ProcessWebhookAsync(Guid ownerId, JsonElement root, CancellationToken cancellationToken)
    {
        var settings = await db.PaymentSettings.AsNoTracking().SingleOrDefaultAsync(row => row.OwnerId == ownerId, cancellationToken);
        if (settings is null) throw new ApiException(StatusCodes.Status401Unauthorized, "Payment channel is not configured.");
        if (!root.TryGetProperty("data", out var data) || !root.TryGetProperty("signature", out var signatureElement) ||
            !PayOsSignature.VerifyData(Decrypt(settings).ChecksumKey, data, signatureElement.GetString()))
            throw new ApiException(StatusCodes.Status401Unauthorized, "Invalid payOS signature.");

        if (!TryGetLong(data, "orderCode", out var orderCode) || !TryGetDecimal(data, "amount", out var amount))
            throw new ApiException(StatusCodes.Status400BadRequest, "Payment callback is missing its order or amount.");
        var providerCode = ReadString(data, "code");
        if (!root.TryGetProperty("success", out var successElement) || successElement.ValueKind != JsonValueKind.True)
            return true;
        if (providerCode != "00") return true;

        var attempt = await db.PayOsAttempts.SingleOrDefaultAsync(row => row.OwnerId == ownerId && row.OrderCode == orderCode, cancellationToken);
        // payOS verifies a webhook URL by sending a signed sample transaction (orderCode 123).
        // A valid, unallocated sample must be acknowledged without creating a receipt.
        if (attempt is null) return true;

        var reference = ReadString(data, "reference");
        if (string.IsNullOrWhiteSpace(reference))
            throw new ApiException(StatusCodes.Status400BadRequest, "Payment callback is missing its transaction reference.");
        if (attempt.Status == PaymentAttemptStatus.Paid)
        {
            if (string.Equals(attempt.ProviderReference, reference, StringComparison.Ordinal)) return true;
            throw new ApiException(StatusCodes.Status409Conflict, "This payOS order was already processed with another transaction reference.");
        }
        if (amount != attempt.Amount) throw new ApiException(StatusCodes.Status409Conflict, "Payment amount does not match the invoice order.");

        await RecordSuccessfulPaymentAsync(ownerId, attempt, amount, reference, cancellationToken);
        return true;
    }

    public async Task<object> ReconcileAsync(Guid ownerId, long orderCode, CancellationToken cancellationToken)
    {
        var attempt = await db.PayOsAttempts.SingleOrDefaultAsync(row => row.OwnerId == ownerId && row.OrderCode == orderCode, cancellationToken);
        if (attempt is null) throw new ApiException(StatusCodes.Status404NotFound, "Payment order was not found.");
        if (attempt.Status == PaymentAttemptStatus.Paid) return new { status = "Paid" };
        var providerStatus = await ReconcileAttemptAsync(ownerId, attempt, cancellationToken);
        return new { status = providerStatus, checkoutUrl = attempt.CheckoutUrl };
    }

    public async Task<string> ReconcileInvoiceAsync(Guid ownerId, Guid invoiceId, CancellationToken cancellationToken)
    {
        var attempt = await db.PayOsAttempts.Where(row => row.OwnerId == ownerId && row.InvoiceId == invoiceId &&
                (row.Status == PaymentAttemptStatus.Pending || row.Status == PaymentAttemptStatus.Paid))
            .OrderByDescending(row => row.CreatedAt).FirstOrDefaultAsync(cancellationToken);
        if (attempt is null) return "NoPayment";
        if (attempt.Status == PaymentAttemptStatus.Paid) return "Paid";
        return await ReconcileAttemptAsync(ownerId, attempt, cancellationToken);
    }

    public async Task<(int Checked, int Failed)> ReconcilePendingBatchAsync(CancellationToken cancellationToken)
    {
        var pendingOrders = await db.PayOsAttempts.AsNoTracking().Where(row => row.Status == PaymentAttemptStatus.Pending)
            .OrderBy(row => row.CreatedAt).Select(row => new { row.OwnerId, row.OrderCode }).Take(12).ToListAsync(cancellationToken);
        var failed = 0;
        foreach (var order in pendingOrders)
        {
            try { await ReconcileAsync(order.OwnerId, order.OrderCode, cancellationToken); }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
            catch (Exception) { failed++; }
        }
        if (failed > 0) logger.LogWarning("Automatic payOS reconciliation failed for {Count} pending order(s).", failed);
        return (pendingOrders.Count, failed);
    }

    private async Task<string> ReconcileAttemptAsync(Guid ownerId, PayOsAttempt attempt, CancellationToken cancellationToken)
    {
        var settings = await db.PaymentSettings.AsNoTracking().SingleOrDefaultAsync(row => row.OwnerId == ownerId, cancellationToken);
        if (settings is null) throw new ApiException(StatusCodes.Status400BadRequest, "Configure payOS before reconciling an order.");
        var credentials = Decrypt(settings);

        using var request = new HttpRequestMessage(HttpMethod.Get, $"{ApiBaseUrl}/v2/payment-requests/{attempt.OrderCode}");
        request.Headers.TryAddWithoutValidation("x-client-id", credentials.ClientId);
        request.Headers.TryAddWithoutValidation("x-api-key", credentials.ApiKey);
        using var response = await httpClientFactory.CreateClient("payOS").SendAsync(request, cancellationToken);
        using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var root = json.RootElement;
        var providerCode = root.TryGetProperty("code", out var codeElement) ? codeElement.GetString() : null;
        if (!response.IsSuccessStatusCode || providerCode != "00" || !root.TryGetProperty("data", out var data) ||
            !root.TryGetProperty("signature", out var signature) || !PayOsSignature.VerifyData(credentials.ChecksumKey, data, signature.GetString()) ||
            !TryGetLong(data, "orderCode", out var responseOrderCode) || responseOrderCode != attempt.OrderCode ||
            !TryGetDecimal(data, "amount", out var responseAmount) || responseAmount != attempt.Amount)
            throw new ApiException(StatusCodes.Status502BadGateway, "payOS returned an invalid or unavailable order status.");

        var status = ReadString(data, "status") ?? "Pending";
        var providerStatusChanged = !string.Equals(attempt.ProviderStatus, status, StringComparison.Ordinal);
        attempt.ProviderStatus = status;
        if (status.Equals("CANCELLED", StringComparison.OrdinalIgnoreCase) || status.Equals("EXPIRED", StringComparison.OrdinalIgnoreCase))
        {
            attempt.Status = PaymentAttemptStatus.Failed;
            await db.SaveChangesAsync(cancellationToken);
            return status.Equals("CANCELLED", StringComparison.OrdinalIgnoreCase) ? "Cancelled" : "Expired";
        }

        var linkId = ReadString(data, "id") ?? ReadString(data, "paymentLinkId");
        var changed = false;
        if (string.IsNullOrWhiteSpace(attempt.CheckoutUrl) && !string.IsNullOrWhiteSpace(linkId))
        {
            attempt.PaymentLinkId = linkId;
            attempt.CheckoutUrl = $"https://pay.payos.vn/web/{Uri.EscapeDataString(linkId)}";
            changed = true;
        }

        if (changed || providerStatusChanged)
            await db.SaveChangesAsync(cancellationToken);

        if (!TryGetDecimal(data, "amountPaid", out var amountPaid) || amountPaid <= 0)
            return status.Equals("PAID", StringComparison.OrdinalIgnoreCase) ? "Pending" : status;
        if (amountPaid != attempt.Amount) return "Partial";
        var reference = TryFindTransactionReference(data) ?? ReadString(data, "id") ?? $"reconcile-{attempt.OrderCode}";
        await RecordSuccessfulPaymentAsync(ownerId, attempt, amountPaid, reference, cancellationToken);
        return "Paid";
    }

    private async Task RecordSuccessfulPaymentAsync(Guid ownerId, PayOsAttempt attempt, decimal amount, string reference, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
        var duplicate = await db.ProcessedWebhooks.SingleOrDefaultAsync(row => row.OwnerId == ownerId && row.Reference == reference, cancellationToken);
        if (duplicate is not null)
        {
            if (duplicate.OrderCode != attempt.OrderCode)
                throw new ApiException(StatusCodes.Status409Conflict, "This payOS reference is already associated with another order.");
            await transaction.CommitAsync(cancellationToken);
            return;
        }

        var trackedAttempt = await db.PayOsAttempts.SingleAsync(row => row.Id == attempt.Id && row.OwnerId == ownerId, cancellationToken);
        await db.Entry(trackedAttempt).ReloadAsync(cancellationToken);
        if (trackedAttempt.Status == PaymentAttemptStatus.Paid)
        {
            if (!string.Equals(trackedAttempt.ProviderReference, reference, StringComparison.Ordinal))
                throw new ApiException(StatusCodes.Status409Conflict, "This payOS order was already processed with another transaction reference.");
            db.ProcessedWebhooks.Add(new ProcessedWebhook { OwnerId = ownerId, Reference = reference, OrderCode = attempt.OrderCode });
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return;
        }

        var invoice = await db.Invoices.SingleAsync(row => row.Id == trackedAttempt.InvoiceId && row.OwnerId == ownerId, cancellationToken);
        await db.Entry(invoice).ReloadAsync(cancellationToken);
        if (invoice.LifecycleState != InvoiceLifecycleState.Issued)
            throw new ApiException(StatusCodes.Status409Conflict, "A draft invoice cannot receive a payOS payment.");
        if (amount != trackedAttempt.Amount || amount > invoice.Total - invoice.Paid)
            throw new ApiException(StatusCodes.Status409Conflict, "Payment exceeds the invoice balance.");

        db.Receipts.Add(new PaymentReceipt
        {
            OwnerId = ownerId,
            InvoiceId = invoice.Id,
            Amount = amount,
            Note = "Thanh toán trực tuyến qua payOS",
            Source = "payOS",
            ExternalReference = reference,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.ProcessedWebhooks.Add(new ProcessedWebhook { OwnerId = ownerId, Reference = reference, OrderCode = trackedAttempt.OrderCode });
        invoice.Paid += amount;
        invoice.Version++;
        InvoiceService.RecalculateStatus(invoice);
        trackedAttempt.Status = PaymentAttemptStatus.Paid;
        trackedAttempt.ProviderReference = reference;
        trackedAttempt.PaidAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private (string ClientId, string ApiKey, string ChecksumKey) Decrypt(OwnerPaymentSettings settings)
    {
        try
        {
            return (settings.ClientId, _protector.Unprotect(settings.ProtectedApiKey), _protector.Unprotect(settings.ProtectedChecksumKey));
        }
        catch (CryptographicException exception)
        {
            logger.LogError(exception, "Stored payOS credentials could not be decrypted for owner {OwnerId}.", settings.OwnerId);
            throw new ApiException(StatusCodes.Status500InternalServerError, "Saved payment credentials cannot be read. Save the payment settings again.");
        }
    }

    private static bool IsPaymentReservationConflict(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException postgres &&
                postgres.SqlState is PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.UniqueViolation or PostgresErrorCodes.DeadlockDetected)
                return true;
            if (current is SqliteException sqlite && (sqlite.SqliteErrorCode is 5 or 6 || sqlite.SqliteExtendedErrorCode == 2067))
                return true;
        }
        return false;
    }

    private static long NewOrderCode() => DateTimeOffset.UtcNow.ToUnixTimeSeconds() * 1_000 + RandomNumberGenerator.GetInt32(0, 1_000);

    private static PaymentCheckoutDto ToCheckoutDto(PayOsAttempt attempt)
    {
        var providerStatus = NormalizeStatus(attempt.ProviderStatus);
        var status = attempt.Status switch
        {
            PaymentAttemptStatus.Paid => "paid",
            PaymentAttemptStatus.Failed => providerStatus switch
            {
                "cancelled" => "cancelled",
                "expired" => "expired",
                _ => "failed"
            },
            // A provider status alone never confirms payment; only the protected reconciliation
            // path that records the matching amount/transaction may move the attempt to Paid.
            _ => "pending"
        };
        return new PaymentCheckoutDto(attempt.CheckoutUrl!, attempt.QrCode, attempt.Amount, attempt.OrderCode,
            attempt.AccountName, attempt.AccountNumber, attempt.BankBin, attempt.Description, status, attempt.ExpiresAt);
    }

    private static string? NormalizeStatus(string? status) =>
        string.IsNullOrWhiteSpace(status) ? null : status.Trim().ToLowerInvariant();

    private static bool TryGetLong(JsonElement data, string name, out long value)
    {
        value = 0;
        if (!data.TryGetProperty(name, out var property)) return false;
        return property.ValueKind == JsonValueKind.Number ? property.TryGetInt64(out value) : long.TryParse(property.GetString(), out value);
    }

    private static bool TryGetDecimal(JsonElement data, string name, out decimal value)
    {
        value = 0;
        if (!data.TryGetProperty(name, out var property)) return false;
        return property.ValueKind == JsonValueKind.Number ? property.TryGetDecimal(out value) : decimal.TryParse(property.GetString(), out value);
    }

    private static string? ReadString(JsonElement data, string name)
    {
        if (!data.TryGetProperty(name, out var property)) return null;
        return property.ValueKind == JsonValueKind.String ? property.GetString() : property.ValueKind == JsonValueKind.Number ? property.GetRawText() : null;
    }

    private static string? TryFindTransactionReference(JsonElement data)
    {
        if (!data.TryGetProperty("transactions", out var transactions)) return null;
        var pending = new Stack<JsonElement>();
        pending.Push(transactions);
        while (pending.Count > 0)
        {
            var item = pending.Pop();
            if (item.ValueKind == JsonValueKind.Object)
            {
                if (item.TryGetProperty("reference", out var reference) && reference.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(reference.GetString()))
                    return reference.GetString();
                foreach (var property in item.EnumerateObject()) pending.Push(property.Value);
            }
            else if (item.ValueKind == JsonValueKind.Array)
            {
                foreach (var child in item.EnumerateArray()) pending.Push(child);
            }
        }
        return null;
    }
}

public sealed class PaymentReconciliationHostedService(IServiceScopeFactory scopeFactory, ILogger<PaymentReconciliationHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken); }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var payOsService = scope.ServiceProvider.GetRequiredService<PayOsService>();
                await payOsService.ReconcilePendingBatchAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception)
            {
                logger.LogWarning("The scheduled payOS reconciliation pass failed.");
            }

            try { await Task.Delay(TimeSpan.FromMinutes(3), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
