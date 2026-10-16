using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RoomRental.Api.Data.Migrations.Sqlite
{
    /// <inheritdoc />
    public partial class OperationalHardening : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "MfaEnabled",
                table: "Users",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<long>(
                name: "MfaLastStep",
                table: "Users",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<string>(
                name: "MfaRecoveryHashes",
                table: "Users",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "PendingMfaExpiresAt",
                table: "Users",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PendingMfaSecret",
                table: "Users",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProtectedMfaSecret",
                table: "Users",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "LoginThrottles",
                columns: table => new
                {
                    Key = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    WindowStartedAt = table.Column<long>(type: "INTEGER", nullable: false),
                    Attempts = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LoginThrottles", x => x.Key);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RegistrationVerifications_ExpiresAt",
                table: "RegistrationVerifications",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_AuthSessions_ExpiresAt",
                table: "AuthSessions",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_LoginThrottles_WindowStartedAt",
                table: "LoginThrottles",
                column: "WindowStartedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LoginThrottles");

            migrationBuilder.DropIndex(
                name: "IX_RegistrationVerifications_ExpiresAt",
                table: "RegistrationVerifications");

            migrationBuilder.DropIndex(
                name: "IX_AuthSessions_ExpiresAt",
                table: "AuthSessions");

            migrationBuilder.DropColumn(
                name: "MfaEnabled",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "MfaLastStep",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "MfaRecoveryHashes",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PendingMfaExpiresAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PendingMfaSecret",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "ProtectedMfaSecret",
                table: "Users");
        }
    }
}
