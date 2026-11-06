import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path


CACHE = Path(__file__).with_name("credential-cache.py")


class CacheTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.helper = self.root / ("cache-test-" + uuid.uuid4().hex)
        self.script(
            self.helper,
            """
test "$1" = --fetch || exit 1
echo called >> "$TEST_ROOT/calls"
if [ -e "$TEST_ROOT/fail" ]; then exit 41; fi
cat "$TEST_ROOT/response"
""",
        )
        self.script(
            self.root / "devin-oidc",
            """
test "$1" = print-general-token || exit 1
cat "$TEST_ROOT/token"
""",
        )
        self.env = {
            **os.environ,
            "PATH": f"{self.root}:{os.environ['PATH']}",
            "TEST_ROOT": temp.name,
        }
        for name in (
            "DEVIN_OIDC_EXCHANGE_URL",
            "AWS_ENDPOINT_URL",
            "AWS_ENDPOINT_URL_STS",
        ):
            self.env.pop(name, None)
        self.entry = (
            Path("/dev/shm") / f"devin-oidc-aws-{os.getuid()}" / self.helper.name
        )
        self.addCleanup(lambda: self.entry.exists() and self.entry.unlink())
        self.identity()
        self.response()

    def script(self, path, script):
        path.write_text("#!/bin/sh\nset -eu\n" + script)
        path.chmod(0o700)

    def identity(self, signature="first", **claims):
        fields = {
            "token_use": "general",
            "devin_id": "session",
            "exp": time.time() + 600,
            **claims,
        }
        payload = base64.urlsafe_b64encode(json.dumps(fields).encode()).rstrip(b"=")
        (self.root / "token").write_bytes(
            b"header." + payload + b"." + signature.encode()
        )

    def response(self, lifetime=3600):
        data = {
            "Version": 1,
            "AccessKeyId": "fixture",
            "SecretAccessKey": "fixture-secret",
            "SessionToken": "fixture-token",
        }
        if lifetime is not None:
            data["Expiration"] = datetime.fromtimestamp(
                time.time() + lifetime, timezone.utc
            ).isoformat()
        (self.root / "response").write_text(json.dumps(data))

    def fetch(self, check=True):
        return subprocess.run(
            [sys.executable, "-I", CACHE, self.helper],
            env=self.env,
            capture_output=True,
            check=check,
        )

    def calls(self):
        return len((self.root / "calls").read_text().splitlines())

    def test_concurrent_cold_start(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            outputs = list(pool.map(lambda _: self.fetch().stdout, range(8)))
        self.assertEqual(set(outputs), {(self.root / "response").read_bytes()})
        self.assertEqual(self.calls(), 1)
        self.assertNotIn(b"fixture-secret", self.entry.read_bytes())
        self.assertEqual(self.entry.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.entry.parent.stat().st_mode & 0o777, 0o700)

    def test_rotation_configuration_and_tampering(self):
        self.fetch()
        # Even a token claiming the same session must not unlock the entry.
        self.identity(signature="rotated")
        self.fetch()
        self.helper.write_text(self.helper.read_text() + "\n# another role\n")
        self.fetch()
        self.entry.write_bytes(b"corrupt")
        self.fetch()
        self.fetch()
        self.assertEqual(self.calls(), 4)

    def test_build_author_and_expired_identities_bypass_warm_cache(self):
        self.fetch()
        for claims in (
            {"build_job_id": "build"},
            {"author_session_id": "author"},
            {"exp": 0},
        ):
            self.identity(**claims)
            self.fetch()
            self.fetch()
        self.assertEqual(self.calls(), 7)

    def test_refetch_margin_and_missing_expiration(self):
        for lifetime in (800, None):
            self.response(lifetime)
            for _ in range(2):
                self.assertEqual(
                    self.fetch().stdout, (self.root / "response").read_bytes()
                )
        self.response(1000)
        self.fetch()
        self.fetch()
        self.assertEqual(self.calls(), 5)

    def test_failed_fetch_is_not_replayed(self):
        failure = self.root / "fail"
        failure.touch()
        result = self.fetch(check=False)
        self.assertEqual((result.returncode, result.stdout), (41, b""))
        failure.unlink()
        self.fetch()
        self.fetch()
        self.assertEqual(self.calls(), 2)


if __name__ == "__main__":
    unittest.main()
