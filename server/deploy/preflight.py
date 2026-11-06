#!/usr/bin/env python3
"""기존 운영 Runner에서 실행 이미지와 전체 Flyway 이력을 읽기 전용으로 대조합니다."""

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import parse_qs, unquote, urlsplit
import zlib


class PreflightError(RuntimeError):
    pass


def flywayChecksum(path):
    """Flyway 12의 BOM·줄바꿈 독립 CRC32와 같은 기준으로 SQL 체크섬을 계산합니다."""
    text = path.read_text(encoding="utf-8-sig")
    checksum = 0
    for line in re.split(r"\r\n|\r|\n", text):
        checksum = zlib.crc32(line.encode("utf-8"), checksum)
    return checksum if checksum < 2**31 else checksum - 2**32


def compareHistory(history, migrationDir):
    """전체 성공 이력을 파일·체크섬과 대조하고 낮은 미적용 버전은 배포 전에 차단합니다."""
    candidates = {}
    for path in migrationDir.glob("V*.sql"):
        match = re.fullmatch(r"V([0-9]{14})__.+\.sql", path.name)
        if not match or match[1] in candidates:
            raise PreflightError("Migration 이름·중복 버전을 확인하세요.")
        candidates[match[1]] = path
    applied = set()
    for row in history:
        version = row["version"]
        if not row["success"] or row["type"] != "SQL" or version in applied:
            raise PreflightError("운영 이력에 실패·지원하지 않는 유형·중복 버전이 있습니다.")
        path = candidates.get(version)
        if path is None or path.name != row["script"] or flywayChecksum(path) != row["checksum"]:
            raise PreflightError("운영 Migration 파일 또는 체크섬이 후보와 다릅니다.")
        applied.add(version)
    if not applied:
        raise PreflightError("운영 Flyway 이력이 비어 있습니다.")
    pending = sorted(set(candidates) - applied)
    if any(version < max(applied) for version in pending):
        raise PreflightError("운영 최고 버전보다 낮은 미적용 Migration이 있습니다.")
    return pending


def run(*args, env=None):
    """비밀 환경·접속 오류 원문을 실행 로그로 내보내지 않습니다."""
    result = subprocess.run(args, env=env, text=True, capture_output=True)
    if result.returncode:
        raise PreflightError("운영 조회 명령이 실패했습니다. 비밀값 없는 서버 측 점검이 필요합니다.")
    return result.stdout.strip()


def inspectProduction(deployDir, migrationDir):
    """실행 중인 API의 접속 설정을 메모리에서만 사용해 DB 메타데이터와 이관 건수를 읽습니다."""
    if not shutil.which("psql"):
        raise PreflightError("운영 호스트에 psql이 없습니다.")
    containerId = run("docker", "compose", "--env-file", str(deployDir / ".deploy.env"),
                      "-f", str(deployDir / "compose.prod.yml"), "ps", "--all", "--quiet", "api")
    if not containerId or "\n" in containerId:
        raise PreflightError("실행 API 컨테이너를 하나로 확인할 수 없습니다.")
    container = json.loads(run("docker", "inspect", containerId))[0]
    if container["State"].get("Health", {}).get("Status") != "healthy":
        raise PreflightError("운영 API가 healthy 상태가 아닙니다.")
    settings = dict(value.split("=", 1) for value in container["Config"]["Env"] if "=" in value)
    if settings.get("SPRING_FLYWAY_OUTOFORDER", "false").lower() != "false":
        raise PreflightError("운영 outOfOrder 임시 설정이 활성화돼 있습니다.")
    url = urlsplit(settings["SPRING_DATASOURCE_URL"].removeprefix("jdbc:"))
    query = parse_qs(url.query)
    certificate = next((mount["Source"] for mount in container["Mounts"]
                        if mount["Destination"] == query.get("sslrootcert", [""])[0]), None)
    if url.scheme != "postgresql" or query.get("sslmode") != ["verify-full"] or not certificate:
        raise PreflightError("기존 RDS TLS 인증서 검증 설정을 확인할 수 없습니다.")
    environment = dict(os.environ)
    environment.update(PGHOST=url.hostname, PGPORT=str(url.port or 5432), PGDATABASE=unquote(url.path[1:]),
                       PGUSER=settings["SPRING_DATASOURCE_USERNAME"], PGPASSWORD=settings["SPRING_DATASOURCE_PASSWORD"],
                       PGSSLMODE="verify-full", PGSSLROOTCERT=certificate, PGCONNECT_TIMEOUT="10",
                       PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000")
    sql = """SELECT json_build_object(
      'history',(SELECT json_agg(row_to_json(h)) FROM
        (SELECT installed_rank,version,type,script,checksum,success FROM public.flyway_schema_history ORDER BY installed_rank) h),
      'phoneCounts',(SELECT json_build_object('active',count(*) FILTER (WHERE deleted_at IS NULL AND phone_encrypted IS NOT NULL),
        'deleted',count(*) FILTER (WHERE deleted_at IS NOT NULL AND phone_encrypted IS NOT NULL)) FROM residents));"""
    result = json.loads(run("psql", "--no-psqlrc", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1",
                            "--command", sql, env=environment))
    result["pending"] = compareHistory(result["history"], migrationDir)
    result["runningImage"] = container["Config"]["Image"]
    result["runningImageId"] = container["Image"]
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--deploy-dir", type=Path, default=Path("/opt/moahome"))
    parser.add_argument("--migration-dir", type=Path, required=True)
    parser.add_argument("--candidate", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.candidate):
        raise PreflightError("후보 전체 SHA가 필요합니다.")
    report = inspectProduction(args.deploy_dir, args.migration_dir)
    report["candidate"] = args.candidate
    # 이관 대상 건수 등 운영 메타데이터는 보호된 호스트에만 저장하고 공개 Actions 로그에는 포함하지 않습니다.
    folder = args.deploy_dir / ".preflight"
    folder.mkdir(mode=0o700, exist_ok=True)
    record = folder / f"{args.candidate}.json"
    fd = os.open(record, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(report, stream)
    print(json.dumps({"appliedMigrationCount": len(report["history"]), "pending": report["pending"],
                      "runningImage": report["runningImage"], "record": str(record)}))


if __name__ == "__main__":
    try:
        main()
    except (PreflightError, KeyError, ValueError, OSError) as failure:
        print(str(failure) if isinstance(failure, PreflightError) else "운영 사전 점검에 실패했습니다.", file=sys.stderr)
        sys.exit(1)
