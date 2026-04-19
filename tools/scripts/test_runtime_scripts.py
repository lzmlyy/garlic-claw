"""脚本运行时回归测试。

输入:
- 直接加载 `tools/一键启停脚本.py`、`tools/scripts/dev_runtime.py` 与 `tools/scripts/process_runtime.py` 模块

输出:
- 校验状态文件位置、开发服务定义和关闭逻辑入口是否符合新的跨平台方案

预期行为:
- 在实现迁移前，这些测试应先红灯，指出脚本能力缺口
- 在实现迁移后，这些测试应稳定通过，防止脚本行为回退
"""

from __future__ import annotations

import argparse
import importlib
import importlib.util
import unittest
from pathlib import Path
from types import ModuleType
from unittest import mock

SCRIPTS_DIR = Path(__file__).resolve().parent
TOOLS_DIR = SCRIPTS_DIR.parent
LAUNCHER_PATH = TOOLS_DIR / '一键启停脚本.py'
DEV_RUNTIME_PATH = SCRIPTS_DIR / 'dev_runtime.py'
COMMON_PATH = SCRIPTS_DIR / 'process_runtime.py'


def loadModule(module_name: str, path: Path) -> ModuleType:
    """按文件路径加载模块。

    输入:
    - module_name: 运行时模块名
    - path: 模块文件路径

    输出:
    - 已执行完成的 Python 模块对象

    预期行为:
    - 允许测试加载带中文文件名的脚本模块
    """
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f'无法为模块创建 spec: {path}')

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def loadPackageModule(module_name: str) -> ModuleType:
    """按包名加载 `tools.scripts` 下模块。"""
    return importlib.import_module(module_name)


class DevLauncherEntryTests(unittest.TestCase):
    """主入口分发回归测试。"""

    def testStateFileMovesToOtherDirectoryJson(self) -> None:
        """应将状态文件迁移到 other/dev-processes.json。"""
        launcher = loadModule('dev_launcher_state', LAUNCHER_PATH)
        self.assertTrue(
            hasattr(launcher, 'STATE_FILE'),
            '启动脚本必须暴露 STATE_FILE 供状态文件回归测试使用',
        )
        self.assertEqual(
            launcher.STATE_FILE.relative_to(launcher.ROOT).as_posix(),
            'other/dev-processes.json',
        )

    def testVerifyImagesDelegatesToDockerRuntime(self) -> None:
        """镜像校验入口应委托给 Docker 模块。"""
        launcher = loadModule('dev_launcher_verify_images', LAUNCHER_PATH)
        composePath = Path('D:/tmp/test-compose.yml')

        with mock.patch.object(
            launcher.docker_runtime,
            '验证DockerCompose镜像',
        ) as verifyImages:
            result = launcher.verifyImages(composePath)

        self.assertEqual(result, 0)
        verifyImages.assert_called_once_with(composePath)

    def testMainRoutesVerifyImagesBeforeNormalActions(self) -> None:
        """`--verify-images` 应优先走镜像校验分支。"""
        launcher = loadModule('dev_launcher_main_verify', LAUNCHER_PATH)
        args = argparse.Namespace(
            start=False,
            restart=False,
            stop=False,
            status=False,
            verify_images='docker-compose.yml',
            test=False,
            kill_ports=None,
            kill_managed_ports=False,
            action=None,
            prod=False,
            tail_logs=False,
            log=False,
            logs=False,
            build=False,
        )

        with (
            mock.patch.object(launcher, 'parseArgs', return_value=args),
            mock.patch.object(launcher, 'verifyImages', return_value=0) as verifyImages,
            mock.patch.object(launcher.dev_runtime, '启动开发服务') as startDev,
        ):
            result = launcher.main()

        self.assertEqual(result, 0)
        verifyImages.assert_called_once_with(Path('docker-compose.yml'))
        startDev.assert_not_called()

    def testMainRoutesFlagTestRunsScriptTests(self) -> None:
        """`--test` 应直接触发脚本回归测试入口。"""
        launcher = loadModule('dev_launcher_main_flag_test', LAUNCHER_PATH)
        args = argparse.Namespace(
            start=False,
            restart=False,
            stop=False,
            status=False,
            verify_images=None,
            test=True,
            kill_ports=None,
            kill_managed_ports=False,
            action=None,
            prod=False,
            tail_logs=False,
            log=False,
            logs=False,
            build=False,
        )

        with (
            mock.patch.object(launcher, 'parseArgs', return_value=args),
            mock.patch.object(launcher, 'runScriptTests', return_value=0) as runScriptTests,
        ):
            result = launcher.main()

        self.assertEqual(result, 0)
        runScriptTests.assert_called_once_with()

    def testMainRoutesKillManagedPortsBeforeNormalActions(self) -> None:
        """`--kill-managed-ports` 应优先走受管端口清理分支。"""
        launcher = loadModule('dev_launcher_main_kill_managed_ports', LAUNCHER_PATH)
        args = argparse.Namespace(
            start=False,
            restart=False,
            stop=False,
            status=False,
            verify_images=None,
            test=False,
            kill_ports=None,
            kill_managed_ports=True,
            action=None,
            prod=False,
            tail_logs=False,
            log=False,
            logs=False,
            build=False,
        )

        with (
            mock.patch.object(launcher, 'parseArgs', return_value=args),
            mock.patch.object(launcher, 'killManagedPorts', return_value=0) as killManagedPorts,
            mock.patch.object(launcher.dev_runtime, '启动开发服务') as startDev,
        ):
            result = launcher.main()

        self.assertEqual(result, 0)
        killManagedPorts.assert_called_once_with([23330, 23331, 23333])
        startDev.assert_not_called()

    def testMainRoutesKillPortsBeforeNormalActions(self) -> None:
        """`--kill-port` 应优先走按端口清理分支。"""
        launcher = loadModule('dev_launcher_main_kill_ports', LAUNCHER_PATH)
        args = argparse.Namespace(
            start=False,
            restart=False,
            stop=False,
            status=False,
            verify_images=None,
            test=False,
            kill_ports=[23330, 23333],
            kill_managed_ports=False,
            action=None,
            prod=False,
            tail_logs=False,
            log=False,
            logs=False,
            build=False,
        )

        with (
            mock.patch.object(launcher, 'parseArgs', return_value=args),
            mock.patch.object(launcher, 'killManagedPorts', return_value=0) as killManagedPorts,
            mock.patch.object(launcher.dev_runtime, '启动开发服务') as startDev,
        ):
            result = launcher.main()

        self.assertEqual(result, 0)
        killManagedPorts.assert_called_once_with([23330, 23333])
        startDev.assert_not_called()

    def testMainRoutesActionTestRunsScriptTests(self) -> None:
        """位置动作 `test` 应直接触发脚本回归测试入口。"""
        launcher = loadModule('dev_launcher_main_action_test', LAUNCHER_PATH)
        args = argparse.Namespace(
            start=False,
            restart=False,
            stop=False,
            status=False,
            verify_images=None,
            test=False,
            kill_ports=None,
            kill_managed_ports=False,
            action='test',
            prod=False,
            tail_logs=False,
            log=False,
            logs=False,
            build=False,
        )

        with (
            mock.patch.object(launcher, 'parseArgs', return_value=args),
            mock.patch.object(launcher, 'runScriptTests', return_value=0) as runScriptTests,
        ):
            result = launcher.main()

        self.assertEqual(result, 0)
        runScriptTests.assert_called_once_with()

    def testMainRoutesProdRestartThroughProdHelpers(self) -> None:
        """生产模式默认应走 stopProd + startProd。"""
        launcher = loadModule('dev_launcher_main_prod_restart', LAUNCHER_PATH)
        args = argparse.Namespace(
            start=False,
            restart=False,
            stop=False,
            status=False,
            verify_images=None,
            test=False,
            kill_ports=None,
            kill_managed_ports=False,
            action=None,
            prod=True,
            tail_logs=False,
            log=False,
            logs=False,
            build=False,
        )

        with (
            mock.patch.object(launcher, 'parseArgs', return_value=args),
            mock.patch.object(launcher, 'stopProd', return_value=0) as stopProd,
            mock.patch.object(launcher, 'startProd', return_value=0) as startProd,
        ):
            result = launcher.main()

        self.assertEqual(result, 0)
        stopProd.assert_called_once_with()
        startProd.assert_called_once_with()

    def testMainRoutesProdStatusToStatusProd(self) -> None:
        """生产模式状态查询应直接走 statusProd。"""
        launcher = loadModule('dev_launcher_main_prod_status', LAUNCHER_PATH)
        args = argparse.Namespace(
            start=False,
            restart=False,
            stop=False,
            status=True,
            verify_images=None,
            test=False,
            kill_ports=None,
            kill_managed_ports=False,
            action=None,
            prod=True,
            tail_logs=False,
            log=False,
            logs=False,
            build=False,
        )

        with (
            mock.patch.object(launcher, 'parseArgs', return_value=args),
            mock.patch.object(launcher, 'statusProd', return_value=0) as statusProd,
        ):
            result = launcher.main()

        self.assertEqual(result, 0)
        statusProd.assert_called_once_with()

    def testMainRoutesDevStopThroughDevRuntime(self) -> None:
        """开发模式 stop 应直接委托给 dev_runtime。"""
        launcher = loadModule('dev_launcher_main_dev_stop', LAUNCHER_PATH)
        args = argparse.Namespace(
            start=False,
            restart=False,
            stop=True,
            status=False,
            verify_images=None,
            test=False,
            kill_ports=None,
            kill_managed_ports=False,
            action=None,
            prod=False,
            tail_logs=False,
            log=False,
            logs=False,
            build=False,
        )

        with (
            mock.patch.object(launcher, 'parseArgs', return_value=args),
            mock.patch.object(launcher.dev_runtime, 'stopDevDependencies') as stopDevDependencies,
            mock.patch.object(launcher.dev_runtime, 'stop', return_value=0) as stopDev,
        ):
            result = launcher.main()

        self.assertEqual(result, 0)
        stopDevDependencies.assert_called_once_with()
        stopDev.assert_called_once_with()

    def testMainRoutesDevStatusThroughDevRuntime(self) -> None:
        """开发模式 status 应直接委托给 dev_runtime。"""
        launcher = loadModule('dev_launcher_main_dev_status', LAUNCHER_PATH)
        args = argparse.Namespace(
            start=False,
            restart=False,
            stop=False,
            status=True,
            verify_images=None,
            test=False,
            kill_ports=None,
            kill_managed_ports=False,
            action=None,
            prod=False,
            tail_logs=False,
            log=False,
            logs=False,
            build=False,
        )

        with (
            mock.patch.object(launcher, 'parseArgs', return_value=args),
            mock.patch.object(launcher.dev_runtime, 'statusDevDependencies') as statusDevDependencies,
            mock.patch.object(launcher.dev_runtime, 'status', return_value=0) as statusDev,
        ):
            result = launcher.main()

        self.assertEqual(result, 0)
        statusDevDependencies.assert_called_once_with()
        statusDev.assert_called_once_with()

    def testMainRoutesDevStartThroughDevRuntime(self) -> None:
        """开发模式 start/restart 应直接委托给 dev_runtime 启动。"""
        launcher = loadModule('dev_launcher_main_dev_start', LAUNCHER_PATH)
        args = argparse.Namespace(
            start=False,
            restart=False,
            stop=False,
            status=False,
            verify_images=None,
            test=False,
            kill_ports=None,
            kill_managed_ports=False,
            action='start',
            prod=False,
            tail_logs=True,
            log=False,
            logs=False,
            build=False,
        )

        with (
            mock.patch.object(launcher, 'parseArgs', return_value=args),
            mock.patch.object(launcher.dev_runtime, '启动开发服务', return_value=0) as startDev,
        ):
            result = launcher.main()

        self.assertEqual(result, 0)
        startDev.assert_called_once_with(allowAutoStop=False, tailLogs=True)


class DevRuntimeTests(unittest.TestCase):
    """开发态编排回归测试。"""

    def testParseEnvFileReadsKeyValues(self) -> None:
        """应能从根目录 env 文件读取键值。"""
        devRuntime = loadPackageModule('tools.scripts.dev_runtime')
        envPath = SCRIPTS_DIR / 'tmp-test.env'
        envPath.write_text(
            '\n'.join(
                [
                    '# comment',
                    'DATABASE_URL=file:./dev.db',
                    'JWT_SECRET=test-secret',
                    '',
                ]
            ),
            encoding='utf-8',
        )
        self.addCleanup(lambda: envPath.unlink(missing_ok=True))

        self.assertEqual(
            devRuntime.parseEnvFile(envPath),
            {
                'DATABASE_URL': 'file:./dev.db',
                'JWT_SECRET': 'test-secret',
            },
        )

    def testLoadProjectEnvLoadsComposeEnvIntoProcess(self) -> None:
        """开发态启动前应把根目录 env 注入当前进程。"""
        devRuntime = loadPackageModule('tools.scripts.dev_runtime')
        envPath = SCRIPTS_DIR / 'tmp-load.env'
        envPath.write_text('DATABASE_URL=file:./dev.db\n', encoding='utf-8')
        self.addCleanup(lambda: envPath.unlink(missing_ok=True))

        original = devRuntime.os.environ.get('DATABASE_URL')
        self.addCleanup(
            lambda: devRuntime.os.environ.__setitem__('DATABASE_URL', original)
            if original is not None
            else devRuntime.os.environ.pop('DATABASE_URL', None)
        )

        with mock.patch.object(devRuntime.docker_runtime, '获取可用env文件', return_value=envPath):
            loaded = devRuntime.loadProjectEnv()

        self.assertEqual(loaded, {'DATABASE_URL': 'file:./dev.db'})
        self.assertEqual(devRuntime.os.environ.get('DATABASE_URL'), 'file:./dev.db')

    def testLoadProjectEnvKeepsExistingProcessEnv(self) -> None:
        """开发态启动前注入的环境变量不应被 `.env` 覆盖。"""
        devRuntime = loadPackageModule('tools.scripts.dev_runtime')
        envPath = SCRIPTS_DIR / 'tmp-load-priority.env'
        envPath.write_text('GARLIC_CLAW_LOGIN_SECRET=file-secret\n', encoding='utf-8')
        self.addCleanup(lambda: envPath.unlink(missing_ok=True))

        original = devRuntime.os.environ.get('GARLIC_CLAW_LOGIN_SECRET')
        self.addCleanup(
            lambda: devRuntime.os.environ.__setitem__('GARLIC_CLAW_LOGIN_SECRET', original)
            if original is not None
            else devRuntime.os.environ.pop('GARLIC_CLAW_LOGIN_SECRET', None)
        )
        devRuntime.os.environ['GARLIC_CLAW_LOGIN_SECRET'] = 'process-secret'

        with mock.patch.object(devRuntime.docker_runtime, '获取可用env文件', return_value=envPath):
            loaded = devRuntime.loadProjectEnv()

        self.assertEqual(loaded, {'GARLIC_CLAW_LOGIN_SECRET': 'file-secret'})
        self.assertEqual(devRuntime.os.environ.get('GARLIC_CLAW_LOGIN_SECRET'), 'process-secret')

    def testCreateDevServicesReturnsThreeManagedProcesses(self) -> None:
        """应暴露三进程开发编排定义。"""
        devRuntime = loadPackageModule('tools.scripts.dev_runtime')
        self.assertTrue(
            hasattr(devRuntime, 'createDevServices'),
            '开发态模块必须暴露 createDevServices() 供回归测试复用',
        )
        services = devRuntime.createDevServices()
        self.assertEqual(set(services.keys()), {'backend_tsc', 'backend_app', 'web'})
        self.assertEqual(
            services['backend_app']['command'],
            ['node', '--watch', 'dist/src/main.js'],
        )
        self.assertEqual(services['backend_app']['port'], 23330)
        self.assertEqual(
            services['web']['command'],
            [
                devRuntime.runtime.resolveNodeBin('vite'),
                '--host',
                '127.0.0.1',
                '--port',
                '23333',
                '--strictPort',
                '--configLoader',
                'native',
            ],
        )
        self.assertEqual(services['web']['port'], 23333)
        self.assertEqual(devRuntime.DEFAULT_PORTS, [23330, 23331, 23333])

    def testCompilerReadyProbeDetectsWatchMarker(self) -> None:
        """后端编译器首轮完成应以 watch 日志进入监听态为准。"""
        devRuntime = loadPackageModule('tools.scripts.dev_runtime')
        logPath = SCRIPTS_DIR / 'tmp-server-tsc.log'
        logPath.write_text(
            '\n'.join(
                [
                    '23:18:50 - Starting compilation in watch mode...',
                    '23:19:04 - Found 0 errors. Watching for file changes.',
                ]
            ),
            encoding='utf-8',
        )
        self.addCleanup(lambda: logPath.unlink(missing_ok=True))

        self.assertTrue(devRuntime.编译日志已进入监听态(logPath))

    def testStartWaitsForCompilerReadyBeforeLaunchingBackendApp(self) -> None:
        """开发态应在首轮 watch 编译完成后再启动后端应用。"""
        devRuntime = loadPackageModule('tools.scripts.dev_runtime')
        startedNames: list[str] = []

        def fakeStartManagedProcess(service: dict[str, object]) -> mock.Mock:
            startedNames.append(str(service['name']))
            return mock.Mock(pid=100 + len(startedNames))

        with (
            mock.patch.object(devRuntime, '读取受管状态', return_value={}),
            mock.patch.object(devRuntime, '确保端口空闲', return_value=True),
            mock.patch.object(devRuntime.runtime, 'ensureRuntimeDirs'),
            mock.patch.object(devRuntime.runtime, 'ensureGitHooksEnabled'),
            mock.patch.object(devRuntime, '执行启动前预检', return_value=True),
            mock.patch.object(devRuntime.docker_runtime, '确保env文件'),
            mock.patch.object(devRuntime, 'loadProjectEnv'),
            mock.patch.object(devRuntime, '确保npm依赖已安装', return_value=True),
            mock.patch.object(devRuntime, '执行构建步骤', return_value=True),
            mock.patch.object(devRuntime, '等待后端编译器首轮完成', return_value=True) as waitCompiler,
            mock.patch.object(devRuntime.runtime, 'startManagedProcess', side_effect=fakeStartManagedProcess),
            mock.patch.object(devRuntime, '保存受管状态'),
            mock.patch.object(devRuntime.runtime, 'waitForPort', return_value=True),
            mock.patch.object(devRuntime.docker_runtime, 'http健康检查', return_value=True),
            mock.patch.object(devRuntime.runtime, 'startSingleLineStatus'),
            mock.patch.object(devRuntime.runtime, 'finishSingleLineStatus'),
        ):
            result = devRuntime.启动开发服务(allowAutoStop=True, tailLogs=False)

        self.assertEqual(result, 0)
        self.assertEqual(
            startedNames,
            ['后端编译器', '前端开发服务器', '后端应用'],
        )
        waitCompiler.assert_called_once_with(
            devRuntime.SERVER_TSC_STDOUT,
            devRuntime.getPortWaitTimeoutSeconds('backend_app'),
        )

    def testCreateBuildStepsMatchesLegacyStartWorkflow(self) -> None:
        """构建步骤应补齐 plugin-sdk 与 Prisma Client，再执行 server 构建。"""
        devRuntime = loadPackageModule('tools.scripts.dev_runtime')
        self.assertTrue(
            hasattr(devRuntime, 'createBuildSteps'),
            '开发态模块必须暴露 createBuildSteps() 供回归测试使用',
        )
        buildSteps = devRuntime.createBuildSteps()
        self.assertEqual(
            [step[0] for step in buildSteps],
            ['构建 shared', '构建 plugin-sdk', '生成 Prisma Client', '同步开发数据库', '构建 server'],
        )

    def testBackendWaitTimeoutExtendsOnNonWindows(self) -> None:
        """非 Windows 环境应给后端应用更长的端口等待时间。"""
        devRuntime = loadPackageModule('tools.scripts.dev_runtime')

        with mock.patch.object(devRuntime.runtime, 'IS_WINDOWS', False):
            self.assertEqual(
                devRuntime.getPortWaitTimeoutSeconds('backend_app'),
                180,
            )
            self.assertEqual(
                devRuntime.getPortWaitTimeoutSeconds('web'),
                60,
            )

    def testBackendWaitTimeoutStaysDefaultOnWindows(self) -> None:
        """Windows 环境应保持现有 60 秒等待策略。"""
        devRuntime = loadPackageModule('tools.scripts.dev_runtime')

        with mock.patch.object(devRuntime.runtime, 'IS_WINDOWS', True):
            self.assertEqual(
                devRuntime.getPortWaitTimeoutSeconds('backend_app'),
                60,
            )

    def testStopServicesPrefersStatePidsBeforePortFallback(self) -> None:
        """应先按状态文件 PID 关闭，再按端口兜底。"""
        devRuntime = loadPackageModule('tools.scripts.dev_runtime')
        self.assertTrue(
            hasattr(devRuntime, 'stopServices'),
            '开发态模块必须暴露 stopServices() 供停止脚本和测试复用',
        )

        kill_events: list[tuple[str, int]] = []

        def fakeKillPid(pid: int, source: str) -> bool:
            kill_events.append((source, pid))
            return True

        def fakeFindPortPids(port: int) -> list[int]:
            if port == 23330:
                return [200]
            if port == 23331:
                return [250]
            if port == 23333:
                return [300]
            return []

        state = {
            'services': {
                'backend_tsc': {'pid': 100},
                'backend_app': {'pid': 200},
            },
        }

        devRuntime.stopServices(
            state=state,
            ports=[23330, 23331, 23333],
            killPid=fakeKillPid,
            findPortPids=fakeFindPortPids,
        )

        self.assertEqual(
            kill_events,
            [
                ('backend_tsc', 100),
                ('backend_app', 200),
                ('port:23331', 250),
                ('port:23333', 300),
            ],
        )

    def testDevRuntimeStopDelegatesToSharedStopLogic(self) -> None:
        """开发态 stop() 应复用统一关闭逻辑。"""
        devRuntime = loadPackageModule('tools.scripts.dev_runtime')
        self.assertTrue(
            hasattr(devRuntime, 'stop'),
            '开发态模块必须暴露 stop() 供回归测试使用',
        )
        state = {'services': {'backend_app': {'pid': 123}}}
        with (
            mock.patch.object(devRuntime.runtime, 'loadState', return_value=state),
            mock.patch.object(devRuntime.runtime, 'head'),
            mock.patch.object(devRuntime.runtime, 'clearStateFiles') as clearStateFiles,
            mock.patch.object(
                devRuntime.runtime,
                'stopServices',
                return_value=[('backend_app', 123)],
            ) as stopServices,
        ):
            result = devRuntime.stop()

        self.assertEqual(result, 0)
        stopServices.assert_called_once_with(
            state=state,
            ports=[23330, 23331, 23333],
        )
        clearStateFiles.assert_called_once_with()


class ProcessRuntimeTests(unittest.TestCase):
    """公共脚本工具回归测试。"""

    def testKillPortsOnlyStopsSpecifiedPorts(self) -> None:
        """按端口清理应只处理传入端口，并对重复 PID 去重。"""
        common = loadModule('process_runtime_kill_ports', COMMON_PATH)
        killEvents: list[tuple[str, int]] = []

        def fakeKillPid(pid: int, source: str) -> bool:
            killEvents.append((source, pid))
            return True

        def fakeFindPortPids(port: int) -> list[int]:
            mapping = {
                23330: [100, 200],
                23331: [200, 300],
            }
            return mapping.get(port, [])

        stopped = common.killPorts(
            [23330, 23331],
            killPid=fakeKillPid,
            findPortPidsFn=fakeFindPortPids,
        )

        self.assertEqual(
            killEvents,
            [
                ('port:23330', 100),
                ('port:23330', 200),
                ('port:23331', 300),
            ],
        )
        self.assertEqual(stopped, killEvents)

    def testStopServicesHonorsExplicitEmptyPortList(self) -> None:
        """统一关闭逻辑在传入空端口列表时不应回退到默认端口。"""
        common = loadModule('process_runtime_stop_services_empty_ports', COMMON_PATH)
        killEvents: list[tuple[str, int]] = []

        def fakeKillPid(pid: int, source: str) -> bool:
            killEvents.append((source, pid))
            return True

        stopped = common.stopServices(
            state={'services': {'backend_app': {'pid': 200}}},
            ports=[],
            killPid=fakeKillPid,
            findPortPidsFn=lambda _port: [999],
        )

        self.assertEqual(killEvents, [('backend_app', 200)])
        self.assertEqual(stopped, [('backend_app', 200)])

    def testWindowsPidProbeTreatsAccessDeniedAsStillRunning(self) -> None:
        """Windows 下 OpenProcess 返回 Access Denied 时应视为进程仍存在。"""
        common = loadModule('process_runtime_access_denied', COMMON_PATH)

        def fakeOpenProcess(_access: int, _inherit: bool, _pid: int) -> int:
            return 0

        self.assertTrue(
            common.isWindowsPidRunning(
                123,
                openProcess=fakeOpenProcess,
                getExitCodeProcess=mock.Mock(),
                closeHandle=mock.Mock(),
                getLastError=lambda: 5,
            ),
        )

    def testWindowsPidProbeUsesExitCodeForRunningProcess(self) -> None:
        """Windows 下应按 GetExitCodeProcess 的 STILL_ACTIVE 判断存活。"""
        common = loadModule('process_runtime_still_active', COMMON_PATH)
        closedHandles: list[int] = []

        def fakeGetExitCodeProcess(handle: int, exitCodePtr: object) -> int:
            assert hasattr(exitCodePtr, '_obj')
            exitCodePtr._obj.value = 259
            return 1

        result = common.isWindowsPidRunning(
            456,
            openProcess=lambda _access, _inherit, _pid: 99,
            getExitCodeProcess=fakeGetExitCodeProcess,
            closeHandle=lambda handle: closedHandles.append(handle),
            getLastError=lambda: 0,
        )

        self.assertTrue(result)
        self.assertEqual(closedHandles, [99])

    def testPosixTerminateFallsBackToPlainKillWhenProcessGroupMissing(self) -> None:
        """类 Unix 平台在 killpg 找不到进程组时仍应回退到 kill(pid)。"""
        common = loadModule('process_runtime_posix_kill_fallback', COMMON_PATH)

        with (
            mock.patch.object(common, 'IS_WINDOWS', False),
            mock.patch.object(common, 'isPidRunning', return_value=True),
            mock.patch.object(common.os, 'killpg', side_effect=ProcessLookupError(), create=True),
            mock.patch.object(common.os, 'kill') as kill,
            mock.patch.object(common, 'ok'),
        ):
            result = common.terminateProcess(789, 'posix-test')

        self.assertTrue(result)
        kill.assert_called_once_with(789, common.signal.SIGTERM)


class DockerRuntimeTests(unittest.TestCase):
    """Docker 运行时模块回归测试。"""

    def testComposeEnvArgsPreferDotEnvThenExample(self) -> None:
        """compose `--env-file` 应优先使用 `.env`，否则回退到 `.env.example`。"""
        launcher = loadModule('dev_launcher_docker_env_args', LAUNCHER_PATH)
        dockerRuntime = launcher.docker_runtime

        with (
            mock.patch.object(dockerRuntime, '获取可用env文件', return_value=Path('D:/repo/.env')),
        ):
            self.assertEqual(
                dockerRuntime.获取composeEnv参数(),
                ['--env-file', '.env'],
            )

        with (
            mock.patch.object(dockerRuntime, '获取可用env文件', return_value=Path('D:/repo/.env.example')),
        ):
            self.assertEqual(
                dockerRuntime.获取composeEnv参数(),
                ['--env-file', '.env.example'],
            )

        with mock.patch.object(dockerRuntime, '获取可用env文件', return_value=None):
            self.assertEqual(dockerRuntime.获取composeEnv参数(), [])

    def testParseDockerComposeImagesOnlyCollectsImageFields(self) -> None:
        """compose 镜像解析应只收集显式 `image:` 字段。"""
        launcher = loadModule('dev_launcher_docker_parse_images', LAUNCHER_PATH)
        dockerRuntime = launcher.docker_runtime
        composePath = Path(__file__).resolve().parent / 'tmp-test-compose.yml'
        composePath.write_text(
            '\n'.join(
                [
                    'services:',
                    '  server:',
                    '    image: nginx:1.27',
                    '  web:',
                    '    build: .',
                    '  worker:',
                    '    image: redis:7',
                    '',
                ]
            ),
            encoding='utf-8',
        )
        self.addCleanup(lambda: composePath.unlink(missing_ok=True))

        images = dockerRuntime.解析DockerCompose镜像(composePath)

        self.assertEqual(images, ['nginx:1.27', 'redis:7'])


if __name__ == '__main__':
    unittest.main()
