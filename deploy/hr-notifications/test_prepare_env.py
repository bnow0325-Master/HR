import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("prepare_env", Path(__file__).with_name("prepare-env.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrepareEnvironment(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.target = Path(self.temp.name) / "new.env"
        self.prepared = Path(self.temp.name) / "prepared.env"
        self.target.write_text("OTHER_SETTING=preserved\n", encoding="utf-8")
        self.prepared.write_text(f'{module.KEY_URL}="https://main.bnow.co.kr/api/staff-chat/webhooks/incoming"\n{module.KEY_TOKEN}="test-only-integration-key-00000000000000"\n', encoding="utf-8")

    def test_reuses_prepared_hr_configuration_in_new_env_only(self):
        old_prepared = self.prepared.read_bytes()
        result = module.prepare(self.target, self.prepared)
        got = module.values(self.target.read_text())
        self.assertEqual(got[module.KEY_URL], module.CANONICAL)
        self.assertEqual(got[module.KEY_TOKEN], module.values(self.prepared.read_text())[module.KEY_TOKEN])
        self.assertTrue(module.credential_valid(got[module.KEY_CRON]))
        self.assertEqual(got["OTHER_SETTING"], "preserved")
        self.assertEqual(self.prepared.read_bytes(), old_prepared)
        self.assertNotIn("test-only", str(result))

    def test_existing_configured_credential_is_preserved(self):
        self.target.write_text(self.prepared.read_text(), encoding="utf-8")
        self.prepared.unlink()
        self.assertEqual(module.prepare(self.target, self.prepared)["source"], "existing HR release")

    def test_unexpected_destination_fails_before_writing(self):
        before = self.target.read_bytes()
        self.prepared.write_text(self.prepared.read_text().replace("main.bnow.co.kr", "outside.example.test"), encoding="utf-8")
        with self.assertRaises(ValueError):
            module.prepare(self.target, self.prepared)
        self.assertEqual(self.target.read_bytes(), before)

    def test_placeholder_credential_fails_before_writing(self):
        self.prepared.write_text(self.prepared.read_text().replace("test-only-integration-key-00000000000000", "CHANGE_ME_TO_LONG_RANDOM_SECRET"), encoding="utf-8")
        before = self.target.read_bytes()
        with self.assertRaises(ValueError):
            module.prepare(self.target, self.prepared)
        self.assertEqual(self.target.read_bytes(), before)

    def test_unexpected_query_or_userinfo_is_rejected(self):
        self.assertFalse(module.allowed_destination(module.CANONICAL + "?key=test-only"))
        self.assertFalse(module.allowed_destination("https://test-only@chat.bnow.co.kr/api/staff-chat/webhooks/incoming"))

    def test_cli_target_is_only_a_named_new_notification_release(self):
        self.assertTrue(module.target_eligible(Path("/opt/bnow/hr-releases/123abcd-20261107-1310-hr-notifications/.env.production.local")))
        self.assertFalse(module.target_eligible(Path("/opt/bnow/hr-releases/09a032d-20261103-trial-access/.env.production.local")))
        self.assertFalse(module.target_eligible(Path("/opt/bnow/hr-releases/another/path/123abcd-20261107-1310-hr-notifications/.env.production.local")))


if __name__ == "__main__":
    unittest.main()
