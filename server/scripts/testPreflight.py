"""운영 DB 없이 체크섬·적용 순서 차단 조건을 검증합니다."""

import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("preflight", Path(__file__).resolve().parents[1] / "deploy/preflight.py")
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class PreflightTest(unittest.TestCase):
    def testChecksumIgnoresBomAndLineEndings(self):
        with tempfile.TemporaryDirectory() as folder:
            first, second = Path(folder) / "a.sql", Path(folder) / "b.sql"
            first.write_bytes("SELECT 1;\n-- 확인\n".encode())
            second.write_bytes("\ufeffSELECT 1;\r\n-- 확인\r\n".encode())
            self.assertEqual(preflight.flywayChecksum(first), preflight.flywayChecksum(second))

    def testOnlyHigherUnappliedVersionsPassAndChangedAppliedSqlIsRejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            applied = root / "V20261101000000__first.sql"
            applied.write_text("SELECT 1;")
            history = [dict(version="20261101000000", script=applied.name,
                            checksum=preflight.flywayChecksum(applied), success=True, type="SQL")]
            (root / "V20261102000000__next.sql").write_text("SELECT 2;")
            self.assertEqual(preflight.compareHistory(history, root), ["20261102000000"])
            applied.write_text("SELECT 3;")
            with self.assertRaises(preflight.PreflightError):
                preflight.compareHistory(history, root)
            applied.write_text("SELECT 1;")
            (root / "V20261031000000__missing.sql").write_text("SELECT 0;")
            with self.assertRaises(preflight.PreflightError):
                preflight.compareHistory(history, root)


if __name__ == "__main__":
    unittest.main()
