@echo off
title Crypto Dashboard
echo ==========================================
echo   Starting Crypto Dashboard...
echo ==========================================
echo.

cd /d "%~dp0"

echo Opening dashboard in your browser...
timeout /t 3 /nobreak >nul
start http://localhost:5173

npm run dev
