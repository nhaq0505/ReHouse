using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using RoomRental.Api.Data;
using RoomRental.Api.Domain;
using RoomRental.Api.Services;

namespace RoomRental.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var routes = app.MapGroup("/api/auth");

        routes.MapPost("/register", async (RegisterRequest request, AppDbContext db, IPasswordHasher<AppUser> hasher, CancellationToken cancellationToken) =>
        {
            var name = request.Name?.Trim();
            var email = request.Email?.Trim().ToLowerInvariant();
            var phone = request.Phone?.Trim();
            if (string.IsNullOrWhiteSpace(name) || name.Length > 160)
                throw new ApiException(StatusCodes.Status400BadRequest, "Vui lòng nhập họ tên tối đa 160 ký tự.");
            if (string.IsNullOrWhiteSpace(email) || email.Length > 320 || !email.Contains('@') || !System.Net.Mail.MailAddress.TryCreate(email, out _))
                throw new ApiException(StatusCodes.Status400BadRequest, "Vui lòng nhập địa chỉ email hợp lệ.");
            if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8 || request.Password.Length > 256)
                throw new ApiException(StatusCodes.Status400BadRequest, "Mật khẩu cần có ít nhất 8 ký tự.");
            if (await db.Users.AnyAsync(user => user.Email == email, cancellationToken))
                throw new ApiException(StatusCodes.Status409Conflict, "Email này đã được đăng ký.");

            var user = new AppUser
            {
                Name = name,
                Email = email,
                Phone = string.IsNullOrWhiteSpace(phone) ? null : phone[..Math.Min(phone.Length, 60)],
                PasswordHash = "",
                Role = UserRole.Owner,
                Status = OwnerStatus.Pending,
                CreatedAt = DateTimeOffset.UtcNow
            };
            user.PasswordHash = hasher.HashPassword(user, request.Password);
            db.Users.Add(user);
            await db.SaveChangesAsync(cancellationToken);
            return Results.Created("/api/auth/me", ToDto(user));
        }).RequireRateLimiting("auth");

        routes.MapPost("/login", async (LoginRequest request, HttpContext context, AppDbContext db, IPasswordHasher<AppUser> hasher, CancellationToken cancellationToken) =>
        {
            var email = request.Email?.Trim().ToLowerInvariant();
            var user = string.IsNullOrWhiteSpace(email)
                ? null
                : await db.Users.SingleOrDefaultAsync(row => row.Email == email, cancellationToken);
            var verificationResult = user is null || string.IsNullOrWhiteSpace(request.Password)
                ? PasswordVerificationResult.Failed
                : hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
            if (verificationResult == PasswordVerificationResult.Failed)
                throw new ApiException(StatusCodes.Status401Unauthorized, "Email hoặc mật khẩu không chính xác.");
            if (user is null) throw new ApiException(StatusCodes.Status401Unauthorized, "Email hoặc mật khẩu không chính xác.");
            if (user.Status is OwnerStatus.Rejected or OwnerStatus.Suspended)
                throw new ApiException(StatusCodes.Status403Forbidden, user.StatusReason ?? "Tài khoản này hiện không thể đăng nhập.");

            var now = DateTimeOffset.UtcNow;
            var session = new AuthSession
            {
                Id = Guid.NewGuid().ToString("N"),
                UserId = user.Id,
                CreatedAt = now,
                ExpiresAt = now.AddHours(12)
            };
            db.AuthSessions.Add(session);
            if (verificationResult == PasswordVerificationResult.SuccessRehashNeeded)
                user.PasswordHash = hasher.HashPassword(user, request.Password);
            await db.SaveChangesAsync(cancellationToken);

            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new(ClaimTypes.Name, user.Name),
                new(ClaimTypes.Email, user.Email),
                new(ClaimTypes.Role, user.Role.ToString()),
                new("sid", session.Id)
            };
            var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity), new AuthenticationProperties
            {
                IsPersistent = true,
                AllowRefresh = true,
                ExpiresUtc = session.ExpiresAt
            });
            return Results.Ok(ToDto(user));
        }).RequireRateLimiting("auth");

        routes.MapGet("/me", async (HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var userId = ApiSupport.UserId(context);
            var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(row => row.Id == userId, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status401Unauthorized, "Please sign in.");
            return Results.Ok(ToDto(user));
        }).RequireAuthorization();

        routes.MapPost("/logout", async (HttpContext context, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var sessionId = context.User.FindFirst("sid")?.Value;
            if (!string.IsNullOrWhiteSpace(sessionId))
            {
                var session = await db.AuthSessions.SingleOrDefaultAsync(row => row.Id == sessionId, cancellationToken);
                if (session is not null && session.RevokedAt is null)
                {
                    session.RevokedAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(cancellationToken);
                }
            }
            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.Ok(new { success = true });
        }).RequireAuthorization();
    }

    public static UserDto ToDto(AppUser user) => new(user.Id, user.Name, user.Email, user.Role.ToString(), user.Status.ToString());
}
