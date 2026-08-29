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

where node >nul 2>nul
if %ERRORLEVEL%==0 (
    start "" http://localhost:8080
    node scripts\dev-server.mjs
    goto :eof
)

where python >nul 2>nul
if %ERRORLEVEL%==0 (
    echo [!] Node.js not found. Falling back to Python.
    echo     Note: Python's server does not disable caching, so after
    echo     editing a file you may need Ctrl+F5 to see the change.
    echo.
    start "" http://localhost:8080
    python -m http.server 8080
    goto :eof
)

echo [!] Neither Node.js nor Python was found on this machine.
echo     Install either one, then run this file again.
pause
