"""Prepare only the new HR release env; no credential is printed or sent here."""
import argparse
import json
from pathlib import Path
import re
import secrets
from urllib.parse import urlsplit

KEY_URL = "WORKBOARD_STAFF_CHAT_WEBHOOK_URL"
KEY_TOKEN = "WORKBOARD_STAFF_CHAT_WEBHOOK_TOKEN"
KEY_CRON = "HR_NOTIFICATION_CRON_TOKEN"
CANONICAL = "https://chat.bnow.co.kr/api/staff-chat/webhooks/incoming"
PREPARED = Path("/opt/bnow/hr/releases/66869b0-approval-notifications/.env.production.local")


def values(text):
    result = {}
    for line in text.splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            result[key.strip()] = value.strip().strip("\"'")
    return result


def credential_valid(value):
    return len(value) >= 32 and "CHANGE_ME" not in value and not any(ord(c) < 32 for c in value)


def allowed_destination(value):
    try:
        url = urlsplit(value)
        return (url.scheme == "https" and url.netloc in {"main.bnow.co.kr", "chat.bnow.co.kr"}
                and url.path == "/api/staff-chat/webhooks/incoming"
                and not url.query and not url.fragment and not url.username)
    except ValueError:
        return False


def target_eligible(target):
    return (target.parent.parent == Path("/opt/bnow/hr-releases")
            and target.name == ".env.production.local"
            and re.fullmatch(r"[a-f0-9]{7}-[0-9]{8}-[0-9]{4}-hr-notifications", target.parent.name) is not None)


def prepare(target, prepared):
    text = target.read_text(encoding="utf-8")
    existing = values(text)
    source = existing
    origin = "existing HR release"
    if not existing.get(KEY_URL) or not credential_valid(existing.get(KEY_TOKEN, "")):
        source = values(prepared.read_text(encoding="utf-8"))
        origin = "previously prepared HR integration"
    if not allowed_destination(source.get(KEY_URL, "")):
        raise ValueError("HR integration destination requires operator verification")
    if not credential_valid(source.get(KEY_TOKEN, "")):
        raise ValueError("HR integration credential is not configured")
    cron = existing.get(KEY_CRON, "")
    if not credential_valid(cron):
        cron = secrets.token_hex(32)
    updated = {KEY_URL: CANONICAL, KEY_TOKEN: source[KEY_TOKEN], KEY_CRON: cron}
    lines = [line for line in text.splitlines() if line.split("=", 1)[0].strip() not in updated]
    target.write_text("\n".join(lines) + "\n" + "\n".join(f"{k}={json.dumps(v)}" for k, v in updated.items()) + "\n", encoding="utf-8")
    return {"prepared": True, "source": origin, "canonicalHost": "chat.bnow.co.kr"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("target")
    args = parser.parse_args()
    target = Path(args.target).resolve()
    if not target_eligible(target):
        raise SystemExit("Only a new HR release environment is eligible")
    if PREPARED.resolve() != PREPARED:
        raise SystemExit("Prepared HR environment path changed; operator verification required")
    try:
        print(json.dumps(prepare(target, PREPARED)))
    except (ValueError, OSError):
        raise SystemExit("HR integration configuration could not be prepared; no credential was printed")
