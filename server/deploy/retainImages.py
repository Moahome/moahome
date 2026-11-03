#!/usr/bin/env python3
"""외부 검증을 통과한 배포의 API 이미지 3개를 호스트와 GHCR에 보관합니다."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime
from urllib.error import HTTPError
from urllib.request import Request, urlopen


KEEP_COUNT = 3
IMAGE_PATTERN = re.compile(r"^(ghcr\.io/([a-z0-9_-]+)/moahome-api)@(sha256:[a-f0-9]{64})$")
COMMIT_PATTERN = re.compile(r"^[a-f0-9]{40}$")


# Docker 오류를 숨기지 않아 조회에 실패한 상태로 삭제 대상을 추정하지 않습니다.
def docker(*args):
    result = subprocess.run(
        ["docker", *args], check=True, text=True, stdout=subprocess.PIPE, stdin=subprocess.DEVNULL
    )
    return result.stdout.strip()


# 같은 호스트의 배포 잠금 안에서 실제 컨테이너와 마지막 배포 설정을 다시 확인합니다.
def verifyDeployment(deployDir, image):
    settings = (deployDir / ".deploy.env").read_text().splitlines()
    if [line for line in settings if line.startswith("API_IMAGE=")] != [f"API_IMAGE={image}"]:
        raise ValueError("검증 이후 배포 설정이 변경되어 이미지 정리를 중단합니다.")
    containerId = docker(
        "compose", "--env-file", str(deployDir / ".deploy.env"),
        "-f", str(deployDir / "compose.prod.yml"), "ps", "--all", "--quiet", "api"
    )
    if not containerId or len(containerId.splitlines()) != 1:
        raise ValueError("API 컨테이너를 하나로 확인할 수 없습니다.")
    container = json.loads(docker("container", "inspect", containerId))[0]
    if (container["Config"]["Image"] != image
            or not container["State"]["Running"]
            or container["State"].get("Health", {}).get("Status") != "healthy"
            or container["RestartCount"] != 0):
        raise ValueError("실행 이미지 또는 API 상태가 배포 성공 조건과 다릅니다.")
    return container["Image"]


# 성공 순서로 digest를 중복 제거해 재배포·롤백이 보관 슬롯을 중복 차지하지 않게 합니다.
def recordSuccess(deployDir, image):
    historyPath = deployDir / ".successfulImages.json"
    previous = json.loads(historyPath.read_text()) if historyPath.exists() else []
    repository = IMAGE_PATTERN.fullmatch(image)[1]
    if (not isinstance(previous, list)
            or any(not isinstance(item, str) or not IMAGE_PATTERN.fullmatch(item)
                   or IMAGE_PATTERN.fullmatch(item)[1] != repository for item in previous)):
        raise ValueError("성공 이미지 이력이 손상되었거나 다른 저장소를 포함합니다.")
    retained = list(dict.fromkeys([image, *previous]))[:KEEP_COUNT]
    # 삭제가 도중 실패해도 정상 버전 기록은 남깁니다. 임시 파일 교체로 부분 쓰기를 피합니다.
    temporary = historyPath.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(retained) + "\n")
    temporary.chmod(0o600)
    temporary.replace(historyPath)
    return retained


# 모든 컨테이너와 다른 저장소가 참조하는 이미지는 건너뛰고 API 저장소만 정리합니다.
def pruneLocalImages(repository, retained, currentId):
    retainedIds = {currentId}
    for image in retained:
        retainedIds.add(json.loads(docker("image", "inspect", image))[0]["Id"])
    containerIds = docker("container", "ls", "--all", "--quiet").splitlines()
    if containerIds:
        containers = json.loads(docker("container", "inspect", *containerIds))
        retainedIds.update(container["Image"] for container in containers)
    imageIds = sorted(set(docker("image", "ls", "--quiet", "--no-trunc", repository).splitlines()))
    if not imageIds:
        return
    images = json.loads(docker("image", "inspect", *imageIds))
    for image in images:
        tags = image.get("RepoTags") or []
        digests = image.get("RepoDigests") or []
        if image["Id"] in retainedIds or not (tags or digests):
            continue
        if (any(not tag.startswith(repository + ":") for tag in tags)
                or any(not digest.startswith(repository + "@") for digest in digests)):
            continue
        # 강제 삭제를 사용하지 않아 조회 후 컨테이너가 새로 참조하면 Docker가 삭제를 거부합니다.
        docker("image", "rm", *(tags or digests))
        print(f"로컬 API 이미지 삭제: {image['Id']}", file=sys.stderr)


# 토큰과 응답 본문은 로그에 노출하지 않으며, 네트워크·권한 오류 시 삭제를 중단합니다.
def githubRequest(path, token, method="GET"):
    request = Request("https://api.github.com" + path, method=method, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    try:
        with urlopen(request, timeout=30) as response:
            return json.load(response) if method == "GET" else None
    except HTTPError as error:
        raise RuntimeError(f"GHCR {method} 실패(HTTP {error.code}): 패키지 Admin 권한을 확인하세요.") from None


# 페이지를 모두 읽은 뒤 삭제하여 삭제 중 페이지 이동으로 버전을 누락하지 않습니다.
def registryVersions(owner, token):
    ownerType = githubRequest(f"/users/{owner}", token)["type"]
    if ownerType not in ("Organization", "User"):
        raise ValueError("지원하지 않는 GHCR 소유자 유형입니다.")
    scope = "orgs" if ownerType == "Organization" else "users"
    path = f"/{scope}/{owner}/packages/container/moahome-api/versions"
    versions = []
    page = 1
    while True:
        batch = githubRequest(f"{path}?per_page=100&page={page}", token)
        versions.extend(batch)
        if len(batch) < 100:
            return path, versions
        page += 1


# 보관할 digest가 모두 GHCR에 존재하는지 먼저 확인하고, 이 CI가 만든 SHA 태그만 삭제합니다.
def registryDeletionCandidates(versions, retained):
    protected = {image.split("@", 1)[1] for image in retained}
    byDigest = {version["name"]: version for version in versions}
    if not protected.issubset(byDigest):
        raise ValueError("GHCR에서 보관할 정상 이미지 전체를 확인하지 못해 정리를 중단합니다.")
    cutoff = max(datetime.fromisoformat(byDigest[digest]["created_at"].replace("Z", "+00:00"))
                 for digest in protected)
    candidates = []
    for version in versions:
        tags = version.get("metadata", {}).get("container", {}).get("tags", [])
        if version["name"] in protected or not tags or not all(COMMIT_PATTERN.fullmatch(tag) for tag in tags):
            continue
        # 더 나중에 게시된 미배포 후보와 OCI 하위 manifest·별도 태그는 임의로 삭제하지 않습니다.
        created = datetime.fromisoformat(version["created_at"].replace("Z", "+00:00"))
        if created < cutoff:
            candidates.append(version)
    return candidates


# 외부 검증이 완료된 워크플로에서만 호출하며, 로컬·원격 정리가 끝날 때까지 배포를 잠급니다.
def retainImages(deployDir, image, token):
    match = IMAGE_PATTERN.fullmatch(image)
    if not match or not token:
        raise ValueError("전체 API digest와 표준입력으로 전달한 GHCR 토큰이 필요합니다.")
    with (deployDir / ".deployment.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        currentId = verifyDeployment(deployDir, image)
        retained = recordSuccess(deployDir, image)
        print("보관할 성공 이미지: " + ", ".join(retained), file=sys.stderr)
        # 기존 이미지의 성공 여부를 생성 시각으로 추정하지 않습니다. 정상 이력 3개부터 정리합니다.
        if len(retained) < KEEP_COUNT:
            print("성공 이미지 이력 3개가 쌓일 때까지 삭제를 보류합니다.", file=sys.stderr)
            return
        path, versions = registryVersions(match[2], token)
        candidates = registryDeletionCandidates(versions, retained)
        pruneLocalImages(match[1], retained, currentId)
        for version in candidates:
            githubRequest(f"{path}/{version['id']}", token, method="DELETE")
            print(f"GHCR API 이미지 삭제: {version['name']}", file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("deployDir", type=Path)
    parser.add_argument("image")
    args = parser.parse_args()
    try:
        os.umask(0o077)
        retainImages(args.deployDir.resolve(), args.image, sys.stdin.read().strip())
    except (ValueError, OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"이미지 정리 실패(실행 중인 API는 유지): {error}", file=sys.stderr)
        sys.exit(1)
