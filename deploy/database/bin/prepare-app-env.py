#!/usr/bin/env python3
import argparse
import datetime
import json
import os
from pathlib import Path
from urllib.parse import quote


def read_value(path: Path, key: str) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        current_key, value = stripped.split("=", 1)
        if current_key != key:
            continue
        value = value.strip()
        if value.startswith('"') and value.endswith('"'):
            return json.loads(value)
        if value.startswith("'") and value.endswith("'"):
            return value[1:-1]
        return value
    raise RuntimeError(f"{key} is missing from {path}.")


def replace_value(path: Path, key: str, value: str) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    replacement = f"{key}={json.dumps(value)}"
    replaced = False
    output = []
    for line in lines:
        if line.strip().startswith(f"{key}="):
            if not replaced:
                output.append(replacement)
                replaced = True
        else:
            output.append(line)
    if not replaced:
        output.append(replacement)
    path.write_text("\n".join(output) + "\n", encoding="utf-8")
    path.chmod(0o600)


def target_url(database_dir: Path) -> str:
    config_path = database_dir / ".env"
    user = read_value(config_path, "MARIADB_USER")
    database = read_value(config_path, "MARIADB_DATABASE")
    password = (database_dir / "secrets" / "mariadb_password").read_text(
        encoding="utf-8"
    ).strip()
    if not user or not database or not password:
        raise RuntimeError("MariaDB target configuration is incomplete.")
    return (
        f"mysql://{quote(user, safe='')}:{quote(password, safe='')}"
        f"@bnow-hr-mariadb:3306/{quote(database, safe='')}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "mode", choices=("prepare-migration", "cutover", "rollback")
    )
    parser.add_argument("--app-dir", default="/opt/bnow/checkinout")
    parser.add_argument("--database-dir", default="/opt/bnow/hr-mariadb")
    parser.add_argument("--backup")
    args = parser.parse_args()

    if os.geteuid() != 0:
        raise RuntimeError("Run this script as root.")

    app_dir = Path(args.app_dir).resolve()
    database_dir = Path(args.database_dir).resolve()
    if app_dir != Path("/opt/bnow/checkinout") or database_dir != Path(
        "/opt/bnow/hr-mariadb"
    ):
        raise RuntimeError("Refusing to modify an unexpected server path.")

    app_env = app_dir / ".env.production.local"
    migration_env = app_dir / ".env.migration.local"

    if args.mode == "prepare-migration":
        source_url = read_value(app_env, "DATABASE_URL")
        if not source_url.startswith("postgresql://"):
            raise RuntimeError("The current app database is not PostgreSQL.")
        migration_env.write_text(
            f"SOURCE_DATABASE_URL={json.dumps(source_url)}\n"
            f"DATABASE_URL={json.dumps(target_url(database_dir))}\n",
            encoding="utf-8",
        )
        migration_env.chmod(0o600)
        print("Migration environment prepared without exposing credentials.")
        return

    if args.mode == "rollback":
        backup = Path(args.backup or "").resolve()
        backup_root = (database_dir / "app-env-backups").resolve()
        if backup.parent != backup_root or not backup.is_file():
            raise RuntimeError("A valid HR app environment backup is required.")
        app_env.write_bytes(backup.read_bytes())
        app_env.chmod(0o600)
        print("Previous HR application database configuration restored.")
        return

    source_url = read_value(app_env, "DATABASE_URL")
    if not source_url.startswith("postgresql://"):
        raise RuntimeError("The current app database is not PostgreSQL.")
    backup_dir = database_dir / "app-env-backups"
    backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y%m%dT%H%M%SZ"
    )
    backup_path = backup_dir / f"env-before-mariadb-{timestamp}"
    backup_path.write_bytes(app_env.read_bytes())
    backup_path.chmod(0o600)
    replace_value(app_env, "DATABASE_URL", target_url(database_dir))
    migration_env.unlink(missing_ok=True)
    print(f"HR application database switched; rollback file: {backup_path}")


if __name__ == "__main__":
    main()
