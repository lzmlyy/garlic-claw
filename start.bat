@echo off
setlocal

chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

set "ROOT_DIR=%~dp0"
set "SCRIPT_PATH=%ROOT_DIR%tools\start_launcher.py"

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  if "%~1"=="" (
    python "%SCRIPT_PATH%"
  ) else (
    python "%SCRIPT_PATH%" %*
  )
  exit /b %ERRORLEVEL%
)

where python3 >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  if "%~1"=="" (
    python3 "%SCRIPT_PATH%"
  ) else (
    python3 "%SCRIPT_PATH%" %*
  )
  exit /b %ERRORLEVEL%
)

where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  if "%~1"=="" (
    py -3 "%SCRIPT_PATH%"
  ) else (
    py -3 "%SCRIPT_PATH%" %*
  )
  exit /b %ERRORLEVEL%
)

echo 未找到 Python，请先安装 Python 3。
exit /b 1
