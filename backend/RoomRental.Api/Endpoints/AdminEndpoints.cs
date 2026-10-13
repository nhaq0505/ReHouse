using Microsoft.EntityFrameworkCore;
using RoomRental.Api.Data;
using RoomRental.Api.Domain;
using RoomRental.Api.Services;

namespace RoomRental.Api.Endpoints;

public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this WebApplication app)
    {
        var routes = app.MapGroup("/api/admin").RequireAuthorization(policy => policy.RequireRole("Admin"));

        routes.MapGet("/owners", async (string? status, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var query = db.Users.AsNoTracking().Where(row => row.Role == UserRole.Owner);
            if (!string.IsNullOrWhiteSpace(status))
            {
                if (!Enum.TryParse<OwnerStatus>(status, ignoreCase: true, out var parsed) || !Enum.IsDefined(parsed))
                    throw new ApiException(StatusCodes.Status400BadRequest, "Unknown owner status.");
                query = query.Where(row => row.Status == parsed);
            }
            var owners = await query.OrderBy(row => row.Status).ThenBy(row => row.CreatedAt)
                .Select(row => new OwnerAdminDto(row.Id, row.Name, row.Email, row.Phone, row.Status.ToString(), row.StatusReason, row.CreatedAt))
                .ToListAsync(cancellationToken);
            return Results.Ok(owners);
        });

        routes.MapPost("/owners/{id:guid}/status", async (Guid id, OwnerStatusRequest request, AppDbContext db, CancellationToken cancellationToken) =>
        {
            if (!Enum.TryParse<OwnerStatus>(request.Status, ignoreCase: false, out var nextStatus) || !Enum.IsDefined(nextStatus))
                throw new ApiException(StatusCodes.Status400BadRequest, "Status must be Pending, Approved, Rejected, or Suspended.");
            var owner = await db.Users.SingleOrDefaultAsync(row => row.Id == id && row.Role == UserRole.Owner, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "Owner was not found.");
            var reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
            if (reason is { Length: > 1000 }) throw new ApiException(StatusCodes.Status400BadRequest, "Reason must be 1000 characters or fewer.");
            owner.Status = nextStatus;
            owner.StatusReason = reason;
            if (nextStatus != OwnerStatus.Approved)
            {
                var now = DateTimeOffset.UtcNow;
                var sessions = await db.AuthSessions.Where(row => row.UserId == owner.Id && row.RevokedAt == null).ToListAsync(cancellationToken);
                foreach (var session in sessions) session.RevokedAt = now;
            }
            await db.SaveChangesAsync(cancellationToken);
            return Results.Ok(new OwnerAdminDto(owner.Id, owner.Name, owner.Email, owner.Phone, owner.Status.ToString(), owner.StatusReason, owner.CreatedAt));
        });
    }
}
