@echo off
title PR Marketplace - Local Server
cd /d "%~dp0"
echo =========================================================
echo   PR Marketplace on http://localhost:8080
echo   Press Ctrl+C to stop.
echo =========================================================
python -m http.server 8080
pause
