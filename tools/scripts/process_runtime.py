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

import ctypes
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from collections.abc import Callable, Iterable
from io import TextIOBase
from pathlib import Path
from typing import Any, cast

ROOT = Path(__file__).resolve().parent.parent.parent
OTHER_DIR = ROOT / 'other'
LOG_DIR = OTHER_DIR / 'logs'
STATE_FILE = OTHER_DIR / 'dev-processes.json'
LEGACY_STATE_FILE = OTHER_DIR / 'dev-processes.env'
SERVER_DIR = ROOT / 'packages' / 'server'
WEB_DIR = ROOT / 'packages' / 'web'

SERVER_PORT = 23330
PLUGIN_WS_PORT = 23331
WEB_PORT = 23333
DEFAULT_PORTS = [SERVER_PORT, PLUGIN_WS_PORT, WEB_PORT]
IS_WINDOWS = os.name == 'nt'

LEGACY_PID_MAP = {
    'BACKEND_TSC_PID': 'backend_tsc',
    'BACKEND_APP_PID': 'backend_app',
    'WEB_PID': 'web',
}

DEFAULT_SERVICE_ORDER = ['backend_tsc', 'backend_app', 'web']
ANSI_ESCAPE_RE = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')


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


def supportsInteractiveStatus() -> bool:
    """判断当前终端是否适合展示单行状态。"""
    return sys.stdout.isatty()


def formatStatusLine(
    symbol: str,
    message: str,
    *,
    colorCode: str,
    width: int,
    result: str = '',
) -> str:
    """格式化单行状态输出。"""
    body = message.ljust(width)
    if result:
        body = f'{body} {result}'
    return f' {styleText(colorCode, symbol)} {body}'


def startSingleLineStatus(message: str, *, width: int) -> None:
    """开始输出单行状态。"""
    line = formatStatusLine('-', message, colorCode='33', width=width)
    if supportsInteractiveStatus():
        print(line, end='\r', flush=True)
        return
    print(line)


def finishSingleLineStatus(
    message: str,
    *,
    width: int,
    result: str,
    success: bool = True,
) -> None:
    """结束单行状态输出。"""
    symbol = 'OK' if success else 'XX'
    colorCode = '32' if success else '31'
    line = formatStatusLine(
        symbol,
        message,
        colorCode=colorCode,
        width=width,
        result=result,
    )
    if supportsInteractiveStatus():
        print(f'\r\033[2K{line}', flush=True)
        return
    print(line)


def commandExists(name: str) -> bool:
    """判断命令是否存在于 PATH。"""
    return shutil.which(name) is not None


def findFirstCommand(names: list[str]) -> str | None:
    """返回首个可用命令路径。"""
    for name in names:
        path = shutil.which(name)
        if path:
            return path
    return None


def ensureGitHooksEnabled() -> bool:
    """确保当前仓库启用 .githooks。"""
    gitHooksDir = ROOT / '.githooks'
    if not gitHooksDir.exists():
        return False

    gitCommand = findFirstCommand(['git.exe', 'git'])
    if gitCommand is None:
        warn('未找到 git，跳过启用 .githooks。')
        return False

    result = subprocess.run(
        [gitCommand, 'config', '--local', 'core.hooksPath'],
        capture_output=True,
        text=True,
        cwd=ROOT,
        check=False,
    )
    currentPath = result.stdout.strip() if result.returncode == 0 else ''
    if currentPath == '.githooks':
        return False

    updateResult = subprocess.run(
        [gitCommand, 'config', '--local', 'core.hooksPath', '.githooks'],
        cwd=ROOT,
        check=False,
    )
    if updateResult.returncode != 0:
        warn('设置 core.hooksPath 为 .githooks 失败。')
        return False

    if not IS_WINDOWS:
        for hookFile in gitHooksDir.iterdir():
            if hookFile.is_file():
                subprocess.run(
                    ['chmod', '+x', str(hookFile)],
                    cwd=ROOT,
                    check=False,
                )

    info('已启用当前仓库 .githooks。')
    return True


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
            payload = json.loads(stateFile.read_text(encoding='utf-8'))
            if isinstance(payload, dict):
                return cast(dict[str, Any], payload)
            warn(f'状态文件格式异常，忽略: {stateFile}')
            return {}
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
            return isWindowsPidRunning(pid)

        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False


def isWindowsPidRunning(
    pid: int,
    *,
    openProcess: Callable[[int, bool, int], int] | None = None,
    getExitCodeProcess: Callable[[int, Any], int] | None = None,
    closeHandle: Callable[[int], Any] | None = None,
    getLastError: Callable[[], int] | None = None,
) -> bool:
    """使用 Win32 API 判断 PID 是否仍在运行。

    输入:
    - pid: 进程号
    - openProcess/getExitCodeProcess/closeHandle/getLastError:
      可选注入，用于测试

    输出:
    - `True` 表示 PID 仍存在；`False` 表示不存在

    预期行为:
    - 避免依赖 `tasklist /FI`，因为该命令在部分 Windows 环境下会直接返回
      `Access denied`，从而把活进程误判成已停止
    """
    if pid <= 0:
        return False

    processQueryLimitedInformation = 0x1000
    synchronize = 0x00100000
    stillActive = 259
    errorAccessDenied = 5

    if openProcess is None or getExitCodeProcess is None or closeHandle is None:
        kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
        openProcess = kernel32.OpenProcess
        getExitCodeProcess = kernel32.GetExitCodeProcess
        closeHandle = kernel32.CloseHandle

    if getLastError is None:
        getLastError = ctypes.get_last_error

    handle = openProcess(
        processQueryLimitedInformation | synchronize,
        False,
        pid,
    )
    if not handle:
        return getLastError() == errorAccessDenied

    try:
        exitCode = ctypes.c_ulong()
        if not getExitCodeProcess(handle, ctypes.byref(exitCode)):
            return getLastError() == errorAccessDenied
        return exitCode.value == stillActive
    finally:
        closeHandle(handle)


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


def quoteCommandArgument(value: str) -> str:
    """为 PowerShell 命令参数做最小转义。"""
    return "'" + value.replace("'", "''") + "'"


def relayLogOutput(prefix: str, line: str) -> None:
    """带前缀输出 relay 日志。"""
    header = f'[{prefix}] ' if prefix else ''
    try:
        sys.stdout.write(f'{header}{line}')
        sys.stdout.flush()
    except UnicodeEncodeError:
        safe = f'{header}{line}'.encode(
            sys.stdout.encoding or 'utf-8',
            errors='replace',
        ).decode(sys.stdout.encoding or 'utf-8')
        sys.stdout.write(safe)
        sys.stdout.flush()


def relayProcessOutput(
    service: dict[str, Any],
    *,
    mergeStreams: bool,
) -> int:
    """以前台 relay 方式运行服务并同步落盘日志。"""
    stdoutPath = Path(service['stdoutPath'])
    stderrPath = Path(service['stderrPath'])
    truncateLogFile(stdoutPath)
    truncateLogFile(stderrPath)

    popenArgs: dict[str, Any] = {
        'cwd': str(service['cwd']),
        'stdin': subprocess.DEVNULL,
        'text': True,
        'encoding': 'utf-8',
        'errors': 'replace',
        'bufsize': 1,
    }
    if mergeStreams:
        popenArgs['stdout'] = subprocess.PIPE
        popenArgs['stderr'] = subprocess.STDOUT
    else:
        popenArgs['stdout'] = subprocess.PIPE
        popenArgs['stderr'] = subprocess.PIPE

    process = subprocess.Popen(
        normalizeCommand(list(service['command'])),
        **popenArgs,
    )

    stdoutLabel = str(service.get('stdoutLabel', service.get('name', 'stdout')))
    stderrLabel = str(service.get('stderrLabel', service.get('name', 'stderr')))

    def forwardStream(stream: Iterable[str] | TextIOBase | None, logPath: Path, prefix: str) -> None:
        if stream is None:
            return
        with logPath.open('a', encoding='utf-8') as logFile:
            for line in stream:
                relayLogOutput(prefix, line)
                logFile.write(ANSI_ESCAPE_RE.sub('', line))
                logFile.flush()

    stdoutThread = threading.Thread(
        target=forwardStream,
        args=(process.stdout, stdoutPath, stdoutLabel),
        daemon=True,
    )
    stdoutThread.start()

    stderrThread: threading.Thread | None = None
    if not mergeStreams:
        stderrThread = threading.Thread(
            target=forwardStream,
            args=(process.stderr, stderrPath, stderrLabel),
            daemon=True,
        )
        stderrThread.start()

    stdoutThread.join()
    if stderrThread is not None:
        stderrThread.join()
    return process.wait()


def buildRelayCommand(service: dict[str, Any]) -> list[str]:
    """构建 relay 子进程命令。"""
    relayScript = Path(__file__).resolve()
    relayPayload = {
        'name': str(service.get('name', 'service')),
        'cwd': str(service['cwd']),
        'command': list(service['command']),
        'stdoutPath': str(service['stdoutPath']),
        'stderrPath': str(service['stderrPath']),
        'stdoutLabel': str(service.get('stdoutLabel', service.get('name', 'stdout'))),
        'stderrLabel': str(service.get('stderrLabel', service.get('name', 'stderr'))),
        'mergeStreams': bool(service.get('mergeStreams', False)),
    }
    payloadJson = json.dumps(relayPayload, ensure_ascii=False)
    return [
        sys.executable,
        str(relayScript),
        '__relay__',
        payloadJson,
    ]


def startRelayManagedProcess(service: dict[str, Any]) -> subprocess.Popen[str]:
    """启动 relay 受管进程。"""
    relayCommand = buildRelayCommand(service)
    popenArgs: dict[str, Any] = {
        'cwd': str(ROOT),
        'stdin': subprocess.DEVNULL,
        'text': True,
    }
    if IS_WINDOWS:
        popenArgs['creationflags'] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        popenArgs['start_new_session'] = True
    return subprocess.Popen(relayCommand, **popenArgs)


def runRelayFromArgs(argv: list[str]) -> int:
    """从 CLI 参数运行 relay 模式。"""
    if len(argv) < 3 or argv[1] != '__relay__':
        return -1

    payload = json.loads(argv[2])
    if not isinstance(payload, dict):
        raise RuntimeError('relay 参数格式错误')

    return relayProcessOutput(
        payload,
        mergeStreams=bool(payload.get('mergeStreams', False)),
    )


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
                killProcessGroup = getattr(os, 'killpg', None)
                if callable(killProcessGroup):
                    killProcessGroup(pid, signal.SIGTERM)
                else:
                    raise ProcessLookupError()
            except (ProcessLookupError, OSError):
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

        parsedPids = parsePortPidOutput(command[0], result.stdout, port)
        if parsedPids:
            return parsedPids

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
    if ports is None:
        ports = list(DEFAULT_PORTS)

    services = state.get('services', {})
    stopped: list[tuple[str, int]] = []
    seenPids: set[int] = set()

    orderedNames = [name for name in DEFAULT_SERVICE_ORDER if name in services]
    orderedNames.extend(name for name in services if name not in orderedNames)

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


def killPorts(
    ports: list[int],
    *,
    killPid: Callable[[int, str], bool] | None = None,
    findPortPidsFn: Callable[[int], list[int]] | None = None,
) -> list[tuple[str, int]]:
    """只按指定端口清理监听进程。

    输入:
    - ports: 需要清理的端口列表
    - killPid: 可注入的 PID 关闭函数，便于测试
    - findPortPidsFn: 可注入的端口查询函数，便于测试

    输出:
    - 实际尝试关闭的 `(source, pid)` 列表

    预期行为:
    - 不依赖状态文件
    - 仅处理传入端口上的监听 PID
    - 对重复 PID 去重，避免多端口映射到同一进程时重复关闭
    """
    killPid = killPid or terminateProcess
    findPortPidsFn = findPortPidsFn or findPortPids

    stopped: list[tuple[str, int]] = []
    seenPids: set[int] = set()
    for port in ports:
        for pid in findPortPidsFn(port):
            if pid <= 0 or pid in seenPids:
                continue
            source = f'port:{port}'
            if killPid(pid, source):
                seenPids.add(pid)
                stopped.append((source, pid))
    return stopped


if __name__ == '__main__':
    relayExitCode = runRelayFromArgs(sys.argv)
    if relayExitCode >= 0:
        raise SystemExit(relayExitCode)
