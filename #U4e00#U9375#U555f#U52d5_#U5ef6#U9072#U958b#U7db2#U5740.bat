@echo off
cd /d "%~dp0"
title XingLingWang Launcher (Delayed)
echo Starting XingLingWang server in a new window...
start "XingLingWang Server" cmd /c "cd /d \"%~dp0\" && python -m uvicorn app:app --host 127.0.0.1 --port 8000"
echo Waiting 3 seconds for server to start...
timeout /t 3 /nobreak >nul
python "%~dp0open_browser.py"
echo Done.
pause
