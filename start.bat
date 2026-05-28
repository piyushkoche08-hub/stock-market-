@echo off
title AlphaPulse Terminal - Starting...
cd /d "%~dp0"
echo.
echo  ================================================
echo   AlphaPulse Terminal - Starting Server
echo  ================================================
echo.
echo  Checking Python...
python --version
echo.
echo  Installing/Checking dependencies...
pip install -r requirements.txt -q
echo.
echo  Starting Flask server on http://localhost:8000
echo  Press Ctrl+C to stop.
echo.
python app.py
echo.
echo  Server stopped.
pause
