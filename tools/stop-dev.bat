@echo off
setlocal

REM 兼容旧入口：实际逻辑统一走 Python 启动脚本

set "SCRIPT_DIR=%~dp0"
python "%SCRIPT_DIR%一键启停脚本.py" --stop
exit /b %errorlevel%
