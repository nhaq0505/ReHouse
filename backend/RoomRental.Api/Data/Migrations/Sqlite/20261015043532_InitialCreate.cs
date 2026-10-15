using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RoomRental.Api.Data.Migrations.Sqlite
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuthSessions",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false),
                    ExpiresAt = table.Column<long>(type: "INTEGER", nullable: false),
                    RevokedAt = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuthSessions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Buildings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    OwnerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Address = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    ArchivedAt = table.Column<long>(type: "INTEGER", nullable: true),
                    ArchivedBy = table.Column<Guid>(type: "TEXT", nullable: true),
                    ArchiveBatchId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Buildings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Invoices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Kind = table.Column<string>(type: "TEXT", nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    IsFinalMeterReading = table.Column<bool>(type: "INTEGER", nullable: false),
                    LifecycleState = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false, defaultValue: "Issued"),
                    Version = table.Column<long>(type: "INTEGER", nullable: false),
                    MonthlyRentRate = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    ElectricityRate = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    WaterRate = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    WaterPerPerson = table.Column<bool>(type: "INTEGER", nullable: true),
                    ServiceRate = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    BillingStartDate = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    BillingEndDate = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    BillableDays = table.Column<int>(type: "INTEGER", nullable: true),
                    MonthDays = table.Column<int>(type: "INTEGER", nullable: true),
                    OwnerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    RoomId = table.Column<Guid>(type: "TEXT", nullable: false),
                    BuildingId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OccupancyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    RoomName = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    BuildingName = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Period = table.Column<string>(type: "TEXT", maxLength: 7, nullable: false),
                    TenantName = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    PreviousReading = table.Column<decimal>(type: "TEXT", precision: 18, scale: 3, nullable: false),
                    CurrentReading = table.Column<decimal>(type: "TEXT", precision: 18, scale: 3, nullable: false),
                    Consumption = table.Column<decimal>(type: "TEXT", precision: 18, scale: 3, nullable: false),
                    Rent = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    ElectricityAmount = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    WaterAmount = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    ServiceAmount = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    Total = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    Paid = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    DueDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    IssuedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Invoices", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MoveoutCompletions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    RequestId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OwnerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    RoomId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OccupancyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ActorId = table.Column<Guid>(type: "TEXT", nullable: false),
                    RequestFingerprint = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    HeldBeforeSettlement = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    RefundAmount = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    RetainedAmount = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    EndDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    CompletedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MoveoutCompletions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Occupancies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    RoomId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TenantName = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Phone = table.Column<string>(type: "TEXT", maxLength: 60, nullable: true),
                    People = table.Column<int>(type: "INTEGER", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    TenantTokenHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    ProtectedTenantToken = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: true),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Occupancies", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PaymentSettings",
                columns: table => new
                {
                    OwnerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ClientId = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    ProtectedApiKey = table.Column<string>(type: "TEXT", maxLength: 4096, nullable: false),
                    ProtectedChecksumKey = table.Column<string>(type: "TEXT", maxLength: 4096, nullable: false),
                    UpdatedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentSettings", x => x.OwnerId);
                });

            migrationBuilder.CreateTable(
                name: "PaymentWebhookRegistrations",
                columns: table => new
                {
                    OwnerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SettingsVersion = table.Column<string>(type: "TEXT", nullable: false),
                    WebhookUrl = table.Column<string>(type: "TEXT", nullable: false),
                    Status = table.Column<string>(type: "TEXT", nullable: false),
                    VerifiedAt = table.Column<string>(type: "TEXT", nullable: true),
                    Error = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentWebhookRegistrations", x => x.OwnerId);
                });

            migrationBuilder.CreateTable(
                name: "PayOsAttempts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    OwnerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Kind = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    SubscriptionDays = table.Column<int>(type: "INTEGER", nullable: true),
                    OrderCode = table.Column<long>(type: "INTEGER", nullable: false),
                    Amount = table.Column<int>(type: "INTEGER", nullable: false),
                    PaymentLinkId = table.Column<string>(type: "TEXT", maxLength: 160, nullable: true),
                    CheckoutUrl = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: true),
                    QrCode = table.Column<string>(type: "TEXT", maxLength: 4096, nullable: true),
                    AccountName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    AccountNumber = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    BankBin = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    ProviderStatus = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    ExpiresAt = table.Column<long>(type: "INTEGER", nullable: true),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    ProviderReference = table.Column<string>(type: "TEXT", maxLength: 160, nullable: true),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false),
                    PaidAt = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PayOsAttempts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProcessedWebhooks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    OwnerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Reference = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    OrderCode = table.Column<long>(type: "INTEGER", nullable: false),
                    ProcessedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProcessedWebhooks", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Readings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    OccupantsCount = table.Column<int>(type: "INTEGER", nullable: true),
                    RoomId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OccupancyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Period = table.Column<string>(type: "TEXT", maxLength: 7, nullable: false),
                    PreviousReading = table.Column<decimal>(type: "TEXT", precision: 18, scale: 3, nullable: false),
                    CurrentReading = table.Column<decimal>(type: "TEXT", precision: 18, scale: 3, nullable: false),
                    Consumption = table.Column<decimal>(type: "TEXT", precision: 18, scale: 3, nullable: false),
                    MonthlyRentRate = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    ElectricityRate = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    WaterRate = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    WaterPerPerson = table.Column<bool>(type: "INTEGER", nullable: true),
                    ServiceRate = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    BillingStartDate = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    BillingEndDate = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    BillableDays = table.Column<int>(type: "INTEGER", nullable: true),
                    MonthDays = table.Column<int>(type: "INTEGER", nullable: true),
                    RecordedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Readings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Receipts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    OwnerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Amount = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    Note = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    IdempotencyKey = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    Source = table.Column<string>(type: "TEXT", maxLength: 30, nullable: false),
                    ExternalReference = table.Column<string>(type: "TEXT", maxLength: 160, nullable: true),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Receipts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RegistrationVerifications",
                columns: table => new
                {
                    Email = table.Column<string>(type: "TEXT", maxLength: 320, nullable: false),
                    ChallengeHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Phone = table.Column<string>(type: "TEXT", nullable: true),
                    PasswordHash = table.Column<string>(type: "TEXT", nullable: false),
                    CodeHash = table.Column<string>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<long>(type: "INTEGER", nullable: false),
                    CodeExpiresAt = table.Column<long>(type: "INTEGER", nullable: false),
                    LastSentAt = table.Column<long>(type: "INTEGER", nullable: false),
                    WindowStartedAt = table.Column<long>(type: "INTEGER", nullable: false),
                    ConsumedAt = table.Column<long>(type: "INTEGER", nullable: true),
                    SendCount = table.Column<int>(type: "INTEGER", nullable: false),
                    FailedAttempts = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RegistrationVerifications", x => x.Email);
                });

            migrationBuilder.CreateTable(
                name: "Rooms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    BuildingId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Rent = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    ElectricityRate = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    WaterFee = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    WaterPerPerson = table.Column<bool>(type: "INTEGER", nullable: false),
                    ServiceFee = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    InitialReading = table.Column<decimal>(type: "TEXT", precision: 18, scale: 3, nullable: false),
                    ArchivedAt = table.Column<long>(type: "INTEGER", nullable: true),
                    ArchivedBy = table.Column<Guid>(type: "TEXT", nullable: true),
                    ArchiveBatchId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Rooms", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Email = table.Column<string>(type: "TEXT", maxLength: 320, nullable: false),
                    Phone = table.Column<string>(type: "TEXT", maxLength: 60, nullable: true),
                    PasswordHash = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: false),
                    PasswordResetHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    PasswordResetExpiresAt = table.Column<long>(type: "INTEGER", nullable: true),
                    Role = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    StatusReason = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    SubscriptionTier = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    SubscriptionExpiresAt = table.Column<long>(type: "INTEGER", nullable: true),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DepositSettlements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Amount = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    Kind = table.Column<string>(type: "TEXT", nullable: false),
                    Reason = table.Column<string>(type: "TEXT", nullable: false),
                    IdempotencyKey = table.Column<string>(type: "TEXT", nullable: false),
                    TargetInvoiceId = table.Column<Guid>(type: "TEXT", nullable: true),
                    RecordedAt = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DepositSettlements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DepositSettlements_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InvoiceRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Revision = table.Column<int>(type: "INTEGER", nullable: false),
                    RequestId = table.Column<Guid>(type: "TEXT", nullable: false),
                    RequestFingerprint = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Reason = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    ActorId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ActorName = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false),
                    Version = table.Column<long>(type: "INTEGER", nullable: false),
                    BeforeJson = table.Column<string>(type: "text", nullable: false),
                    AfterJson = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvoiceRevisions_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuthSessions_UserId_ExpiresAt",
                table: "AuthSessions",
                columns: new[] { "UserId", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Buildings_ArchivedAt",
                table: "Buildings",
                column: "ArchivedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Buildings_OwnerId",
                table: "Buildings",
                column: "OwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_DepositSettlements_InvoiceId_IdempotencyKey",
                table: "DepositSettlements",
                columns: new[] { "InvoiceId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceRevisions_InvoiceId_RequestId",
                table: "InvoiceRevisions",
                columns: new[] { "InvoiceId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceRevisions_InvoiceId_Revision",
                table: "InvoiceRevisions",
                columns: new[] { "InvoiceId", "Revision" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_BuildingId",
                table: "Invoices",
                column: "BuildingId");

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_OccupancyId_Deposit",
                table: "Invoices",
                column: "OccupancyId",
                unique: true,
                filter: "\"Kind\" = 'Deposit'");

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_OccupancyId_FinalMeter",
                table: "Invoices",
                column: "OccupancyId",
                unique: true,
                filter: "\"IsFinalMeterReading\" = TRUE");

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_OccupancyId_Period",
                table: "Invoices",
                columns: new[] { "OccupancyId", "Period" },
                unique: true,
                filter: "\"Kind\" = 'Monthly'");

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_OwnerId_Period",
                table: "Invoices",
                columns: new[] { "OwnerId", "Period" });

            migrationBuilder.CreateIndex(
                name: "IX_MoveoutCompletions_OccupancyId",
                table: "MoveoutCompletions",
                column: "OccupancyId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MoveoutCompletions_OwnerId_CompletedAt",
                table: "MoveoutCompletions",
                columns: new[] { "OwnerId", "CompletedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MoveoutCompletions_RequestId",
                table: "MoveoutCompletions",
                column: "RequestId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Occupancies_RoomId_IsActive",
                table: "Occupancies",
                columns: new[] { "RoomId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_Occupancies_TenantTokenHash",
                table: "Occupancies",
                column: "TenantTokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PayOsAttempts_InvoiceId_Pending",
                table: "PayOsAttempts",
                column: "InvoiceId",
                unique: true,
                filter: "\"Status\" = 'Pending'");

            migrationBuilder.CreateIndex(
                name: "IX_PayOsAttempts_InvoiceId_Status",
                table: "PayOsAttempts",
                columns: new[] { "InvoiceId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PayOsAttempts_OrderCode",
                table: "PayOsAttempts",
                column: "OrderCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProcessedWebhooks_OwnerId_Reference",
                table: "ProcessedWebhooks",
                columns: new[] { "OwnerId", "Reference" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Readings_OccupancyId_Period",
                table: "Readings",
                columns: new[] { "OccupancyId", "Period" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Readings_RoomId_Period",
                table: "Readings",
                columns: new[] { "RoomId", "Period" });

            migrationBuilder.CreateIndex(
                name: "IX_Receipts_InvoiceId_IdempotencyKey",
                table: "Receipts",
                columns: new[] { "InvoiceId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Receipts_OwnerId_ExternalReference",
                table: "Receipts",
                columns: new[] { "OwnerId", "ExternalReference" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RegistrationVerifications_ChallengeHash",
                table: "RegistrationVerifications",
                column: "ChallengeHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Rooms_ArchivedAt",
                table: "Rooms",
                column: "ArchivedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Rooms_BuildingId",
                table: "Rooms",
                column: "BuildingId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuthSessions");

            migrationBuilder.DropTable(
                name: "Buildings");

            migrationBuilder.DropTable(
                name: "DepositSettlements");

            migrationBuilder.DropTable(
                name: "InvoiceRevisions");

            migrationBuilder.DropTable(
                name: "MoveoutCompletions");

            migrationBuilder.DropTable(
                name: "Occupancies");

            migrationBuilder.DropTable(
                name: "PaymentSettings");

            migrationBuilder.DropTable(
                name: "PaymentWebhookRegistrations");

            migrationBuilder.DropTable(
                name: "PayOsAttempts");

            migrationBuilder.DropTable(
                name: "ProcessedWebhooks");

            migrationBuilder.DropTable(
                name: "Readings");

            migrationBuilder.DropTable(
                name: "Receipts");

            migrationBuilder.DropTable(
                name: "RegistrationVerifications");

            migrationBuilder.DropTable(
                name: "Rooms");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "Invoices");
        }
    }
}
