#!/usr/bin/env python3
"""API 배포·외부 검증과 Migration이 동일한 직전 정상 이미지로의 자동 복귀를 처리합니다."""

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import zipfile


IMAGE_PATTERN = re.compile(r"^[a-z0-9][a-zA-Z0-9./:@_-]+$")
MIGRATION_PREFIX = "BOOT-INF/classes/db/migration/"


class DeploymentError(RuntimeError):
    pass


# 설정 조회에는 비밀값이 포함되므로 출력은 호출자에게만 반환하고 로그에 기록하지 않습니다.
def command(*args):
    return subprocess.run(
        args, check=True, text=True, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE
    ).stdout.strip()


# SQL·앱 설정·Flyway 확장과 라이브러리를 비교하여 새 Migration이 있는 배포는 자동 복귀에서 제외합니다.
def migrationManifest(jarPath):
    with zipfile.ZipFile(jarPath) as archive:
        names = [entry.filename for entry in archive.infolist() if not entry.is_dir()]
        if len(names) != len(set(names)):
            raise DeploymentError("JAR에 중복 경로가 있어 Migration을 비교할 수 없습니다.")
        if not any(name.startswith(MIGRATION_PREFIX) for name in names):
            raise DeploymentError("JAR의 Migration 목록이 비어 있습니다.")
        if not {"BOOT-INF/classes/application.properties", "BOOT-INF/classes/application-prod.properties"}.issubset(names):
            raise DeploymentError("JAR의 기본·운영 설정을 확인할 수 없습니다.")
        manifest = {}
        for name in sorted(names):
            resource = name.startswith(MIGRATION_PREFIX) or (
                name.startswith("BOOT-INF/classes/application")
                and name.endswith((".properties", ".yaml", ".yml"))
            )
            library = name.startswith("BOOT-INF/lib/flyway-") and name.endswith(".jar")
            classFile = name.startswith("BOOT-INF/classes/") and name.endswith(".class")
            if not (resource or library or classFile):
                continue
            content = archive.read(name)
            # Java 콜백과 새 Flyway 참조 클래스도 비교하여 SQL만 같은 경우를 허용하지 않습니다.
            if resource or library or b"org/flywaydb/" in content:
                manifest[name] = hashlib.sha256(content).hexdigest()
        return manifest


# 이미지의 앱을 실행하지 않고 JAR만 추출하여 사전 비교가 운영 DB에 접근하지 않게 합니다.
def imageManifest(imageId, workDir, name):
    containerId = command("docker", "container", "create", "--network", "none", imageId)
    try:
        jarPath = workDir / f"{name}.jar"
        command("docker", "container", "cp", f"{containerId}:/app/app.jar", str(jarPath))
        return migrationManifest(jarPath)
    finally:
        command("docker", "container", "rm", containerId)


def environment(values):
    return dict(item.split("=", 1) for item in values or [])


# 배포와 복귀 모두 비교를 마친 이미지에 고정하여 mutable 태그를 다시 해석하지 않습니다.
def immutableReference(imageInfo, preferred):
    digests = imageInfo.get("RepoDigests") or []
    return preferred if preferred in digests else next(iter(digests), imageInfo["Id"])


# 기존 설정의 다른 항목을 보존하며 이미지 참조만 교체합니다. 환경 파일을 source하지 않습니다.
def withImage(settings, image):
    lines = [line for line in settings.splitlines() if not line.startswith("API_IMAGE=")]
    return "\n".join([*lines, f"API_IMAGE={image}", ""])


class Deployment:
    def __init__(self, deployDir, image):
        self.deployDir = deployDir
        self.image = image

    def compose(self, settingsPath, *args):
        # 호출자의 API_IMAGE가 롤백 환경 파일보다 우선하지 않도록 이미지 값은 파일에서만 읽습니다.
        return command(
            "env", "-u", "API_IMAGE", "docker", "compose", "--project-directory", str(self.deployDir),
            "--env-file", str(settingsPath), "-f", str(self.deployDir / "compose.prod.yml"), *args
        )

    # 실제 실행 컨테이너를 기준으로 판단하며 설정 파일만으로 정상 버전을 추정하지 않습니다.
    def container(self, settingsPath):
        containerId = self.compose(settingsPath, "ps", "--all", "--quiet", "api")
        if not containerId or len(containerId.splitlines()) != 1:
            raise DeploymentError("실행 API 컨테이너를 하나로 확인할 수 없습니다.")
        return json.loads(command("docker", "container", "inspect", containerId))[0]

    def imageInfo(self, image):
        return json.loads(command("docker", "image", "inspect", image))[0]

    # 내부 상태와 공개 HTTPS·인증 보호를 함께 검사하여 배포와 복귀에 같은 성공 기준을 적용합니다.
    def verify(self, settingsPath, expectedId):
        container = self.container(settingsPath)
        if (container["Image"] != expectedId or not container["State"]["Running"]
                or container["State"].get("Health", {}).get("Status") != "healthy"
                or container["RestartCount"] != 0):
            raise DeploymentError("API 이미지·healthy 상태·재시작 횟수가 성공 조건과 다릅니다.")
        internal = self.compose(settingsPath, "exec", "-T", "api", "curl", "--fail", "--silent",
                                "--show-error", "--max-time", "10",
                                "http://127.0.0.1:8080/actuator/health/readiness")
        if json.loads(internal) != {"status": "UP"}:
            raise DeploymentError("API 내부 readiness 검증에 실패했습니다.")
        config = json.loads(self.compose(settingsPath, "config", "--format", "json"))
        domain = config["services"]["nginx"]["environment"]["API_DOMAIN"]
        if not re.fullmatch(r"[a-zA-Z0-9.-]+", domain):
            raise DeploymentError("API_DOMAIN 형식을 확인하세요.")
        readiness = command("curl", "--fail", "--silent", "--show-error", "--max-time", "10",
                            "--retry", "5", "--retry-delay", "3",
                            f"https://{domain}/actuator/health/readiness")
        if json.loads(readiness) != {"status": "UP"}:
            raise DeploymentError("API 외부 readiness 검증에 실패했습니다.")
        authStatus = command("curl", "--silent", "--show-error", "--max-time", "10", "--output",
                             "/dev/null", "--write-out", "%{http_code}", f"https://{domain}/api/users/me")
        if authStatus != "401":
            raise DeploymentError("미인증 사용자 API의 401 검증에 실패했습니다.")

    # 직전 정상 이미지를 고정하고 설정·환경·Migration이 같을 때만 자동 복귀를 허용합니다.
    def rollbackTarget(self, current, candidate, candidateInfo, workDir):
        try:
            container = self.container(current)
            oldInfo = self.imageInfo(container["Image"])
            config = json.loads(self.compose(current, "config", "--format", "json"))
            oldReference = config["services"]["api"]["image"]
            if self.imageInfo(oldReference)["Id"] != oldInfo["Id"]:
                raise DeploymentError("마지막 배포 설정과 실행 이미지가 다릅니다.")
            self.verify(current, oldInfo["Id"])
            desired = json.loads(self.compose(candidate, "config", "--format", "json"))
            if any(oldInfo["Config"].get(key) != candidateInfo["Config"].get(key)
                   or oldInfo["Config"].get(key) != container["Config"].get(key)
                   for key in ("Entrypoint", "Cmd", "WorkingDir", "User")):
                raise DeploymentError("앱 실행 명령 또는 사용자·경로가 변경됩니다.")
            if any(desired["services"]["api"].get(key) is not None for key in ("entrypoint", "command")):
                raise DeploymentError("Compose의 별도 앱 실행 명령은 자동 롤백에서 지원하지 않습니다.")
            desiredEnv = {**environment(candidateInfo["Config"].get("Env")),
                          **desired["services"]["api"].get("environment", {})}
            if desiredEnv != environment(container["Config"].get("Env")):
                raise DeploymentError("앱 실행 환경이 변경됩니다.")
            if imageManifest(oldInfo["Id"], workDir, "previous") != imageManifest(
                    candidateInfo["Id"], workDir, "candidate"):
                raise DeploymentError("Migration·앱 설정·Flyway 확장 또는 라이브러리가 변경됩니다.")
            # 태그가 바뀌어도 처음 확인한 이미지로 복귀하며 롤백 중에는 pull하지 않습니다.
            reference = immutableReference(oldInfo, oldReference)
            return oldInfo["Id"], reference
        except (OSError, ValueError, KeyError, zipfile.BadZipFile, DeploymentError, subprocess.CalledProcessError) as error:
            reason = str(error) if isinstance(error, DeploymentError) else f"정상 상태·비교 조회 오류({type(error).__name__})"
            print(f"자동 롤백 제외: {reason}", file=sys.stderr)
            return None

    # DB·Redis를 되돌리지 않고 API를 교체한 뒤 Nginx와 공개 경로까지 확인합니다.
    def activate(self, settingsPath, imageId):
        self.compose(settingsPath, "up", "-d", "--no-deps", "--pull", "never", "--wait", "--wait-timeout", "180", "api")
        self.compose(settingsPath, "up", "-d", "--no-deps", "--wait", "--wait-timeout", "60", "nginx")
        self.compose(settingsPath, "exec", "-T", "nginx", "nginx", "-t")
        self.compose(settingsPath, "exec", "-T", "nginx", "nginx", "-s", "reload")
        self.verify(settingsPath, imageId)

    # 복귀 후에도 배포는 실패로 반환하여 실패 이미지를 정상 이력에 추가하거나 정리하지 않습니다.
    def deploy(self):
        if not IMAGE_PATTERN.fullmatch(self.image):
            raise DeploymentError("이미지 참조 형식을 확인하세요.")
        current = self.deployDir / ".deploy.env"
        if not current.is_file() or not (self.deployDir / ".env.prod").is_file():
            raise DeploymentError(".deploy.env와 .env.prod를 먼저 준비하세요.")
        with (self.deployDir / ".deployment.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with tempfile.TemporaryDirectory(prefix=".deployment.", dir=self.deployDir) as directory:
                workDir = Path(directory)
                original = current.read_text()
                candidate = workDir / "candidate.env"
                candidate.write_text(withImage(original, self.image))
                self.compose(candidate, "config", "--quiet")
                self.compose(candidate, "pull", "api")
                candidateInfo = self.imageInfo(self.image)
                candidate.write_text(withImage(original, immutableReference(candidateInfo, self.image)))
                target = self.rollbackTarget(current, candidate, candidateInfo, workDir)
                rollback = workDir / "rollback.env"
                if target:
                    rollback.write_text(withImage(original, target[1]))
                    # 비밀값이 포함된 설정은 메모리에만 보관하며 중간에 변경되면 복귀를 중단합니다.
                    rollbackConfig = self.compose(rollback, "config", "--format", "json")
                    print("자동 롤백 준비 완료: 직전 정상 이미지와 Migration·실행 환경이 동일합니다.")
                self.compose(candidate, "up", "-d", "--wait", "--wait-timeout", "60", "redis")
                try:
                    self.activate(candidate, candidateInfo["Id"])
                    if current.read_text() != original:
                        raise DeploymentError("배포 중 마지막 정상 설정 파일이 변경되었습니다.")
                    previous = workDir / "previous.env"
                    previous.write_text(original)
                    previous.replace(self.deployDir / ".previousDeploy.env")
                    candidate.replace(current)
                except (OSError, ValueError, KeyError, DeploymentError, subprocess.CalledProcessError) as error:
                    if not target:
                        raise DeploymentError("배포 실패. 자동 롤백 조건을 충족하지 않아 수동 복구가 필요합니다.") from error
                    try:
                        if (current.read_text() != original
                                or self.compose(rollback, "config", "--format", "json") != rollbackConfig):
                            raise DeploymentError("배포 중 설정이 변경되어 자동 롤백을 중단합니다.")
                        self.activate(rollback, target[0])
                        rollback.replace(current)
                    except (OSError, ValueError, KeyError, DeploymentError, subprocess.CalledProcessError) as rollbackError:
                        raise DeploymentError("배포 실패·자동 롤백 실패. 실제 이미지와 DB 상태를 확인해 수동 복구하세요.") from rollbackError
                    raise DeploymentError("배포 실패. 직전 정상 이미지로 자동 롤백하고 내부·외부 검증을 통과했습니다.") from error
                print("API 배포·내부/외부 readiness·인증 보호 검증 완료. 실제 로그인·업무 동작을 추가로 확인하세요.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image")
    parser.add_argument("--deploy-dir", dest="deployDir", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    try:
        os.umask(0o077)
        Deployment(args.deployDir.resolve(), args.image).deploy()
    except (OSError, ValueError, KeyError, DeploymentError, subprocess.CalledProcessError) as error:
        print(f"API 배포 중단: {error}", file=sys.stderr)
        sys.exit(1)
