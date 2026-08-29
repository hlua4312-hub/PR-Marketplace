@echo off
title PR Marketplace - Local Web Server (PWA / Live Testing)
cd /d "%~dp0"
echo =========================================================
echo   Starting Local HTTP Web Server for PR Marketplace...
echo   Open: http://localhost:8080 in your browser
echo =========================================================
python -m http.server 8080
pause
