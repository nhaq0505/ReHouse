-- One-time, destructive reset explicitly authorized for Roomie's disposable legacy data.
-- Stop the app and take a backup before running with psql -v ON_ERROR_STOP=1.
-- This script is NEVER called by application startup or CI/CD.
BEGIN;
DO $$
BEGIN
    IF current_database() <> 'room_rental' OR current_schema() <> 'public' THEN
        RAISE EXCEPTION 'Expected room_rental database and public schema';
    END IF;
    IF to_regclass('public."__EFMigrationsHistory"') IS NOT NULL THEN
        RAISE EXCEPTION 'EF migrations already initialized; refusing a repeated legacy reset';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename <> ALL (ARRAY[
            'Users', 'RegistrationVerifications', 'AuthSessions', 'Buildings', 'Rooms',
            'Occupancies', 'Readings', 'DepositSettlements', 'MoveoutCompletions',
            'Invoices', 'InvoiceRevisions', 'Receipts', 'PaymentSettings',
            'PaymentWebhookRegistrations', 'PayOsAttempts', 'ProcessedWebhooks', 'SchemaUpgrades'
        ])
    ) THEN
        RAISE EXCEPTION 'Unexpected tables found; refusing to reset an unrecognized schema';
    END IF;
END $$;
DROP TABLE IF EXISTS
    "Users", "RegistrationVerifications", "AuthSessions", "Buildings", "Rooms",
    "Occupancies", "Readings", "DepositSettlements", "MoveoutCompletions",
    "Invoices", "InvoiceRevisions", "Receipts", "PaymentSettings",
    "PaymentWebhookRegistrations", "PayOsAttempts", "ProcessedWebhooks", "SchemaUpgrades";
COMMIT;
