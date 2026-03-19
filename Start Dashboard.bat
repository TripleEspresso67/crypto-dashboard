@echo off
title Crypto Strategy Dashboard
echo ==========================================
echo   Starting Crypto Strategy Dashboard...
echo ==========================================
echo.

cd /d "%~dp0"

echo Opening dashboard in your browser...
timeout /t 3 /nobreak >nul
start http://localhost:5173

npm run dev
