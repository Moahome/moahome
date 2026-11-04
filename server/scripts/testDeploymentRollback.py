"""실제 운영 연결 없이 배포 실패·조건부 복귀·성공 기록 보존을 검증합니다."""

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "deploy" / "deployApi.py"
SPEC = importlib.util.spec_from_file_location("deployApi", SCRIPT_PATH)
deployment = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deployment)
OLD_IMAGE = "ghcr.io/moahome/moahome-api@sha256:" + "1" * 64
NEW_IMAGE = "ghcr.io/moahome/moahome-api@sha256:" + "2" * 64


class DeploymentRollbackTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.deployDir = Path(self.temporary.name)
        self.original = f"API_DOMAIN=api.example.test\nAPI_IMAGE={OLD_IMAGE}\n"
        self.current = self.deployDir / ".deploy.env"
        self.current.write_text(self.original)
        (self.deployDir / ".env.prod").write_text("APP_MODE=prod\n")
        self.previous = self.deployDir / ".previousDeploy.env"
        self.previous.write_text("previous-success\n")
        self.history = self.deployDir / ".successfulImages.json"
        self.history.write_text(json.dumps([OLD_IMAGE]))
        self.service = deployment.Deployment(self.deployDir, NEW_IMAGE)
        self.composeCalls = []

    def compose(self, settingsPath, *args):
        self.composeCalls.append((settingsPath.name, args))
        if args == ("config", "--format", "json"):
            return json.dumps({"services": {"api": {"image": OLD_IMAGE, "environment": {"APP_MODE": "prod"}}}})
        return ""

    def testSuccessPublishesSettingsOnlyAfterExternalVerification(self):
        def verified(settingsPath, imageId):
            self.assertEqual(self.original, self.current.read_text())
            self.assertEqual("previous-success\n", self.previous.read_text())
            self.assertEqual("new-id", imageId)

        with patch.object(self.service, "compose", side_effect=self.compose), \
                patch.object(self.service, "imageInfo", return_value={"Id": "new-id", "RepoDigests": [NEW_IMAGE]}), \
                patch.object(self.service, "rollbackTarget", return_value=("old-id", OLD_IMAGE)), \
                patch.object(self.service, "activate", side_effect=verified):
            self.service.deploy()
        self.assertIn(f"API_IMAGE={NEW_IMAGE}\n", self.current.read_text())
        self.assertEqual(self.original, self.previous.read_text())
        self.assertEqual([OLD_IMAGE], json.loads(self.history.read_text()))
        self.assertEqual([], [path for path in self.deployDir.glob(".deployment.*") if path.is_dir()])

    def testImageReferencesPinDigestsOrLocalIdInsteadOfMutableTags(self):
        info = {"Id": "local-id", "RepoDigests": [OLD_IMAGE, NEW_IMAGE]}
        self.assertEqual(NEW_IMAGE, deployment.immutableReference(info, NEW_IMAGE))
        self.assertEqual(OLD_IMAGE, deployment.immutableReference(info, "moahome-api:mutable"))
        self.assertEqual("local-id", deployment.immutableReference({"Id": "local-id"}, "moahome-api:mutable"))

    def testStartupAndExternalFailuresRollbackOnceAndStillFailDeployment(self):
        for failure in [subprocess.CalledProcessError(1, ["docker", "compose", "up"]),
                        deployment.DeploymentError("외부 readiness 실패")]:
            with self.subTest(failure=type(failure).__name__):
                self.current.write_text(self.original)
                with patch.object(self.service, "compose", side_effect=self.compose), \
                        patch.object(self.service, "imageInfo", return_value={"Id": "new-id", "RepoDigests": [NEW_IMAGE]}), \
                        patch.object(self.service, "rollbackTarget", return_value=("old-id", OLD_IMAGE)), \
                        patch.object(self.service, "activate", side_effect=[failure, None]) as activate:
                    with self.assertRaisesRegex(deployment.DeploymentError, "자동 롤백하고 내부·외부 검증"):
                        self.service.deploy()
                self.assertEqual(["new-id", "old-id"], [call.args[1] for call in activate.call_args_list])
                self.assertIn(f"API_IMAGE={OLD_IMAGE}\n", self.current.read_text())
                self.assertEqual("previous-success\n", self.previous.read_text())
                self.assertEqual([OLD_IMAGE], json.loads(self.history.read_text()))

    def testChangedMigrationsNeverAttemptRollback(self):
        with patch.object(self.service, "compose", side_effect=self.compose), \
                patch.object(self.service, "imageInfo", return_value={"Id": "new-id", "RepoDigests": [NEW_IMAGE]}), \
                patch.object(self.service, "rollbackTarget", return_value=None), \
                patch.object(self.service, "activate", side_effect=deployment.DeploymentError("기동 실패")) as activate:
            with self.assertRaisesRegex(deployment.DeploymentError, "수동 복구"):
                self.service.deploy()
        self.assertEqual(1, activate.call_count)
        self.assertEqual(self.original, self.current.read_text())

    def testRollbackFailureDoesNotTryAnotherHistoricalVersion(self):
        with patch.object(self.service, "compose", side_effect=self.compose), \
                patch.object(self.service, "imageInfo", return_value={"Id": "new-id", "RepoDigests": [NEW_IMAGE]}), \
                patch.object(self.service, "rollbackTarget", return_value=("old-id", OLD_IMAGE)), \
                patch.object(self.service, "activate", side_effect=deployment.DeploymentError("실패")) as activate:
            with self.assertRaisesRegex(deployment.DeploymentError, "자동 롤백 실패"):
                self.service.deploy()
        self.assertEqual(2, activate.call_count)
        self.assertEqual(self.original, self.current.read_text())
        self.assertEqual("previous-success\n", self.previous.read_text())

    def testSettingsChangedDuringDeploymentBlockRollback(self):
        def failed(settingsPath, imageId):
            self.current.write_text("API_IMAGE=someone-else\n")
            raise deployment.DeploymentError("기동 실패")

        with patch.object(self.service, "compose", side_effect=self.compose), \
                patch.object(self.service, "imageInfo", return_value={"Id": "new-id", "RepoDigests": [NEW_IMAGE]}), \
                patch.object(self.service, "rollbackTarget", return_value=("old-id", OLD_IMAGE)), \
                patch.object(self.service, "activate", side_effect=failed) as activate:
            with self.assertRaisesRegex(deployment.DeploymentError, "자동 롤백 실패"):
                self.service.deploy()
        self.assertEqual(1, activate.call_count)
        self.assertEqual("API_IMAGE=someone-else\n", self.current.read_text())

    def testEnvFileChangedDuringDeploymentBlockRollback(self):
        readCount = 0

        def changed(settingsPath, *args):
            nonlocal readCount
            value = self.compose(settingsPath, *args)
            if args == ("config", "--format", "json"):
                readCount += 1
                return value if readCount == 1 else value + " "
            return value

        with patch.object(self.service, "compose", side_effect=changed), \
                patch.object(self.service, "imageInfo", return_value={"Id": "new-id", "RepoDigests": [NEW_IMAGE]}), \
                patch.object(self.service, "rollbackTarget", return_value=("old-id", OLD_IMAGE)), \
                patch.object(self.service, "activate", side_effect=deployment.DeploymentError("실패")) as activate:
            with self.assertRaisesRegex(deployment.DeploymentError, "자동 롤백 실패"):
                self.service.deploy()
        self.assertEqual(1, activate.call_count)

    def testPullFailureDoesNotReplaceApiOrChangeSettings(self):
        def failedPull(settingsPath, *args):
            if args == ("pull", "api"):
                raise subprocess.CalledProcessError(1, ["docker", "compose", "pull"])
            return self.compose(settingsPath, *args)

        with patch.object(self.service, "compose", side_effect=failedPull), \
                patch.object(self.service, "activate") as activate:
            with self.assertRaises(subprocess.CalledProcessError):
                self.service.deploy()
        activate.assert_not_called()
        self.assertEqual(self.original, self.current.read_text())

    def testSuccessfulApiWithSettingsWriteFailureStillRollsBack(self):
        originalReplace = Path.replace

        def failCandidateReplace(path, destination):
            if path.name == "candidate.env":
                raise OSError("설정 저장 실패")
            return originalReplace(path, destination)

        with patch.object(self.service, "compose", side_effect=self.compose), \
                patch.object(self.service, "imageInfo", return_value={"Id": "new-id", "RepoDigests": [NEW_IMAGE]}), \
                patch.object(self.service, "rollbackTarget", return_value=("old-id", OLD_IMAGE)), \
                patch.object(self.service, "activate") as activate, \
                patch.object(Path, "replace", autospec=True, side_effect=failCandidateReplace):
            with self.assertRaisesRegex(deployment.DeploymentError, "자동 롤백하고 내부·외부 검증"):
                self.service.deploy()
        self.assertEqual(["new-id", "old-id"], [call.args[1] for call in activate.call_args_list])
        self.assertIn(f"API_IMAGE={OLD_IMAGE}\n", self.current.read_text())

    def testDeploymentLockAlsoBlocksRollbackAndRetention(self):
        with (self.deployDir / ".deployment.lock").open("a") as lock:
            deployment.fcntl.flock(lock, deployment.fcntl.LOCK_EX | deployment.fcntl.LOCK_NB)
            with patch.object(self.service, "compose") as compose:
                with self.assertRaises(BlockingIOError):
                    self.service.deploy()
            compose.assert_not_called()

    def testMigrationAndEnvironmentChecksDetermineRollbackEligibility(self):
        oldInfo = {"Id": "old-id", "RepoDigests": [OLD_IMAGE], "Config": {"Env": ["APP_MODE=prod"]}}
        newInfo = {"Id": "new-id", "Config": {"Env": []}}
        oldContainer = {"Image": "old-id", "Config": {"Env": ["APP_MODE=prod"]}}
        for manifests, allowed in [([{"sql": "same"}, {"sql": "same"}], True),
                                   ([{"sql": "old"}, {"sql": "new"}], False)]:
            with self.subTest(allowed=allowed):
                with patch.object(self.service, "container", return_value=oldContainer), \
                        patch.object(self.service, "imageInfo", return_value=oldInfo), \
                        patch.object(self.service, "compose", side_effect=self.compose), \
                        patch.object(self.service, "verify"), \
                        patch.object(deployment, "imageManifest", side_effect=manifests):
                    target = self.service.rollbackTarget(self.current, self.current, newInfo, self.deployDir)
                self.assertEqual(("old-id", OLD_IMAGE) if allowed else None, target)
        with patch.object(self.service, "container", return_value=oldContainer), \
                patch.object(self.service, "imageInfo", return_value=oldInfo), \
                patch.object(self.service, "compose", side_effect=self.compose), \
                patch.object(self.service, "verify"), patch.object(deployment, "imageManifest") as manifest:
            newInfo["Config"]["Env"] = ["EXTRA_CONFIG=changed"]
            self.assertIsNone(self.service.rollbackTarget(self.current, self.current, newInfo, self.deployDir))
        manifest.assert_not_called()

    def testUnhealthyPreviousVersionCannotBeRollbackTarget(self):
        with patch.object(self.service, "container", side_effect=deployment.DeploymentError("없음")):
            self.assertIsNone(self.service.rollbackTarget(self.current, self.current, {}, self.deployDir))

    def testChangedOrOverriddenRuntimeCommandBlocksRollback(self):
        oldInfo = {"Id": "old-id", "Config": {"Env": [], "Entrypoint": ["java", "-jar", "/app/app.jar"]}}
        oldContainer = {"Image": "old-id", "Config": {"Env": ["APP_MODE=prod"],
                                                      "Entrypoint": ["java", "-jar", "/app/app.jar"]}}
        for container, candidate in [
            (oldContainer, {"Id": "new-id", "Config": {"Env": [], "Entrypoint": ["different"]}}),
            ({**oldContainer, "Config": {**oldContainer["Config"], "Cmd": ["--spring.flyway.enabled=false"]}}, oldInfo),
        ]:
            with patch.object(self.service, "container", return_value=container), \
                    patch.object(self.service, "imageInfo", return_value=oldInfo), \
                    patch.object(self.service, "compose", side_effect=self.compose), \
                    patch.object(self.service, "verify"), patch.object(deployment, "imageManifest") as manifest:
                self.assertIsNone(self.service.rollbackTarget(self.current, self.current, candidate, self.deployDir))
            manifest.assert_not_called()

    def testJarExtractionNeverStartsContainerAndCleansUpOnFailure(self):
        with patch.object(deployment, "command", side_effect=["temporary-id", OSError("복사 실패"), "removed"]) as command:
            with self.assertRaises(OSError):
                deployment.imageManifest("old-id", self.deployDir, "test")
        self.assertEqual(("docker", "container", "create", "--network", "none", "old-id"), command.call_args_list[0].args)
        self.assertEqual(("docker", "container", "rm", "temporary-id"), command.call_args.args)

    def testActivateVerifiesVersionAfterNginxAndNeverPullsRollbackImage(self):
        with patch.object(self.service, "compose", side_effect=self.compose), \
                patch.object(self.service, "verify") as verify:
            self.service.activate(self.current, "old-id")
        self.assertIn("never", self.composeCalls[0][1])
        self.assertEqual(("exec", "-T", "nginx", "nginx", "-s", "reload"), self.composeCalls[-1][1])
        verify.assert_called_once_with(self.current, "old-id")

    def testVerificationRejectsInvalidImageHealthOrReadiness(self):
        container = {"Image": "new-id", "RestartCount": 0,
                     "State": {"Running": True, "Health": {"Status": "healthy"}}}
        for override in [{"Image": "old-id"}, {"RestartCount": 1},
                         {"State": {"Running": True, "Health": {"Status": "unhealthy"}}}]:
            with patch.object(self.service, "container", return_value={**container, **override}):
                with self.assertRaises(deployment.DeploymentError):
                    self.service.verify(self.current, "new-id")
        with patch.object(self.service, "container", return_value=container), \
                patch.object(self.service, "compose", return_value='{"status":"DOWN"}'):
            with self.assertRaisesRegex(deployment.DeploymentError, "내부 readiness"):
                self.service.verify(self.current, "new-id")

    def testVerificationRequiresPublicUpAnd401(self):
        container = {"Image": "new-id", "RestartCount": 0,
                     "State": {"Running": True, "Health": {"Status": "healthy"}}}
        config = json.dumps({"services": {"nginx": {"environment": {"API_DOMAIN": "api.example.test"}}}})
        for responses, success in [(['{"status":"UP"}', "401"], True),
                                    (['{"status":"DOWN"}'], False), (['{"status":"UP"}', "200"], False)]:
            with self.subTest(responses=responses):
                with patch.object(self.service, "container", return_value=container), \
                        patch.object(self.service, "compose", side_effect=['{"status":"UP"}', config]), \
                        patch.object(deployment, "command", side_effect=responses):
                    if success:
                        self.service.verify(self.current, "new-id")
                    else:
                        with self.assertRaises(deployment.DeploymentError):
                            self.service.verify(self.current, "new-id")

    def testJarManifestDetectsSqlConfigCallbackAndFlywayChanges(self):
        entries = {
            "BOOT-INF/classes/db/migration/V20261104000000__test.sql": b"SELECT 1;",
            "BOOT-INF/classes/application.properties": b"spring.flyway.enabled=true",
            "BOOT-INF/classes/application-prod.properties": b"spring.jpa.hibernate.ddl-auto=validate",
            "BOOT-INF/classes/config/Callback.class": b"class org/flywaydb/core/api/callback/Callback old",
            "BOOT-INF/lib/flyway-core-1.jar": b"flyway",
            "BOOT-INF/classes/feature/Controller.class": b"unrelated old code",
        }

        def manifest(contents):
            path = self.deployDir / "app.jar"
            with zipfile.ZipFile(path, "w") as archive:
                for name, content in contents.items():
                    archive.writestr(name, content)
            return deployment.migrationManifest(path)

        original = manifest(entries)
        for name in entries:
            with self.subTest(name=name):
                result = manifest({**entries, name: entries[name] + b" changed"})
                if name.endswith("Controller.class"):
                    self.assertEqual(original, result)
                else:
                    self.assertNotEqual(original, result)
        self.assertNotEqual(original, manifest({**entries, "BOOT-INF/classes/db/migration/V2__new.sql": b"SELECT 2;"}))
        self.assertNotEqual(original, manifest({key: value for key, value in entries.items() if "Callback" not in key}))

    def testMissingMigrationsOrSettingsCannotPassManifestComparison(self):
        for entries in [{}, {"BOOT-INF/classes/db/migration/V1__test.sql": b"SELECT 1;"}]:
            path = self.deployDir / "incomplete.jar"
            with zipfile.ZipFile(path, "w") as archive:
                for name, content in entries.items():
                    archive.writestr(name, content)
            with self.assertRaises(deployment.DeploymentError):
                deployment.migrationManifest(path)


if __name__ == "__main__":
    unittest.main()
