@echo off
cd /d "%~dp0"
title XingLingWang Launcher
echo Starting XingLingWang server...
echo Opening browser at http://127.0.0.1:8000 ...
start /B python "%~dp0open_browser.py"
python -m uvicorn app:app --host 127.0.0.1 --port 8000
pause
