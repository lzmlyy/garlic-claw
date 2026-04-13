"""Docker 与生产模式公共能力。

输入:
- 仓库根目录下的 `docker-compose.yml`、`.env`、`.env.example`
- 主入口传入的 compose 服务名与健康检查地址

输出:
- Docker Desktop 检查、compose 镜像校验、开发依赖容器启停、生产容器启停

预期行为:
- 只抽取仓库无关的 Docker/compose 通用层
- 不把项目自己的开发服务编排细节塞进公共模块
- `.env` 仅保留当前仓库实际会用到的初始化与 compose 参数拼装
"""

from __future__ import annotations

import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from . import process_runtime as common

ROOT = common.ROOT
DEFAULT_COMPOSE_FILE = ROOT / "docker-compose.yml"


def 确保env文件() -> bool:
    envPath = ROOT / ".env"
    if envPath.exists():
        return False

    examplePath = ROOT / ".env.example"
    if not examplePath.exists():
        common.warn("未找到 .env.example，跳过自动初始化。")
        return False

    shutil.copyfile(examplePath, envPath)
    common.info("已自动从 .env.example 创建 .env。")
    return True


def 获取可用env文件() -> Path | None:
    envPath = ROOT / ".env"
    if envPath.exists():
        return envPath

    examplePath = ROOT / ".env.example"
    if examplePath.exists():
        return examplePath

    return None


def 获取composeEnv参数() -> list[str]:
    envPath = 获取可用env文件()
    if envPath is None:
        return []
    return ["--env-file", envPath.name]


def 启动DockerDesktop() -> None:
    if not common.IS_WINDOWS:
        return

    dockerPaths = [
        Path(r"C:\Program Files\Docker\Docker\Docker Desktop.exe"),
        Path(r"C:\Program Files\Docker\Docker\Docker Desktop"),
    ]
    for dockerDesktop in dockerPaths:
        if not dockerDesktop.exists():
            continue
        common.info("Docker 未运行，正在启动 Docker Desktop。")
        subprocess.Popen(
            [str(dockerDesktop)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return

    raise RuntimeError("未找到 Docker Desktop，请手动启动 Docker。")


def docker是否运行() -> bool:
    result = subprocess.run(
        ["docker", "info"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def 确保Docker运行() -> None:
    if docker是否运行():
        return

    启动DockerDesktop()
    common.info("等待 Docker 启动...")
    for _ in range(30):
        if docker是否运行():
            common.info("Docker 已启动。")
            return
        time.sleep(2)

    raise RuntimeError("Docker 启动超时，请手动检查 Docker。")


def 镜像是否存在(image: str) -> bool:
    result = subprocess.run(
        ["docker", "image", "inspect", image],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def 解析DockerCompose镜像(composePath: Path) -> list[str]:
    images: list[str] = []
    for raw in composePath.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line.startswith("image:"):
            continue
        image = line.split(":", 1)[1].strip().strip("'\"")
        if image:
            images.append(image)
    return images


def 验证Docker镜像(images: list[str]) -> None:
    if not images:
        return

    width = max(len(f"检查镜像: {image}") for image in images)
    for image in images:
        message = f"检查镜像: {image}"
        common.startSingleLineStatus(message, width=width)
        if 镜像是否存在(image):
            common.finishSingleLineStatus(
                message,
                width=width,
                result="(已存在)",
                success=True,
            )
            continue

        result = subprocess.run(
            ["docker", "pull", image],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        if result.returncode != 0:
            common.finishSingleLineStatus(
                message,
                width=width,
                result="(拉取失败)",
                success=False,
            )
            stderr = (result.stderr or "").strip()
            raise RuntimeError(
                "无法拉取 Docker 镜像。\n"
                f"镜像: {image}\n"
                f"错误: {stderr}"
            )

        common.finishSingleLineStatus(
            message,
            width=width,
            result="(已拉取)",
            success=True,
        )


def 验证DockerCompose镜像(composePath: Path = DEFAULT_COMPOSE_FILE) -> None:
    common.info(f"解析 compose 文件: {composePath}")
    images = 解析DockerCompose镜像(composePath)
    if not images:
        common.info("未找到需要拉取的镜像（所有服务均为 build 模式）。")
        return

    common.info(f"发现 {len(images)} 个镜像需要验证。")
    dockerPath = common.findFirstCommand(["docker.exe", "docker"])
    if dockerPath is None:
        raise RuntimeError("未找到 docker，请确认 Docker 已安装并已加入 PATH。")
    确保Docker运行()
    common.info("开始验证镜像...")
    验证Docker镜像(images)
    common.info("所有镜像验证完成。")


def 运行Compose命令(
    args: list[str],
    *,
    check: bool,
    composePath: Path = DEFAULT_COMPOSE_FILE,
) -> subprocess.CompletedProcess[str]:
    command = [
        "docker",
        "compose",
        *获取composeEnv参数(),
        "-f",
        str(composePath),
        *args,
    ]
    return subprocess.run(
        command,
        cwd=ROOT,
        check=check,
        text=True,
    )


def 停止开发依赖服务(serviceNames: list[str], *, composePath: Path = DEFAULT_COMPOSE_FILE) -> None:
    if not serviceNames:
        return
    if common.findFirstCommand(["docker.exe", "docker"]) is None or not docker是否运行():
        common.info("Docker 未运行，跳过停止开发依赖容器。")
        return

    common.info(f"正在停止开发依赖容器: {', '.join(serviceNames)}")
    运行Compose命令(
        ["stop", *serviceNames],
        check=False,
        composePath=composePath,
    )


def 显示DockerCompose状态(
    serviceNames: list[str] | None = None,
    *,
    composePath: Path = DEFAULT_COMPOSE_FILE,
) -> None:
    if common.findFirstCommand(["docker.exe", "docker"]) is None:
        print("Docker 未安装")
        return

    if not docker是否运行():
        print("Docker 未运行")
        return

    args = ["ps"]
    if serviceNames:
        args.extend(serviceNames)
    运行Compose命令(args, check=False, composePath=composePath)


def http健康检查(url: str, timeoutSeconds: int = 30) -> bool:
    deadline = time.monotonic() + timeoutSeconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if 200 <= response.status < 500:
                    return True
        except urllib.error.HTTPError as exc:
            if 200 <= exc.code < 500:
                return True
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(1)
    return False


def 启动生产模式(
    *,
    composePath: Path = DEFAULT_COMPOSE_FILE,
    siteUrl: str,
    healthUrl: str,
) -> int:
    dockerPath = common.findFirstCommand(["docker.exe", "docker"])
    if dockerPath is None:
        print("未找到 docker，请确认 Docker 已安装并已加入 PATH。")
        return 1

    try:
        确保Docker运行()
        确保env文件()
        验证DockerCompose镜像(composePath)
        common.info("构建并启动生产容器。")
        运行Compose命令(["up", "-d", "--build"], check=True, composePath=composePath)
        common.info("等待服务启动...")
        time.sleep(10)
        common.info("检查容器状态...")
        运行Compose命令(["ps"], check=False, composePath=composePath)

        if http健康检查(healthUrl, timeoutSeconds=30):
            common.ok("生产环境 HTTP 健康检查通过。")
        else:
            common.warn("生产环境 HTTP 健康检查失败，请检查容器日志。")

        print()
        print("生产环境已启动：")
        print(f"- 站点：{siteUrl}")
        print(f"- 健康检查：{healthUrl}")
        return 0
    except subprocess.CalledProcessError as exc:
        print(f"命令执行失败，返回代码为: {exc.returncode}: {exc.cmd}", flush=True)
        return exc.returncode
    except Exception as exc:
        print(f"错误: {exc}", flush=True)
        return 1


def 停止生产模式(*, composePath: Path = DEFAULT_COMPOSE_FILE) -> int:
    dockerPath = common.findFirstCommand(["docker.exe", "docker"])
    if dockerPath is None:
        print("未找到 docker，请确认 Docker 已安装并已加入 PATH。")
        return 1

    try:
        common.info("停止生产容器。")
        运行Compose命令(["down"], check=False, composePath=composePath)
        return 0
    except Exception as exc:
        print(f"错误: {exc}", flush=True)
        return 1


def 显示生产状态(*, composePath: Path = DEFAULT_COMPOSE_FILE) -> int:
    try:
        print("生产容器状态：")
        显示DockerCompose状态(composePath=composePath)
        return 0
    except Exception as exc:
        print(f"错误: {exc}", flush=True)
        return 1
