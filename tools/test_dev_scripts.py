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
        self.assertEqual(services['backend_app']['port'], 23330)
        self.assertEqual(services['web']['port'], 23333)

    def testCreateBuildStepsMatchesLegacyStartWorkflow(self) -> None:
        """构建步骤应对齐旧 start-dev.bat，仅保留 shared/server 引导构建。"""
        launcher = loadModule('dev_launcher_build_steps', LAUNCHER_PATH)
        self.assertTrue(
            hasattr(launcher, 'createBuildSteps'),
            '启动脚本必须暴露 createBuildSteps() 供回归测试使用',
        )
        buildSteps = launcher.createBuildSteps()
        self.assertEqual(
            [step[0] for step in buildSteps],
            ['构建 shared', '构建 server'],
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
            ports=[23330, 23333],
            killPid=fakeKillPid,
            findPortPids=fakeFindPortPids,
        )

        self.assertEqual(
            kill_events,
            [('backend_tsc', 100), ('backend_app', 200), ('port:23333', 300)],
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
            ports=[23330, 23333],
        )
        clearStateFiles.assert_called_once_with()


if __name__ == '__main__':
    unittest.main()
