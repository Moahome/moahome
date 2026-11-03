"""Docker·GHCR 삭제 호출을 격리해 정상 버전 보존과 실패 시 중단을 검증합니다."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "deploy" / "retainImages.py"
SPEC = importlib.util.spec_from_file_location("retainImages", SCRIPT_PATH)
retention = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(retention)
REPOSITORY = "ghcr.io/moahome/moahome-api"


def image(number):
    return f"{REPOSITORY}@sha256:{number:064x}"


def version(number, tags=None):
    return {
        "id": number,
        "name": image(number).split("@", 1)[1],
        "created_at": f"2026-11-{number:02d}T00:00:00Z",
        "metadata": {"container": {"tags": [f"{number:040x}"] if tags is None else tags}},
    }


class ImageRetentionTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.deployDir = Path(self.temporary.name)
        (self.deployDir / ".deploy.env").write_text(f"API_IMAGE={image(4)}\n")
        self.historyPath = self.deployDir / ".successfulImages.json"

    def testRecordsThreeDistinctSuccessesInDeploymentOrder(self):
        for number in [1, 2, 3, 4, 4]:
            retained = retention.recordSuccess(self.deployDir, image(number))
        self.assertEqual([image(4), image(3), image(2)], retained)
        self.assertEqual(retained, json.loads(self.historyPath.read_text()))
        self.assertEqual(0o600, self.historyPath.stat().st_mode & 0o777)
        # 롤백한 버전도 동일 digest를 중복 보관하지 않고 최근 성공 순서로 이동합니다.
        self.assertEqual([image(2), image(4), image(3)], retention.recordSuccess(self.deployDir, image(2)))

    def testCorruptOrForeignHistoryDoesNotGetOverwritten(self):
        for content in ['{}', '["invalid"]', '[null]', json.dumps([image(1).replace("moahome/", "other/")])]:
            with self.subTest(content=content):
                self.historyPath.write_text(content)
                with self.assertRaises(ValueError):
                    retention.recordSuccess(self.deployDir, image(4))
                self.assertEqual(content, self.historyPath.read_text())

    def testRegistryKeepsSuccessesAndNewerCandidates(self):
        versions = [version(number) for number in range(1, 7)]
        deleted = retention.registryDeletionCandidates(versions, [image(4), image(3), image(2)])
        self.assertEqual([1], [item["id"] for item in deleted])

    def testRegistryKeepsUntaggedManifestsAndCustomTags(self):
        versions = [version(1, []), version(2, ["latest"]), version(3, [f"{3:040x}", "manual"])]
        versions += [version(number) for number in [4, 5, 6]]
        self.assertEqual([], retention.registryDeletionCandidates(versions, [image(6), image(5), image(4)]))

    def testMissingProtectedRegistryVersionStopsDeletion(self):
        with self.assertRaises(ValueError):
            retention.registryDeletionCandidates([version(4)], [image(4), image(3), image(2)])

    def testRegistryReadsEveryPageForUsersAndOrganizations(self):
        for ownerType, scope in [("User", "users"), ("Organization", "orgs")]:
            with self.subTest(ownerType=ownerType):
                with patch.object(retention, "githubRequest", side_effect=[
                    {"type": ownerType}, [version(1)] * 100, [version(2)]
                ]) as request:
                    path, versions = retention.registryVersions("moahome", "test-token")
                self.assertEqual(f"/{scope}/moahome/packages/container/moahome-api/versions", path)
                self.assertEqual(101, len(versions))
                self.assertEqual(f"{path}?per_page=100&page=2", request.call_args.args[0])

    def testChangedDeploymentStopsBeforeHistoryOrDeletion(self):
        with patch.object(retention, "docker") as docker, patch.object(retention, "githubRequest") as request:
            with self.assertRaises(ValueError):
                retention.retainImages(self.deployDir, image(3), "test-token")
        docker.assert_not_called()
        request.assert_not_called()
        self.assertFalse(self.historyPath.exists())

    def testUnhealthyOrWrongContainerStopsBeforeHistoryOrDeletion(self):
        good = {
            "Config": {"Image": image(4)}, "Image": "current-id", "RestartCount": 0,
            "State": {"Running": True, "Health": {"Status": "healthy"}},
        }
        for changes in [
            {"Config": {"Image": image(3)}}, {"RestartCount": 1},
            {"State": {"Running": True, "Health": {"Status": "unhealthy"}}},
            {"State": {"Running": False, "Health": {"Status": "healthy"}}},
        ]:
            with self.subTest(changes=changes):
                with patch.object(retention, "docker", side_effect=["api-id", json.dumps([{**good, **changes}])]):
                    with self.assertRaises(ValueError):
                        retention.retainImages(self.deployDir, image(4), "test-token")
                self.assertFalse(self.historyPath.exists())

    def testBootstrapDoesNotDeleteExistingImages(self):
        with patch.object(retention, "verifyDeployment", return_value="current-id"), \
                patch.object(retention, "pruneLocalImages") as prune, \
                patch.object(retention, "registryVersions") as registry:
            retention.retainImages(self.deployDir, image(4), "test-token")
        prune.assert_not_called()
        registry.assert_not_called()
        self.assertEqual([image(4)], json.loads(self.historyPath.read_text()))

    def testConcurrentDeploymentStopsBeforeDockerOrRegistryAccess(self):
        with (self.deployDir / ".deployment.lock").open("a") as lock:
            retention.fcntl.flock(lock, retention.fcntl.LOCK_EX | retention.fcntl.LOCK_NB)
            with patch.object(retention, "docker") as docker, patch.object(retention, "githubRequest") as request:
                with self.assertRaises(BlockingIOError):
                    retention.retainImages(self.deployDir, image(4), "test-token")
            docker.assert_not_called()
            request.assert_not_called()
            self.assertFalse(self.historyPath.exists())

    def testRegistryReadFailurePreservesHistoryAndStopsAllDeletion(self):
        self.historyPath.write_text(json.dumps([image(3), image(2)]))
        with patch.object(retention, "verifyDeployment", return_value="current-id"), \
                patch.object(retention, "pruneLocalImages") as prune, \
                patch.object(retention, "registryVersions", side_effect=RuntimeError("HTTP 403")):
            with self.assertRaises(RuntimeError):
                retention.retainImages(self.deployDir, image(4), "test-token")
        prune.assert_not_called()
        self.assertEqual([image(4), image(3), image(2)], json.loads(self.historyPath.read_text()))

    def testOnlyOldApiImagesAreDeletedLocally(self):
        def localImage(number, tags=None, digests=None):
            return {"Id": f"id-{number}", "RepoTags": [f"{REPOSITORY}:{number:040x}"] if tags is None else tags,
                    "RepoDigests": [image(number)] if digests is None else digests}

        images = [localImage(number) for number in range(1, 9)]
        # 중지된 컨테이너도 보호하며, 다른 저장소와 공유된 이미지의 태그는 건드리지 않습니다.
        images[4]["RepoTags"].append("other-api:manual")
        images[5]["RepoDigests"].append("ghcr.io/other/api@sha256:" + "6" * 64)
        images[6] = localImage(7, tags=[])
        images[7]["RepoTags"].append(f"{REPOSITORY}:{9:040x}")

        def fakeDocker(*args):
            if args[:2] == ("image", "inspect") and len(args) == 3:
                return json.dumps([localImage(int(args[2].split(":")[-1], 16))])
            if args[:2] == ("container", "ls"):
                return "stopped-container"
            if args[:2] == ("container", "inspect"):
                return json.dumps([{"Image": "id-4"}])
            if args[:2] == ("image", "ls"):
                return "\n".join(item["Id"] for item in images)
            if args[:2] == ("image", "inspect"):
                return json.dumps(images)
            if args[:2] == ("image", "rm"):
                return "deleted"
            self.fail(f"예상하지 않은 Docker 호출: {args}")

        with patch.object(retention, "docker", side_effect=fakeDocker) as docker:
            retention.pruneLocalImages(REPOSITORY, [image(3), image(2), image(1)], "id-3")
        deleted = [call.args for call in docker.call_args_list if call.args[:2] == ("image", "rm")]
        self.assertEqual([
            ("image", "rm", image(7)),
            ("image", "rm", f"{REPOSITORY}:{8:040x}", f"{REPOSITORY}:{9:040x}"),
        ], deleted)

    def testSuccessfulCleanupOnlyDeletesUnprotectedRegistryVersion(self):
        self.historyPath.write_text(json.dumps([image(3), image(2), image(1)]))
        versions = [version(number) for number in range(1, 6)]
        with patch.object(retention, "verifyDeployment", return_value="current-id"), \
                patch.object(retention, "pruneLocalImages") as prune, \
                patch.object(retention, "registryVersions", return_value=("/versions", versions)), \
                patch.object(retention, "githubRequest") as request:
            retention.retainImages(self.deployDir, image(4), "test-token")
        prune.assert_called_once_with(REPOSITORY, [image(4), image(3), image(2)], "current-id")
        request.assert_called_once_with("/versions/1", "test-token", method="DELETE")

    def testInvalidInputNeverAcquiresLockOrDeletes(self):
        for badImage, token in [(image(4), ""), (f"{REPOSITORY}:latest", "test-token")]:
            with self.subTest(image=badImage, token=bool(token)):
                with self.assertRaises(ValueError):
                    retention.retainImages(self.deployDir, badImage, token)
        self.assertFalse((self.deployDir / ".deployment.lock").exists())


if __name__ == "__main__":
    unittest.main()
