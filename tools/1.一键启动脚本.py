"""
Garlic Claw 一键启动/停止脚本

用法:
  python run.py            # 启动所有服务（build + start）
  python run.py --no-build # 跳过构建直接启动
  python run.py --stop     # 停止所有服务
  python run.py --status   # 查看服务状态
  python run.py --build    # 仅构建，不启动
  python run.py --web      # 同时启动 web 开发服务器
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent.resolve()
SERVER_DIR = ROOT / "packages" / "server"
PID_FILE = ROOT / ".run.pid"

SERVICES = {
    "server": {
        "cmd": ["node", "dist/main.js"],
        "cwd": SERVER_DIR,
        "port": 23330,
        "label": "Server  (HTTP :23330, WS :23331)",
    },
}
WEB_SERVICE = {
    "cmd": ["npm", "run", "dev", "--workspace=packages/web"],
    "cwd": ROOT,
    "port": 23333,
    "label": "Web Dev (:23333)",
}


# ──────────────────────────────────────────────────────────────────
# 颜色输出
# ──────────────────────────────────────────────────────────────────
IS_WIN = sys.platform == "win32"

def _c(code: str, text: str) -> str:
    if IS_WIN and "ANSICON" not in os.environ and "WT_SESSION" not in os.environ:
        return text
    return f"\033[{code}m{text}\033[0m"

def ok(msg):  print(_c("32", f"  ✔  {msg}"))
def info(msg): print(_c("36", f"  ▸  {msg}"))
def warn(msg): print(_c("33", f"  ⚠  {msg}"))
def err(msg):  print(_c("31", f"  ✘  {msg}"), file=sys.stderr)
def head(msg): print(_c("1;35", f"\n{'─'*50}\n  {msg}\n{'─'*50}"))


# ──────────────────────────────────────────────────────────────────
# PID 文件
# ──────────────────────────────────────────────────────────────────
def load_pids() -> dict:
    if PID_FILE.exists():
        try:
            return json.loads(PID_FILE.read_text())
        except Exception:
            pass
    return {}


def save_pids(pids: dict):
    PID_FILE.write_text(json.dumps(pids, indent=2))


def is_running(pid: int) -> bool:
    try:
        if IS_WIN:
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                capture_output=True, text=True
            )
            return str(pid) in result.stdout
        else:
            os.kill(pid, 0)
            return True
    except (ProcessLookupError, PermissionError, FileNotFoundError):
        return False


def kill_pid(pid: int, name: str):
    try:
        if IS_WIN:
            subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                           capture_output=True)
        else:
            os.kill(pid, signal.SIGTERM)
        ok(f"已停止 {name} (PID {pid})")
    except Exception as e:
        warn(f"停止 {name} (PID {pid}) 失败: {e}")


# ──────────────────────────────────────────────────────────────────
# ？？？
# ──────────────────────────────────────────────────────────────────


def 确保_git_hooks_已启用() -> None:
    """检查并启用 git hooks。"""
    # 检查 .githooks 目录是否存在
    githooks_dir = ROOT / ".githooks"
    if not githooks_dir.exists():
        return

    # 获取当前 hooks 路径
    result = subprocess.run(
        ["git", "config", "core.hooksPath"],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    current_path = result.stdout.strip() if result.returncode == 0 else ""

    # 如果已经设置为 .githooks，则跳过
    if current_path == ".githooks":
        return

    ok("启用 git hooks")
    subprocess.run(
        ["git", "config", "core.hooksPath", ".githooks"],
        check=True,
        cwd=ROOT,
    )

    # 非 Windows 系统需要添加执行权限
    if os.name != "nt":
        for hook_file in githooks_dir.iterdir():
            if hook_file.is_file():
                subprocess.run(
                    ["chmod", "+x", str(hook_file)],
                    check=False,
                    cwd=ROOT,
                )



# ──────────────────────────────────────────────────────────────────
# 构建
# ──────────────────────────────────────────────────────────────────
def run_step(label: str, cmd: list, cwd: Path, retries: int = 0, delay: float = 1.0) -> bool:
    attempt = 0
    while True:
        info(f"{label} ...")
        run_cmd = cmd
        if IS_WIN and run_cmd[0] in {"npm", "npx"}:
            run_cmd = [f"{run_cmd[0]}.cmd"] + run_cmd[1:]
        result = subprocess.run(run_cmd, cwd=cwd)
        if result.returncode == 0:
            ok(f"{label} 完成")
            return True
        if attempt >= retries:
            err(f"{label} 失败（退出码 {result.returncode}）")
            return False
        attempt += 1
        time.sleep(delay)


def build() -> bool:
    head("构建")
    steps = [
        ("构建 shared", ["npm", "run", "build:shared"], ROOT),
        ("生成 Prisma Client", ["npx", "prisma", "generate"], SERVER_DIR, 3, 2.0),
        ("构建 server", ["npm", "run", "build:server"], ROOT),
    ]
    for step in steps:
        if not run_step(*step):
            return False
    return True


# ──────────────────────────────────────────────────────────────────
# 启动
# ──────────────────────────────────────────────────────────────────
def start_service(name: str, cfg: dict) -> int | None:
    """启动一个后台进程，返回 PID"""
    cmd = cfg["cmd"]
    cwd = cfg["cwd"]

    # Windows 下 npm 需要加 .cmd 后缀
    if IS_WIN and cmd[0] == "npm":
        cmd = ["npm.cmd"] + cmd[1:]

    kwargs = dict(cwd=cwd)
    if IS_WIN:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

    try:
        proc = subprocess.Popen(cmd, **kwargs)
        time.sleep(1)
        if proc.poll() is not None:
            err(f"{name} 启动后立即退出（退出码 {proc.returncode}）")
            return None
        ok(f"{cfg['label']}  →  PID {proc.pid}")
        return proc.pid
    except FileNotFoundError:
        err(f"找不到命令: {cmd[0]}")
        return None


def start(with_web: bool = False):
    确保_git_hooks_已启用()
    head("启动服务")
    pids = load_pids()
    services = dict(SERVICES)
    if with_web:
        services["web"] = WEB_SERVICE

    new_pids = {}
    for name, cfg in services.items():
        if name in pids and is_running(pids[name]):
            warn(f"{cfg['label']} 已在运行 (PID {pids[name]})")
            new_pids[name] = pids[name]
            continue
        pid = start_service(name, cfg)
        if pid:
            new_pids[name] = pid

    save_pids(new_pids)

    print()
    if "server" in new_pids:
        info("API:     http://localhost:23330/api")
        info("Swagger: http://localhost:23330/api/docs")
        info("WS 插件: ws://localhost:23331")
    if "web" in new_pids:
        info("Web Dev: http://localhost:23333")
    print()
    info("使用 python run.py --stop 停止所有服务")


# ──────────────────────────────────────────────────────────────────
# 停止
# ──────────────────────────────────────────────────────────────────
def stop():
    head("停止服务")
    pids = load_pids()
    if not pids:
        warn("没有找到运行中的服务（.run.pid 不存在或为空）")
        return

    for name, pid in pids.items():
        if is_running(pid):
            kill_pid(pid, name)
        else:
            warn(f"{name} (PID {pid}) 已不在运行")

    PID_FILE.unlink(missing_ok=True)


# ──────────────────────────────────────────────────────────────────
# 状态
# ──────────────────────────────────────────────────────────────────
def status():
    head("服务状态")
    pids = load_pids()
    all_services = {**SERVICES, "web": WEB_SERVICE}

    if not pids:
        warn("没有已记录的服务")
        return

    for name, pid in pids.items():
        label = all_services.get(name, {}).get("label", name)
        if is_running(pid):
            ok(f"{label}  →  运行中 (PID {pid})")
        else:
            err(f"{label}  →  已停止 (PID {pid} 不存在)")


# ──────────────────────────────────────────────────────────────────
# 入口
# ──────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Garlic Claw 服务管理脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--stop",     action="store_true", help="停止所有服务")
    parser.add_argument("--status",   action="store_true", help="查看服务状态")
    parser.add_argument("--build",    action="store_true", help="仅构建，不启动")
    parser.add_argument("--no-build", action="store_true", help="跳过构建直接启动")
    parser.add_argument("--web",      action="store_true", help="同时启动 web 开发服务器")
    args = parser.parse_args()

    if args.stop:
        stop()
    elif args.status:
        status()
    elif args.build:
        success = build()
        sys.exit(0 if success else 1)
    else:
        if not args.no_build:
            if not build():
                sys.exit(1)
        start(with_web=args.web)


if __name__ == "__main__":
    main()
