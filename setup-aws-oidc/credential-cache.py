"""Optional Linux cache for the installed AWS credential_process helper."""

import base64
import fcntl
import hmac
import json
import os
import stat
import subprocess
import sys
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path


def uncached(helper):
    os.execl(helper, helper, "--fetch")


def session_token():
    try:
        token = subprocess.check_output(
            ["devin-oidc", "print-general-token"], stderr=subprocess.DEVNULL
        ).strip()
        _, payload, _ = token.split(b".")
        claims = json.loads(base64.urlsafe_b64decode(payload + b"==="))
        if (
            claims["token_use"] == "general"
            and claims["devin_id"]
            and "build_job_id" not in claims
            and "author_session_id" not in claims
            and claims["exp"] > time.time()
        ):
            return token
    except (ValueError, KeyError, TypeError, subprocess.CalledProcessError):
        pass
    return None


@contextmanager
def locked_entry(helper):
    root = Path("/dev/shm")
    probe = subprocess.run(["stat", "-f", "-c", "%T", root], capture_output=True)
    if probe.returncode or probe.stdout.strip() != b"tmpfs":
        raise OSError("no memory-backed cache")
    directory = root / f"devin-oidc-aws-{os.getuid()}"
    directory.mkdir(mode=0o700, exist_ok=True)
    dirfd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        info = os.fstat(dirfd)
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise OSError("unsafe cache directory")
        flags = os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK
        fd = os.open(helper.name, flags, 0o600, dir_fd=dirfd)
        with os.fdopen(fd, "r+b", buffering=0) as entry:
            info = os.fstat(fd)
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_uid != os.getuid()
                or stat.S_IMODE(info.st_mode) != 0o600
                or info.st_nlink != 1
            ):
                raise OSError("unsafe cache file")
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield entry
    finally:
        os.close(dirfd)


def fresh(data):
    try:
        credentials = json.loads(data)
        expiration = datetime.fromisoformat(
            credentials["Expiration"].replace("Z", "+00:00")
        )
        fields = ("AccessKeyId", "SecretAccessKey", "SessionToken")
        return (
            expiration.tzinfo is not None
            and expiration.timestamp() > time.time() + 900
            and credentials["Version"] == 1
            and all(isinstance(credentials[k], str) and credentials[k] for k in fields)
        )
    except (KeyError, TypeError, AttributeError, ValueError, OverflowError):
        return False


def credentials(helper):
    try:
        from cryptography.fernet import Fernet, InvalidToken
    except ImportError:
        uncached(helper)

    # These settings can select a different authority for the same helper.
    if any(
        os.getenv(k)
        for k in ("DEVIN_OIDC_EXCHANGE_URL", "AWS_ENDPOINT_URL", "AWS_ENDPOINT_URL_STS")
    ):
        uncached(helper)

    with locked_entry(helper) as entry:
        token = session_token()
        if not token:
            uncached(helper)
        # Only the full signed bearer token can unlock a hit, not a claimed
        # session ID. Reinstalling the profile or rotating the token causes a miss.
        scope = b"\0".join(
            (
                b"devin-aws-cache-v1",
                Path("/proc/sys/kernel/random/boot_id").read_bytes(),
                os.fsencode(helper),
                helper.read_bytes(),
            )
        )
        cipher = Fernet(base64.urlsafe_b64encode(hmac.digest(token, scope, "sha256")))
        try:
            data = cipher.decrypt(entry.read(65536))
            if fresh(data):
                return data
        except InvalidToken:
            pass

        data = subprocess.check_output([helper, "--fetch"])
        # Do not associate credentials fetched during a token change with the
        # old identity. A cache write failure must not repeat a successful STS call.
        try:
            if fresh(data) and session_token() == token:
                entry.seek(0)
                entry.truncate()
                entry.write(cipher.encrypt(data))
        except (OSError, subprocess.CalledProcessError):
            pass
        return data


if __name__ == "__main__":
    helper = Path(sys.argv[1])
    if sys.version_info < (3, 7):
        uncached(helper)
    try:
        data = credentials(helper)
    except OSError:
        uncached(helper)
    except subprocess.CalledProcessError as error:
        sys.exit(error.returncode if error.returncode >= 0 else 128 - error.returncode)
    sys.stdout.buffer.write(data)
