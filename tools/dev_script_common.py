"""开发脚本公共能力。

输入:
- 仓库根目录下的 `other/`、`packages/server`、`packages/web`
- 受管进程状态文件与日志目录

输出:
- 跨平台可复用的状态读写、端口探测、进程关闭与日志路径工具

预期行为:
- 为统一启停脚本提供跨平台底层能力
- 优先关闭状态文件记录的 PID，再按端口兜底
- 不使用“杀所有 node 进程”的危险策略
"""

from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parent.parent
OTHER_DIR = ROOT / 'other'
LOG_DIR = OTHER_DIR / 'logs'
STATE_FILE = OTHER_DIR / 'dev-processes.json'
LEGACY_STATE_FILE = OTHER_DIR / 'dev-processes.env'
SERVER_DIR = ROOT / 'packages' / 'server'
WEB_DIR = ROOT / 'packages' / 'web'

SERVER_PORT = 23330
WEB_PORT = 23333
DEFAULT_PORTS = [SERVER_PORT, WEB_PORT]
IS_WINDOWS = os.name == 'nt'

LEGACY_PID_MAP = {
    'BACKEND_TSC_PID': 'backend_tsc',
    'BACKEND_APP_PID': 'backend_app',
    'WEB_PID': 'web',
}

DEFAULT_SERVICE_ORDER = ['backend_tsc', 'backend_app', 'web']


def styleText(code: str, text: str) -> str:
    """为终端文本添加 ANSI 样式。

    输入:
    - code: ANSI 颜色/样式代码
    - text: 原始文本

    输出:
    - 终端可显示的样式文本

    预期行为:
    - 在不支持 ANSI 的终端直接返回原文
    """
    if IS_WINDOWS and 'ANSICON' not in os.environ and 'WT_SESSION' not in os.environ:
        return text
    return f'\033[{code}m{text}\033[0m'


def ok(message: str) -> None:
    """输出成功日志。"""
    print(styleText('32', f'[OK] {message}'))


def info(message: str) -> None:
    """输出信息日志。"""
    print(styleText('36', f'[INFO] {message}'))


def warn(message: str) -> None:
    """输出警告日志。"""
    print(styleText('33', f'[WARN] {message}'))


def err(message: str) -> None:
    """输出错误日志。"""
    print(styleText('31', f'[ERR] {message}'), file=sys.stderr)


def head(message: str) -> None:
    """输出标题。"""
    line = '-' * 50
    print(styleText('1;35', f'\n{line}\n  {message}\n{line}'))


def ensureRuntimeDirs() -> None:
    """确保运行时目录存在。

    输入:
    - 无

    输出:
    - 创建 `other/` 与 `other/logs/`

    预期行为:
    - 启停脚本在首次运行时也能正常写状态文件和日志
    """
    OTHER_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)


def parseLegacyState(legacyStateFile: Path = LEGACY_STATE_FILE) -> dict[str, Any]:
    """读取旧版 env 状态文件。

    输入:
    - legacyStateFile: 旧批处理写出的状态文件路径

    输出:
    - 统一后的 JSON 风格状态字典

    预期行为:
    - 允许新的关闭脚本处理旧 `.bat` 遗留的状态文件
    """
    if not legacyStateFile.exists():
        return {}

    services: dict[str, dict[str, int]] = {}
    for raw_line in legacyStateFile.read_text(encoding='utf-8', errors='ignore').splitlines():
        line = raw_line.strip()
        if not line or '=' not in line:
            continue

        key, value = line.split('=', 1)
        serviceName = LEGACY_PID_MAP.get(key.strip())
        if serviceName is None:
            continue
        if not value.strip().isdigit():
            continue
        services[serviceName] = {'pid': int(value.strip())}

    if not services:
        return {}

    return {
        'services': services,
        'source': 'legacy-env',
    }


def loadState(
    stateFile: Path = STATE_FILE,
    legacyStateFile: Path = LEGACY_STATE_FILE,
) -> dict[str, Any]:
    """读取当前受管进程状态。

    输入:
    - stateFile: 新版 JSON 状态文件
    - legacyStateFile: 旧版 env 状态文件

    输出:
    - 统一的状态字典；若不存在则返回空字典

    预期行为:
    - 优先读取新版 JSON
    - 若新版不存在，则尝试兼容旧 `.env`
    """
    if stateFile.exists():
        try:
            return json.loads(stateFile.read_text(encoding='utf-8'))
        except json.JSONDecodeError:
            warn(f'状态文件损坏，忽略: {stateFile}')
            return {}

    return parseLegacyState(legacyStateFile)


def saveState(
    state: dict[str, Any],
    stateFile: Path = STATE_FILE,
    legacyStateFile: Path = LEGACY_STATE_FILE,
) -> None:
    """保存当前受管进程状态。

    输入:
    - state: 待写入的状态字典
    - stateFile: 新版 JSON 状态文件路径
    - legacyStateFile: 旧版状态文件路径

    输出:
    - 写入 JSON 状态文件

    预期行为:
    - 新状态落盘后会移除旧 `.env` 状态文件，避免双写漂移
    """
    ensureRuntimeDirs()
    stateFile.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    legacyStateFile.unlink(missing_ok=True)


def clearStateFiles(
    stateFile: Path = STATE_FILE,
    legacyStateFile: Path = LEGACY_STATE_FILE,
) -> None:
    """清理新旧状态文件。"""
    stateFile.unlink(missing_ok=True)
    legacyStateFile.unlink(missing_ok=True)


def isPidRunning(pid: int) -> bool:
    """判断 PID 是否仍在运行。

    输入:
    - pid: 进程号

    输出:
    - `True` 表示进程仍存在；`False` 表示已退出

    预期行为:
    - 在 Windows 和类 Unix 平台上都能安全判断进程是否存活
    """
    if pid <= 0:
        return False

    try:
        if IS_WINDOWS:
            result = subprocess.run(
                ['tasklist', '/FI', f'PID eq {pid}', '/NH'],
                capture_output=True,
                text=True,
                check=False,
            )
            output = result.stdout.strip()
            return bool(output) and 'No tasks are running' not in output and 'INFO:' not in output

        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError, OSError):
        return False


def isPortListening(port: int, host: str = '127.0.0.1', timeout: float = 0.5) -> bool:
    """检查本地端口是否已有监听。

    输入:
    - port: 目标端口
    - host: 默认检查 `127.0.0.1`
    - timeout: 单次探测超时

    输出:
    - `True` 表示端口已可连接

    预期行为:
    - 用轻量 socket 连接探测开发服务是否已就绪
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(timeout)
        return probe.connect_ex((host, port)) == 0


def waitForPort(port: int, timeoutSeconds: int, host: str = '127.0.0.1') -> bool:
    """等待端口在超时时间内变为可连接。"""
    deadline = time.time() + timeoutSeconds
    while time.time() < deadline:
        if isPortListening(port, host=host):
            return True
        time.sleep(1)
    return False


def normalizeCommand(command: list[str]) -> list[str]:
    """标准化跨平台命令名。

    输入:
    - command: 原始命令数组

    输出:
    - Windows 下自动补 `.cmd` 的命令数组

    预期行为:
    - 让 `npm` / `npx` 在 Windows 下可直接执行
    """
    if not command:
        return command
    if IS_WINDOWS and command[0] in {'npm', 'npx'}:
        return [f'{command[0]}.cmd', *command[1:]]
    return command


def resolveNodeBin(binName: str) -> str:
    """解析仓库内 node_modules 可执行文件路径。

    输入:
    - binName: 可执行名，例如 `tsc` / `vite`

    输出:
    - 本地 `.bin` 的绝对路径；若不存在则退回裸命令

    预期行为:
    - 优先使用仓库锁定版本，减少环境差异
    """
    suffix = '.cmd' if IS_WINDOWS else ''
    candidate = ROOT / 'node_modules' / '.bin' / f'{binName}{suffix}'
    if candidate.exists():
        return str(candidate)
    return f'{binName}{suffix}' if IS_WINDOWS else binName


def truncateLogFile(logPath: Path) -> None:
    """清空日志文件内容。

    输入:
    - logPath: 日志文件路径

    输出:
    - 以空内容覆盖原日志文件

    预期行为:
    - 每次启动都从新日志开始，避免混入旧输出
    """
    logPath.parent.mkdir(parents=True, exist_ok=True)
    logPath.write_text('', encoding='utf-8')


def startManagedProcess(service: dict[str, Any]) -> subprocess.Popen[str]:
    """启动受管后台进程。

    输入:
    - service: 包含命令、工作目录与日志路径的服务描述

    输出:
    - 已启动的 `Popen` 对象

    预期行为:
    - 标准输出与错误输出分别写入日志文件
    - 启动脚本退出后子进程仍可继续运行
    """
    stdoutPath = Path(service['stdoutPath'])
    stderrPath = Path(service['stderrPath'])
    truncateLogFile(stdoutPath)
    truncateLogFile(stderrPath)

    stdoutHandle = stdoutPath.open('w', encoding='utf-8')
    stderrHandle = stderrPath.open('w', encoding='utf-8')

    popenArgs: dict[str, Any] = {
        'cwd': str(service['cwd']),
        'stdout': stdoutHandle,
        'stderr': stderrHandle,
        'stdin': subprocess.DEVNULL,
        'text': True,
    }
    if IS_WINDOWS:
        popenArgs['creationflags'] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        popenArgs['start_new_session'] = True

    try:
        process = subprocess.Popen(
            normalizeCommand(list(service['command'])),
            **popenArgs,
        )
    finally:
        stdoutHandle.close()
        stderrHandle.close()

    return process


def terminateProcess(pid: int, source: str) -> bool:
    """关闭指定进程。

    输入:
    - pid: 待关闭 PID
    - source: 日志中使用的来源标识

    输出:
    - `True` 表示已尝试关闭；`False` 表示 PID 无效或不存在

    预期行为:
    - Windows 下使用 `taskkill /T /F`
    - 类 Unix 平台优先关闭进程组，尽量清理受管子进程
    """
    if pid <= 0:
        return False
    if not isPidRunning(pid):
        return False

    try:
        if IS_WINDOWS:
            subprocess.run(
                ['taskkill', '/PID', str(pid), '/T', '/F'],
                capture_output=True,
                text=True,
                check=False,
            )
        else:
            try:
                os.killpg(pid, signal.SIGTERM)
            except ProcessLookupError:
                return False
            except OSError:
                os.kill(pid, signal.SIGTERM)
        ok(f'已关闭 {source} (PID {pid})')
        return True
    except OSError as exception:
        warn(f'关闭 {source} (PID {pid}) 失败: {exception}')
        return False


def findPortPids(port: int) -> list[int]:
    """查找监听指定端口的 PID 列表。

    输入:
    - port: 目标端口

    输出:
    - 监听该端口的 PID 列表

    预期行为:
    - 尽量使用系统原生命令解析监听 PID
    - 未找到时返回空列表，不抛出异常
    """
    if IS_WINDOWS:
        result = subprocess.run(
            ['netstat', '-ano', '-p', 'tcp'],
            capture_output=True,
            text=True,
            check=False,
        )
        pids: set[int] = set()
        for line in result.stdout.splitlines():
            if f':{port}' not in line or 'LISTENING' not in line:
                continue
            parts = line.split()
            if parts and parts[-1].isdigit():
                pids.add(int(parts[-1]))
        return sorted(pids)

    commands = [
        ['lsof', '-nP', f'-iTCP:{port}', '-sTCP:LISTEN', '-t'],
        ['ss', '-ltnp'],
        ['netstat', '-lpn'],
    ]

    for command in commands:
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
            )
        except FileNotFoundError:
            continue

        pids = parsePortPidOutput(command[0], result.stdout, port)
        if pids:
            return pids

    return []


def parsePortPidOutput(commandName: str, output: str, port: int) -> list[int]:
    """解析端口查询命令输出中的 PID。"""
    pids: set[int] = set()

    if commandName == 'lsof':
        for line in output.splitlines():
            text = line.strip()
            if text.isdigit():
                pids.add(int(text))
        return sorted(pids)

    for line in output.splitlines():
        if f':{port}' not in line:
            continue
        if commandName == 'ss':
            marker = 'pid='
            if marker not in line:
                continue
            tail = line.split(marker, 1)[1]
            digits = ''.join(character for character in tail if character.isdigit())
            if digits:
                pids.add(int(digits))
        elif commandName == 'netstat':
            parts = line.split()
            if parts and '/' in parts[-1]:
                pidText = parts[-1].split('/', 1)[0]
                if pidText.isdigit():
                    pids.add(int(pidText))
    return sorted(pids)


def stopServices(
    state: dict[str, Any],
    ports: list[int] | None = None,
    killPid: Callable[[int, str], bool] | None = None,
    findPortPidsFn: Callable[[int], list[int]] | None = None,
) -> list[tuple[str, int]]:
    """停止受管服务并按端口兜底。

    输入:
    - state: 受管进程状态字典
    - ports: 需要兜底清理的端口列表
    - killPid: 可注入的 PID 关闭函数，便于测试
    - findPortPidsFn: 可注入的端口查询函数，便于测试

    输出:
    - 实际尝试关闭的 `(source, pid)` 列表

    预期行为:
    - 先处理状态文件中记录的受管 PID
    - 再处理端口监听 PID
    - 对已经处理过的 PID 去重，避免重复关闭
    """
    killPid = killPid or terminateProcess
    findPortPidsFn = findPortPidsFn or findPortPids
    ports = ports or list(DEFAULT_PORTS)

    services = state.get('services', {})
    stopped: list[tuple[str, int]] = []
    seenPids: set[int] = set()

    orderedNames = [name for name in DEFAULT_SERVICE_ORDER if name in services]
    orderedNames.extend(name for name in services.keys() if name not in orderedNames)

    for serviceName in orderedNames:
        service = services.get(serviceName, {})
        pid = int(service.get('pid', 0) or 0)
        if pid <= 0 or pid in seenPids:
            continue
        if killPid(pid, serviceName):
            seenPids.add(pid)
            stopped.append((serviceName, pid))

    for port in ports:
        for pid in findPortPidsFn(port):
            if pid <= 0 or pid in seenPids:
                continue
            source = f'port:{port}'
            if killPid(pid, source):
                seenPids.add(pid)
                stopped.append((source, pid))

    return stopped
