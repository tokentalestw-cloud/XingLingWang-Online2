@echo off
chcp 65001 >nul
set PYTHONUTF8=1
title 星靈王 啟動器

echo 正在啟動伺服器，並自動開啟網頁...
echo.

start /B python "%~dp0open_browser.py"

python -m uvicorn app:app --host 127.0.0.1 --port 8000
pause
