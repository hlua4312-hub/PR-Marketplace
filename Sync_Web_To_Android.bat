@echo off
title PR Marketplace - Sync Web Assets to Android
echo ===============================================================
echo   Copying the web app into the Android assets folder.
echo.
echo   You normally do not need this: the Gradle build runs the same
echo   copy automatically (see the syncWebAssets task in
echo   android_app/app/build.gradle). This is here for the times you
echo   want to refresh the assets without building.
echo ===============================================================
echo.

set "DEST=%~dp0android_app\app\src\main\assets\www"

xcopy /Y /Q "%~dp0index.html"      "%DEST%\"
xcopy /Y /Q "%~dp0styles.css"      "%DEST%\"
xcopy /Y /Q "%~dp0manifest.json"   "%DEST%\"
xcopy /Y /Q "%~dp0sw.js"           "%DEST%\"
xcopy /Y /Q "%~dp0pr_app_icon.jpg" "%DEST%\"
xcopy /Y /E /I /Q "%~dp0js"    "%DEST%\js"
xcopy /Y /E /I /Q "%~dp0icons" "%DEST%\icons"

echo.
echo [OK] Assets synced to %DEST%
timeout /t 3 >nul
