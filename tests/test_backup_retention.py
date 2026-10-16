import datetime as dt
import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    "drive_backup_sync", Path(__file__).resolve().parents[1] / "deploy/rehouse-drive-sync.py")
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def name(stamp):
    return "rehouse-" + stamp.strftime("%Y%m%dT%H%M%SZ") + "-Ab1234"


class BackupRetentionTests(unittest.TestCase):
    def test_keep_recent_days_and_older_week_month_recovery_points(self):
        today = dt.datetime(2026, 10, 16)
        names = [name(today - dt.timedelta(days=n)) for n in range(130)]
        keep = sync.retention_keep(names)
        self.assertTrue(set(names[:7]).issubset(keep))
        for stamp in [dt.datetime(2026, 10, 4), dt.datetime(2026, 9, 27),
                      dt.datetime(2026, 9, 30), dt.datetime(2026, 8, 31)]:
            self.assertIn(name(stamp), keep)
        self.assertNotIn(name(dt.datetime(2026, 7, 31)), keep)
        self.assertLessEqual(len(keep), 14)

    def test_keep_latest_snapshot_when_same_day_has_multiple_deploys(self):
        first, last = name(dt.datetime(2026, 10, 16, 1)), name(dt.datetime(2026, 10, 16, 2))
        self.assertEqual(sync.retention_keep([first, last]), {last})

    def test_ignore_unrelated_folders_and_invalid_calendar_dates(self):
        self.assertEqual(sync.retention_keep(
            ["manual-backup", "rehouse-20260230T000000Z-Ab1234", "../elsewhere"]), set())

    def test_empty_storage_is_valid(self):
        self.assertEqual(sync.retention_keep([]), set())


if __name__ == "__main__":
    unittest.main()
