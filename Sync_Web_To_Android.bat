@echo off
title PR Marketplace - Sync Web Assets to Android App
echo ===============================================================
echo   Syncing Web Assets (HTML, CSS, JS) to Android App...
echo ===============================================================
echo.

xcopy /Y /Q "%~dp0index.html" "%~dp0android_app\app\src\main\assets\www\"
xcopy /Y /Q "%~dp0styles.css" "%~dp0android_app\app\src\main\assets\www\"
xcopy /Y /Q "%~dp0manifest.json" "%~dp0android_app\app\src\main\assets\www\"
xcopy /Y /Q "%~dp0pr_app_icon.jpg" "%~dp0android_app\app\src\main\assets\www\"
xcopy /Y /Q "%~dp0sw.js" "%~dp0android_app\app\src\main\assets\www\"
if exist "%~dp0js" (
    xcopy /Y /E /I /Q "%~dp0js" "%~dp0android_app\app\src\main\assets\www\js"
)

echo.
echo [SUCCESS] All web files synced to android_app\app\src\main\assets\www\
timeout /t 3 >nul
exit
