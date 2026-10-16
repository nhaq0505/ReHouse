using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using RoomRental.Api.Domain;

namespace RoomRental.Api.Services;

public sealed class AdminMfaService(IDataProtectionProvider protection, TimeProvider clock)
{
    private readonly IDataProtector protector = protection.CreateProtector("Roomie.AdminMfa.v1");
    public string Begin(AppUser user)
    {
        var bytes = RandomNumberGenerator.GetBytes(20);
        user.PendingMfaSecret = protector.Protect(Convert.ToBase64String(bytes));
        user.PendingMfaExpiresAt = clock.GetUtcNow().AddMinutes(10);
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var result = new StringBuilder(); int buffer = 0, bits = 0;
        foreach (var b in bytes) { buffer = (buffer << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; result.Append(alphabet[(buffer >> bits) & 31]); } }
        return result.ToString();
    }
    // RFC6238 / RFC4226, SHA1, 30 seconds. Public for RFC vector tests.
    public static string Code(byte[] key, long step, int digits = 6)
    {
        Span<byte> counter = stackalloc byte[8]; BinaryPrimitives.WriteInt64BigEndian(counter, step);
        var hash = HMACSHA1.HashData(key, counter); var offset = hash[^1] & 15;
        var number = BinaryPrimitives.ReadInt32BigEndian(hash.AsSpan(offset, 4)) & 0x7fffffff;
        return (number % (digits == 8 ? 100000000 : 1000000)).ToString(digits == 8 ? "D8" : "D6");
    }
    private long Match(string protectedSecret, string? code, long last)
    {
        if (code is null || code.Length != 6 || code.Any(c => c is < '0' or > '9')) return -1;
        var secret = Convert.FromBase64String(protector.Unprotect(protectedSecret));
        var step = clock.GetUtcNow().ToUnixTimeSeconds() / 30;
        for (var i = -1; i <= 1; i++)
            if (step + i > last && CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Code(secret, step + i)), Encoding.ASCII.GetBytes(code))) return step + i;
        return -1;
    }
    public string[] Confirm(AppUser user, string code)
    {
        if (user.MfaEnabled || user.PendingMfaSecret is null || user.PendingMfaExpiresAt <= clock.GetUtcNow()) throw new ApiException(400, "Thiết lập đã hết hạn.");
        var step = Match(user.PendingMfaSecret, code, -1);
        if (step < 0) throw new ApiException(400, "Mã xác thực không hợp lệ.");
        user.ProtectedMfaSecret = user.PendingMfaSecret; user.PendingMfaSecret = null; user.PendingMfaExpiresAt = null;
        user.MfaEnabled = true; user.MfaLastStep = step;
        var codes = Enumerable.Range(0, 8).Select(_ => Convert.ToHexString(RandomNumberGenerator.GetBytes(16))).ToArray();
        user.MfaRecoveryHashes = JsonSerializer.Serialize(codes.Select(PasswordSecurity.HashToken));
        return codes;
    }
    public void Verify(AppUser user, string? code)
    {
        var hashes = JsonSerializer.Deserialize<List<string>>(user.MfaRecoveryHashes ?? "[]")!;
        var match = code is { Length: 32 } ? hashes.FirstOrDefault(h => PasswordSecurity.MatchesToken(code.ToUpperInvariant(), h)) : null;
        if (match is not null) { hashes.Remove(match); user.MfaRecoveryHashes = JsonSerializer.Serialize(hashes); return; }
        var step = user.ProtectedMfaSecret is null ? -1 : Match(user.ProtectedMfaSecret, code, user.MfaLastStep);
        if (step < 0) throw new ApiException(401, "Nhập mã xác thực hai bước hoặc mã khôi phục chưa sử dụng.");
        user.MfaLastStep = step;
    }
}
