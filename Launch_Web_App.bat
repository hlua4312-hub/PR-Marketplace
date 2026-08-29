@echo off
title PR Marketplace - Launch
cd /d "%~dp0"

echo =========================================================
echo   Starting PR Marketplace on http://localhost:8080
echo.
echo   Opening index.html directly does not work: service
echo   workers and PWA install need a real http:// origin.
echo =========================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL%==0 (
    start "" http://localhost:8080
    python -m http.server 8080
    goto :eof
)

where node >nul 2>nul
if %ERRORLEVEL%==0 (
    start "" http://localhost:8080
    npx --yes serve . -l 8080
    goto :eof
)

echo [!] Neither Python nor Node.js was found on this machine.
echo     Install either one, then run this file again.
pause
