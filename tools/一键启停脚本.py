"""Garlic Claw 开发/生产环境一键启停脚本。

当前以此脚本作为统一主入口：
- 开发态由 `tools/scripts/dev_runtime.py` 编排
- Docker 与生产模式由 `tools/scripts/docker_runtime.py` 处理
- 脚本回归测试由 `tools/scripts/test_runtime_scripts.py` 承载
- 入口只负责参数解析与模式分发
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

TOOL_DIR = Path(__file__).resolve().parent
SCRIPTS_DIR = TOOL_DIR / "scripts"
for path in (TOOL_DIR, SCRIPTS_DIR):
    pathText = str(path)
    if pathText not in sys.path:
        sys.path.insert(0, pathText)

# ruff: noqa: E402
import scripts.dev_runtime as dev_runtime
import scripts.docker_runtime as docker_runtime
import scripts.process_runtime as runtime

ROOT = runtime.ROOT
OTHER_DIR = runtime.OTHER_DIR
LOG_DIR = runtime.LOG_DIR
STATE_FILE = runtime.STATE_FILE
DEFAULT_PORTS = runtime.DEFAULT_PORTS

SERVER_DIR = runtime.SERVER_DIR
WEB_DIR = runtime.WEB_DIR
SERVER_PORT = runtime.SERVER_PORT
PLUGIN_WS_PORT = runtime.PLUGIN_WS_PORT
WEB_PORT = runtime.WEB_PORT

PROD_SITE_URL = "http://127.0.0.1"
PROD_HEALTH_URL = f"http://127.0.0.1:{SERVER_PORT}"

common = runtime


def verifyImages(composePath: Path | None = None) -> int:
    targetPath = composePath or (ROOT / "docker-compose.yml")
    try:
        docker_runtime.验证DockerCompose镜像(targetPath)
        return 0
    except Exception as exc:
        print(f"错误: {exc}", file=sys.stderr)
        return 1


def startProd() -> int:
    return docker_runtime.启动生产模式(
        composePath=ROOT / "docker-compose.yml",
        siteUrl=PROD_SITE_URL,
        healthUrl=PROD_HEALTH_URL,
    )


def stopProd() -> int:
    return docker_runtime.停止生产模式(
        composePath=ROOT / "docker-compose.yml",
    )


def statusProd() -> int:
    return docker_runtime.显示生产状态(
        composePath=ROOT / "docker-compose.yml",
    )


def runScriptTests() -> int:
    testModule = "tools.scripts.test_runtime_scripts"
    result = subprocess.run(
        [sys.executable, "-m", "unittest", testModule],
        cwd=ROOT,
        check=False,
    )
    return result.returncode


def parseArgs() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Garlic Claw 开发/生产环境一键启停脚本")
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--start",
        action="store_true",
        help="启动环境（开发模式下不自动停止旧进程，遇到残留直接报错）",
    )
    group.add_argument(
        "--restart",
        action="store_true",
        help="重启环境（开发模式默认动作）",
    )
    group.add_argument(
        "--stop",
        action="store_true",
        help="停止当前模式对应环境",
    )
    group.add_argument(
        "--status",
        action="store_true",
        help="查看当前模式对应环境状态",
    )
    group.add_argument(
        "--verify-images",
        metavar="COMPOSE_FILE",
        help="验证 docker-compose.yml 中的镜像（传入 compose 文件路径）",
    )
    group.add_argument(
        "--test",
        action="store_true",
        help="运行脚本回归测试",
    )
    parser.add_argument("action", nargs="?", help="可选动作")
    parser.add_argument(
        "--prod",
        action="store_true",
        help="使用生产模式",
    )
    parser.add_argument(
        "--tail-logs",
        action="store_true",
        help="启动成功后实时尾随日志到终端",
    )
    parser.add_argument("--log", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--logs", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--build", action="store_true", help=argparse.SUPPRESS)
    return parser.parse_args()


def main() -> int:
    args = parseArgs()
    if args.test:
        return runScriptTests()
    if args.verify_images:
        return verifyImages(Path(args.verify_images))

    action = args.action or "restart"
    if action == "test":
        return runScriptTests()
    if action not in {"start", "stop", "restart", "status"}:
        print(f"错误: 不支持的动作: {action}", file=sys.stderr)
        return 1

    if args.start:
        action = "start"
    elif args.stop:
        action = "stop"
    elif args.restart:
        action = "restart"
    elif args.status:
        action = "status"

    if args.prod:
        if action == "start":
            return startProd()
        if action == "stop":
            return stopProd()
        if action == "restart":
            stopResult = stopProd()
            if stopResult != 0:
                return stopResult
            return startProd()
        return statusProd()

    if action == "stop":
        dev_runtime.stopDevDependencies()
        return dev_runtime.stop()
    if action == "status":
        dev_runtime.statusDevDependencies()
        return dev_runtime.status()

    allowAutoStop = action != "start"
    tailLogs = args.tail_logs or args.log or args.logs
    return dev_runtime.启动开发服务(allowAutoStop=allowAutoStop, tailLogs=tailLogs)


if __name__ == "__main__":
    raise SystemExit(main())
