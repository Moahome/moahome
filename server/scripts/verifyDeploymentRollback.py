#!/usr/bin/env python3
"""verifyDeployment.sh의 임시 DB·HTTPS 환경에서 실제 API 교체와 복귀를 검증합니다."""

import importlib.util
import os
from pathlib import Path


SERVER_DIR = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("deployApi", SERVER_DIR / "deploy" / "deployApi.py")
deployment = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deployment)


# 외부 서비스 없이 로컬 CA·임시 포트로 공개 경로 검증을 수행하며 운영 설정에는 적용하지 않습니다.
def verifyRollback():
    smokeDir = Path(os.environ["SMOKE_DIR"])
    project = os.environ["SMOKE_PROJECT"]
    baseImage = os.environ["SMOKE_API_IMAGE"]
    originalCommand = deployment.command
    composePrefix = ["env", "-u", "API_IMAGE", "docker", "compose", "--project-name", project, "--env-file", str(smokeDir / "deploy.env"),
                     "-f", str(SERVER_DIR / "deploy" / "compose.prod.yml"), "-f", str(smokeDir / "compose.test.yml")]
    httpsPort = originalCommand(*composePrefix, "port", "nginx", "443").rsplit(":", 1)[1]

    def localCommand(*args):
        if args[0] == "curl" and args[-1].startswith("https://api.example.test/"):
            args = [*args[:-1], "--noproxy", "*", "--cacert", str(smokeDir / "ca.pem"), "--resolve",
                    f"api.example.test:{httpsPort}:127.0.0.1",
                    args[-1].replace("https://api.example.test/", f"https://api.example.test:{httpsPort}/")]
        return originalCommand(*args)

    class LocalDeployment(deployment.Deployment):
        def compose(self, settingsPath, *args):
            if args == ("pull", "api"):
                # CI에서 방금 검증한 로컬 이미지를 사용하므로 테스트 레지스트리로 게시하지 않습니다.
                return ""
            return deployment.command(
                "env", "-u", "API_IMAGE", "docker", "compose", "--project-name", project, "--env-file", str(settingsPath),
                "-f", str(SERVER_DIR / "deploy" / "compose.prod.yml"), "-f", str(smokeDir / "compose.test.yml"), *args
            )

        def verify(self, settingsPath, expectedId):
            super().verify(settingsPath, expectedId)
            if settingsPath.name == "candidate.env":
                # 실제 새 이미지가 정상 기동한 뒤 실패를 주입하여 외부 검증 실패 경로로 복귀시킵니다.
                raise deployment.DeploymentError("격리 검증용 새 배포 실패")

    # 환경·JAR은 동일하고 이미지 ID만 다른 후보를 만들어 실제 컨테이너 교체가 발생하게 합니다.
    context = smokeDir / "rollback-build"
    context.mkdir()
    (context / "Dockerfile").write_text(
        "ARG BASE_IMAGE=moahome-api:local-check\nFROM ${BASE_IMAGE}\nLABEL com.moahome.rollback-check=true\n"
    )
    candidateImage = f"{project}-rollback:check"
    (smokeDir / "rollbackImage.txt").write_text(candidateImage)
    originalCommand("docker", "build", "--tag", candidateImage, "--build-arg", f"BASE_IMAGE={baseImage}", str(context))
    current = smokeDir / ".deploy.env"
    current.write_text((smokeDir / "deploy.env").read_text())
    (smokeDir / ".env.prod").write_text("# 격리 Compose는 APP_ENV_FILE의 임시 환경 파일을 사용합니다.\n")
    previous = smokeDir / ".previousDeploy.env"
    previous.write_text("unchanged-previous\n")
    deployment.command = localCommand
    try:
        service = LocalDeployment(smokeDir, candidateImage)
        originalId = service.container(current)["Image"]
        assert originalId != service.imageInfo(candidateImage)["Id"]
        try:
            service.deploy()
        except deployment.DeploymentError as error:
            if "자동 롤백하고 내부·외부 검증을 통과" not in str(error):
                raise
        else:
            raise AssertionError("복귀한 배포가 성공으로 처리됐습니다.")
        assert service.container(current)["Image"] == originalId
        assert previous.read_text() == "unchanged-previous\n"
        rolledReference = next(line.split("=", 1)[1] for line in current.read_text().splitlines()
                               if line.startswith("API_IMAGE="))
        assert service.imageInfo(rolledReference)["Id"] == originalId
        print("실제 API 이미지 교체 → 검증 실패 → 직전 이미지 복귀·내부/외부 검증 통과")
    finally:
        deployment.command = originalCommand


if __name__ == "__main__":
    verifyRollback()
