using System.Security.Claims;
using Microsoft.AspNetCore.WebUtilities;

namespace RoomRental.Api.Services;

public sealed class ApiException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

public static class ApiSupport
{
    public static Guid UserId(HttpContext context)
    {
        var value = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var id) ? id : throw new ApiException(StatusCodes.Status401Unauthorized, "Please sign in.");
    }

    public static Guid OwnerId(HttpContext context)
    {
        if (!context.User.IsInRole("Owner"))
            throw new ApiException(StatusCodes.Status403Forbidden, "Owner access is required.");
        return UserId(context);
    }

    public static void RequireAdmin(HttpContext context)
    {
        if (!context.User.IsInRole("Admin"))
            throw new ApiException(StatusCodes.Status403Forbidden, "Administrator access is required.");
    }

    public static string NormalizePeriod(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length != 7 || value[4] != '-' ||
            !int.TryParse(value.AsSpan(0, 4), out var year) || !int.TryParse(value.AsSpan(5, 2), out var month) ||
            year is < 2000 or > 2200 || month is < 1 or > 12)
            throw new ApiException(StatusCodes.Status400BadRequest, "Period must use YYYY-MM format.");
        return $"{year:D4}-{month:D2}";
    }

    public static DateOnly PeriodDueDate(string period)
    {
        var year = int.Parse(period.AsSpan(0, 4));
        var month = int.Parse(period.AsSpan(5, 2));
        return new DateOnly(year, month, 1).AddMonths(1).AddDays(4);
    }

    public static decimal RoundVnd(decimal value) => decimal.Round(value, 0, MidpointRounding.AwayFromZero);

    public static bool IsSameOrigin(HttpRequest request)
    {
        var candidate = request.Headers.Origin.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(candidate)) candidate = request.Headers.Referer.FirstOrDefault();
        if (!Uri.TryCreate(candidate, UriKind.Absolute, out var origin)) return false;
        var requestHost = request.Host;
        var requestPort = requestHost.Port ?? (request.IsHttps ? 443 : 80);
        var originPort = origin.IsDefaultPort ? (origin.Scheme == "https" ? 443 : 80) : origin.Port;
        return string.Equals(origin.Scheme, request.IsHttps ? "https" : "http", StringComparison.OrdinalIgnoreCase) &&
               string.Equals(origin.Host, requestHost.Host, StringComparison.OrdinalIgnoreCase) && requestPort == originPort;
    }
}

public sealed class ApiExceptionMiddleware(RequestDelegate next, ILogger<ApiExceptionMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (ApiException exception)
        {
            if (context.Response.HasStarted) throw;
            context.Response.Clear();
            context.Response.StatusCode = exception.StatusCode;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new { message = exception.Message });
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // The client has gone away; there is no response left to write.
        }
        catch (Exception exception)
        {
            var requestPath = context.Request.Path.StartsWithSegments("/api/tenant")
                ? "/api/tenant/[redacted]"
                : context.Request.Path.Value;
            logger.LogError(exception, "Unhandled request error for {Path}", requestPath);
            if (context.Response.HasStarted) throw;
            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new { message = "An unexpected server error occurred." });
        }
    }
}
