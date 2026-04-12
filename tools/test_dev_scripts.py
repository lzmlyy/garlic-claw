"""开发脚本回归测试。

输入:
- 直接加载 `tools/一键启停脚本.py` 模块

输出:
- 校验状态文件位置、开发服务定义和关闭逻辑入口是否符合新的跨平台方案

预期行为:
- 在实现迁移前，这些测试应先红灯，指出脚本能力缺口
- 在实现迁移后，这些测试应稳定通过，防止脚本行为回退
"""

from __future__ import annotations

import importlib.util
import unittest
from unittest import mock
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
LAUNCHER_PATH = TOOLS_DIR / '一键启停脚本.py'
COMMON_PATH = TOOLS_DIR / 'dev_script_common.py'
START_BAT_PATH = TOOLS_DIR / 'start-dev.bat'
STOP_BAT_PATH = TOOLS_DIR / 'stop-dev.bat'


def loadModule(module_name: str, path: Path):
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


class DevLauncherRedTests(unittest.TestCase):
    """启动脚本红灯测试。"""

    def testBatchLaunchersUseCrlfLineEndings(self) -> None:
        """Windows 批处理脚本应使用 CRLF，避免 cmd.exe 子程序解析异常。"""
        for scriptPath in (START_BAT_PATH, STOP_BAT_PATH):
            content = scriptPath.read_bytes()
            self.assertIn(
                b'\r\n',
                content,
                f'{scriptPath.name} 应至少包含 CRLF 行尾',
            )
            normalized = content.replace(b'\r\n', b'')
            self.assertNotIn(
                b'\n',
                normalized,
                f'{scriptPath.name} 不应包含裸 LF 行尾',
            )

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

    def testCreateDevServicesReturnsThreeManagedProcesses(self) -> None:
        """应暴露三进程开发编排定义。"""
        launcher = loadModule('dev_launcher_services', LAUNCHER_PATH)
        self.assertTrue(
            hasattr(launcher, 'createDevServices'),
            '启动脚本必须暴露 createDevServices() 供回归测试复用',
        )
        services = launcher.createDevServices()
        self.assertEqual(set(services.keys()), {'backend_tsc', 'backend_app', 'web'})
        self.assertEqual(
            services['backend_app']['command'],
            ['node', '--watch', 'dist/main.js'],
        )
        self.assertEqual(services['backend_app']['port'], 23330)
        self.assertEqual(
            services['web']['command'],
            [
                launcher.common.resolveNodeBin('vite'),
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
        self.assertEqual(launcher.DEFAULT_PORTS, [23330, 23331, 23333])

    def testCreateBuildStepsMatchesLegacyStartWorkflow(self) -> None:
        """构建步骤应补齐 plugin-sdk 与 Prisma Client，再执行 server 构建。"""
        launcher = loadModule('dev_launcher_build_steps', LAUNCHER_PATH)
        self.assertTrue(
            hasattr(launcher, 'createBuildSteps'),
            '启动脚本必须暴露 createBuildSteps() 供回归测试使用',
        )
        buildSteps = launcher.createBuildSteps()
        self.assertEqual(
            [step[0] for step in buildSteps],
            ['构建 shared', '构建 plugin-sdk', '生成 Prisma Client', '构建 server'],
        )

    def testBackendWaitTimeoutExtendsOnNonWindows(self) -> None:
        """非 Windows 环境应给后端应用更长的端口等待时间。"""
        launcher = loadModule('dev_launcher_wait_timeout_posix', LAUNCHER_PATH)

        with mock.patch.object(launcher.common, 'IS_WINDOWS', False):
            self.assertEqual(
                launcher.getPortWaitTimeoutSeconds('backend_app'),
                180,
            )
            self.assertEqual(
                launcher.getPortWaitTimeoutSeconds('web'),
                60,
            )

    def testBackendWaitTimeoutStaysDefaultOnWindows(self) -> None:
        """Windows 环境应保持现有 60 秒等待策略。"""
        launcher = loadModule('dev_launcher_wait_timeout_windows', LAUNCHER_PATH)

        with mock.patch.object(launcher.common, 'IS_WINDOWS', True):
            self.assertEqual(
                launcher.getPortWaitTimeoutSeconds('backend_app'),
                60,
            )

    def testStopServicesPrefersStatePidsBeforePortFallback(self) -> None:
        """应先按状态文件 PID 关闭，再按端口兜底。"""
        launcher = loadModule('dev_launcher_stop', LAUNCHER_PATH)
        self.assertTrue(
            hasattr(launcher, 'stopServices'),
            '启动脚本必须暴露 stopServices() 供停止脚本和测试复用',
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

        launcher.stopServices(
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

    def testLauncherStopDelegatesToSharedStopLogic(self) -> None:
        """单脚本 stop() 应复用统一关闭逻辑。"""
        launcher = loadModule('dev_launcher_entry_stop', LAUNCHER_PATH)
        self.assertTrue(
            hasattr(launcher, 'stop'),
            '启动脚本必须暴露 stop() 供单脚本模式回归测试使用',
        )
        state = {'services': {'backend_app': {'pid': 123}}}
        with (
            mock.patch.object(launcher.common, 'loadState', return_value=state),
            mock.patch.object(launcher.common, 'head'),
            mock.patch.object(launcher.common, 'clearStateFiles') as clearStateFiles,
            mock.patch.object(
                launcher.common,
                'stopServices',
                return_value=[('backend_app', 123)],
            ) as stopServices,
        ):
            result = launcher.stop()

        self.assertEqual(result, 0)
        stopServices.assert_called_once_with(
            state=state,
            ports=[23330, 23331, 23333],
        )
        clearStateFiles.assert_called_once_with()


class DevScriptCommonTests(unittest.TestCase):
    """公共脚本工具回归测试。"""

    def testWindowsPidProbeTreatsAccessDeniedAsStillRunning(self) -> None:
        """Windows 下 OpenProcess 返回 Access Denied 时应视为进程仍存在。"""
        common = loadModule('dev_script_common_access_denied', COMMON_PATH)

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
        common = loadModule('dev_script_common_still_active', COMMON_PATH)
        closedHandles: list[int] = []

        def fakeGetExitCodeProcess(handle: int, exitCodePtr) -> int:
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
        common = loadModule('dev_script_common_posix_kill_fallback', COMMON_PATH)

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


if __name__ == '__main__':
    unittest.main()
