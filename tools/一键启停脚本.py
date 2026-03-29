"""Garlic Claw 开发环境一键启停脚本。

输入:
- `--build`: 仅执行构建
- `--no-build`: 跳过构建直接启动
- `--status`: 查看当前受管服务状态
- `--stop`: 停止当前受管服务
- `--web`: 兼容旧参数；当前开发模式默认也会启动 web

输出:
- 构建 shared / Prisma Client / server
- 启动后端编译 watch、后端应用、前端 Vite dev server
- 将状态写入 `other/dev-processes.json`
- 将日志写入 `other/logs/`

预期行为:
- 保留原 Python 脚本的 CLI 能力
- 迁移 `other/start-dev.bat` 的开发编排行为
- 启动失败时回滚已拉起进程，不做“杀所有 node 进程”
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import dev_script_common as common


ROOT = common.ROOT
SERVER_DIR = common.SERVER_DIR
WEB_DIR = common.WEB_DIR
LOG_DIR = common.LOG_DIR
STATE_FILE = common.STATE_FILE
LEGACY_STATE_FILE = common.LEGACY_STATE_FILE
SERVER_PORT = common.SERVER_PORT
WEB_PORT = common.WEB_PORT
DEFAULT_PORTS = list(common.DEFAULT_PORTS)


def ensureGitHooksEnabled() -> None:
    """尽力启用 git hooks，但不阻塞开发脚本。

    输入:
    - 无

    输出:
    - 当仓库存在 `.githooks` 时，尝试设置 `core.hooksPath`

    预期行为:
    - 仅作非阻塞优化，失败时打印警告并继续
    """
    hooksDir = ROOT / '.githooks'
    if not hooksDir.exists():
        return

    result = subprocess.run(
        ['git', 'config', 'core.hooksPath'],
        capture_output=True,
        text=True,
        cwd=ROOT,
        check=False,
    )
    if result.returncode == 0 and result.stdout.strip() == '.githooks':
        return

    setResult = subprocess.run(
        ['git', 'config', 'core.hooksPath', '.githooks'],
        capture_output=True,
        text=True,
        cwd=ROOT,
        check=False,
    )
    if setResult.returncode != 0:
        common.warn('启用 git hooks 失败，继续启动开发环境')
        return

    if os.name != 'nt':
        for hookFile in hooksDir.iterdir():
            if hookFile.is_file():
                subprocess.run(
                    ['chmod', '+x', str(hookFile)],
                    cwd=ROOT,
                    check=False,
                )


def runStep(
    label: str,
    command: list[str],
    cwd: Path,
    retries: int = 0,
    delaySeconds: float = 1.0,
) -> bool:
    """执行一个构建步骤。

    输入:
    - label: 步骤展示名称
    - command: 待执行命令
    - cwd: 工作目录
    - retries: 失败重试次数
    - delaySeconds: 两次重试之间的等待秒数

    输出:
    - `True` 表示步骤成功；`False` 表示最终失败

    预期行为:
    - 对可恢复步骤提供有限重试，便于本地开发使用
    """
    attempt = 0
    while True:
        common.info(f'{label} ...')
        result = subprocess.run(
            common.normalizeCommand(command),
            cwd=cwd,
            check=False,
        )
        if result.returncode == 0:
            common.ok(f'{label} 完成')
            return True
        if attempt >= retries:
            common.err(f'{label} 失败（退出码 {result.returncode}）')
            return False
        attempt += 1
        time.sleep(delaySeconds)


def build() -> bool:
    """执行开发环境启动前的构建。

    输入:
    - 无

    输出:
    - shared、Prisma Client、server 构建结果

    预期行为:
    - 任何一步失败都中止后续启动
    """
    common.head('构建')
    for step in createBuildSteps():
        if not runStep(*step):
            return False
    return True


def createBuildSteps() -> list[tuple[str, list[str], Path, int, float]]:
    """创建开发脚本使用的构建步骤。

    输入:
    - 无

    输出:
    - 需要顺序执行的构建步骤列表

    预期行为:
    - 与旧 `start-dev.bat` 对齐，只保留 shared/server 引导构建
    """
    return [
        ('构建 shared', ['npm', 'run', 'build:shared'], ROOT, 0, 1.0),
        ('构建 server', ['npm', 'run', 'build:server'], ROOT, 0, 1.0),
    ]


def createDevServices() -> dict[str, dict[str, Any]]:
    """创建受管开发服务定义。

    输入:
    - 无

    输出:
    - 三个受管服务的描述字典

    预期行为:
    - 与旧 `start-dev.bat` 对齐：后端编译器、后端 app、前端 Vite
    """
    return {
        'backend_tsc': {
            'label': 'Backend Compiler Watcher',
            'command': [
                common.resolveNodeBin('tsc'),
                '-p',
                'tsconfig.build.json',
                '--watch',
                '--preserveWatchOutput',
            ],
            'cwd': SERVER_DIR,
            'stdoutPath': LOG_DIR / 'server-tsc.log',
            'stderrPath': LOG_DIR / 'server-tsc.err.log',
            'port': None,
        },
        'backend_app': {
            'label': 'Backend App',
            'command': ['node', '--watch', 'dist/main.js'],
            'cwd': SERVER_DIR,
            'stdoutPath': LOG_DIR / 'server-app.log',
            'stderrPath': LOG_DIR / 'server-app.err.log',
            'port': SERVER_PORT,
        },
        'web': {
            'label': 'Web Vite Dev Server',
            'command': [
                common.resolveNodeBin('vite'),
                '--host',
                '127.0.0.1',
                '--port',
                str(WEB_PORT),
                '--strictPort',
            ],
            'cwd': WEB_DIR,
            'stdoutPath': LOG_DIR / 'web-vite.log',
            'stderrPath': LOG_DIR / 'web-vite.err.log',
            'port': WEB_PORT,
        },
    }


def stopServices(
    state: dict[str, Any],
    ports: list[int] | None = None,
    killPid=None,
    findPortPids=None,
) -> list[tuple[str, int]]:
    """复用公共关闭逻辑。

    输入:
    - state: 受管服务状态
    - ports: 需要兜底清理的端口
    - killPid: 测试注入用 PID 关闭函数
    - findPortPids: 测试注入用端口 PID 查询函数

    输出:
    - 实际尝试关闭的 `(source, pid)` 记录

    预期行为:
    - 为独立关闭脚本和测试复用同一套逻辑
    """
    kwargs: dict[str, Any] = {
        'state': state,
        'ports': ports or list(DEFAULT_PORTS),
    }
    if killPid is not None:
        kwargs['killPid'] = killPid
    if findPortPids is not None:
        kwargs['findPortPidsFn'] = findPortPids
    return common.stopServices(**kwargs)


def ensureNoRunningManagedState(state: dict[str, Any]) -> bool:
    """确保不存在仍然存活的旧受管进程。

    输入:
    - state: 当前读取到的状态文件内容

    输出:
    - `True` 表示安全；`False` 表示仍有旧进程存活

    预期行为:
    - 启动前拒绝覆盖仍在运行的旧会话
    - 若状态文件已 stale，则自动清理
    """
    services = state.get('services', {})
    aliveNames = [
        serviceName
        for serviceName, service in services.items()
        if common.isPidRunning(int(service.get('pid', 0) or 0))
    ]
    if aliveNames:
        common.err(
            '检测到上次开发会话仍在运行。'
            '请先运行 `python tools/一键启停脚本.py --stop`。',
        )
        return False

    common.clearStateFiles()
    return True


def assertPortsFree(ports: list[int]) -> bool:
    """确保关键端口当前空闲。

    输入:
    - ports: 需要检查的端口列表

    输出:
    - `True` 表示端口全部空闲；`False` 表示有冲突

    预期行为:
    - 在启动前提前发现冲突，而不是在半途中失败
    """
    for port in ports:
        if common.isPortListening(port):
            common.err(f'端口 {port} 已被占用，请先关闭占用进程后再启动')
            return False
    return True


def start() -> int:
    """启动受管开发服务。

    输入:
    - 无

    输出:
    - 进程退出码

    预期行为:
    - 启动三个后台进程
    - 等待端口就绪后再写状态文件
    - 任一步失败时自动回滚
    """
    ensureGitHooksEnabled()
    common.ensureRuntimeDirs()

    state = common.loadState()
    if not ensureNoRunningManagedState(state):
        return 1
    if not assertPortsFree(DEFAULT_PORTS):
        return 1

    common.head('启动服务')
    services = createDevServices()
    startedState: dict[str, Any] = {
        'services': {},
        'startedAt': time.strftime('%Y-%m-%d %H:%M:%S'),
    }

    try:
        for serviceName in common.DEFAULT_SERVICE_ORDER:
            service = services[serviceName]
            common.info(f'启动 {service["label"]} ...')
            process = common.startManagedProcess(service)
            time.sleep(1)
            if process.poll() is not None:
                common.err(f'{service["label"]} 启动后立即退出（退出码 {process.returncode}）')
                raise RuntimeError(serviceName)
            startedState['services'][serviceName] = {
                'pid': process.pid,
                'port': service['port'],
                'label': service['label'],
                'stdoutPath': str(service['stdoutPath']),
                'stderrPath': str(service['stderrPath']),
            }
            common.ok(f'{service["label"]} -> PID {process.pid}')

        for serviceName in ('backend_app', 'web'):
            port = int(services[serviceName]['port'])
            common.info(f'等待 {serviceName} 打开端口 {port} ...')
            if not common.waitForPort(port, timeoutSeconds=60):
                common.err(f'{serviceName} 未在 60 秒内打开端口 {port}')
                raise RuntimeError(serviceName)

        common.saveState(startedState)
        print()
        common.info('Backend:  http://127.0.0.1:23330')
        common.info('Frontend: http://127.0.0.1:23333')
        common.info(f'状态文件: {STATE_FILE}')
        common.info(f'日志目录: {LOG_DIR}')
        return 0
    except RuntimeError:
        common.warn('启动失败，正在回滚已拉起的受管进程')
        stopServices(startedState)
        common.clearStateFiles()
        return 1


def stop() -> int:
    """停止当前受管开发服务。

    输入:
    - 无

    输出:
    - 进程退出码

    预期行为:
    - 优先按状态文件关闭
    - 再按端口兜底清理
    """
    common.head('停止服务')
    state = common.loadState()
    if not state:
        common.warn('没有找到受管状态文件，将只按端口做兜底清理')
    stopped = stopServices(state=state)
    common.clearStateFiles()
    if not stopped:
        common.warn('没有发现需要关闭的受管服务')
    return 0


def status() -> int:
    """输出当前受管服务状态。

    输入:
    - 无

    输出:
    - 当前状态打印到终端

    预期行为:
    - 展示受管 PID 是否仍在运行
    - 若无状态文件则给出明确提示
    """
    common.head('服务状态')
    state = common.loadState()
    if not state:
        common.warn('没有已记录的受管服务')
        return 0

    services = state.get('services', {})
    if not services:
        common.warn('状态文件为空')
        return 0

    for serviceName in common.DEFAULT_SERVICE_ORDER:
        if serviceName not in services:
            continue
        service = services[serviceName]
        pid = int(service.get('pid', 0) or 0)
        label = str(service.get('label') or serviceName)
        if common.isPidRunning(pid):
            common.ok(f'{label} -> 运行中 (PID {pid})')
        else:
            common.err(f'{label} -> 已停止 (PID {pid})')
    return 0


def main() -> int:
    """脚本入口。"""
    parser = argparse.ArgumentParser(
        description='Garlic Claw 开发环境启动脚本',
    )
    parser.add_argument('--stop', action='store_true', help='停止所有受管服务')
    parser.add_argument('--status', action='store_true', help='查看当前受管服务状态')
    parser.add_argument('--build', action='store_true', help='仅执行构建')
    parser.add_argument('--no-build', action='store_true', help='跳过构建直接启动')
    parser.add_argument(
        '--web',
        action='store_true',
        help='兼容旧参数；当前开发模式默认也会启动 web',
    )
    args = parser.parse_args()

    if args.stop:
        return stop()
    if args.status:
        return status()
    if args.build:
        return 0 if build() else 1
    if not args.no_build and not build():
        return 1
    return start()


if __name__ == '__main__':
    raise SystemExit(main())
