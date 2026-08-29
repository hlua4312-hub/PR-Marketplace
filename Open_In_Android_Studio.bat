@echo off
title PR Marketplace - Open in Android Studio
echo ===============================================================
echo   Opening PR Marketplace Android Project in Android Studio...
echo ===============================================================

set "AS_PATH=C:\Program Files\Android\Android Studio\bin\studio64.exe"
set "PROJECT_DIR=%~dp0android_app"

if exist "%AS_PATH%" (
    start "" "%AS_PATH%" "%PROJECT_DIR%"
    echo [OK] Android Studio launched with project: %PROJECT_DIR%
) else (
    echo [INFO] Looking for Android Studio in standard locations...
    start "" studio64.exe "%PROJECT_DIR%" 2>nul || (
        echo [!] Android Studio executable not found at "%AS_PATH%".
        echo Please open Android Studio manually and select:
        echo   Open -> %PROJECT_DIR%
    )
)

timeout /t 3 >nul
exit
