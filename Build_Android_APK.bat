@echo off
title PR Marketplace - Build Android APK
setlocal enabledelayedexpansion

echo ===============================================================
echo   PR Marketplace - Automated Android APK Builder
echo ===============================================================
echo.

:: 1. Set JAVA_HOME to Android Studio bundled JBR if not set
if "%JAVA_HOME%"=="" (
    if exist "C:\Program Files\Android\Android Studio\jbr" (
        set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
        echo [*] Using Android Studio Java Runtime: !JAVA_HOME!
    ) else if exist "C:\Program Files\Android\Android Studio1\jbr" (
        set "JAVA_HOME=C:\Program Files\Android\Android Studio1\jbr"
        echo [*] Using Android Studio Java Runtime: !JAVA_HOME!
    )
)

:: 2. Sync web assets first
echo [*] Syncing web assets to Android project assets/www...
xcopy /Y /Q "%~dp0index.html" "%~dp0android_app\app\src\main\assets\www\" >nul
xcopy /Y /Q "%~dp0styles.css" "%~dp0android_app\app\src\main\assets\www\" >nul
xcopy /Y /Q "%~dp0manifest.json" "%~dp0android_app\app\src\main\assets\www\" >nul
xcopy /Y /Q "%~dp0pr_app_icon.jpg" "%~dp0android_app\app\src\main\assets\www\" >nul
xcopy /Y /Q "%~dp0sw.js" "%~dp0android_app\app\src\main\assets\www\" >nul
if exist "%~dp0js" (
    xcopy /Y /E /I /Q "%~dp0js" "%~dp0android_app\app\src\main\assets\www\js" >nul
)
echo [OK] Web assets synced.

:: 3. Run Gradle assembleDebug
echo.
echo [*] Building Android APK via Gradle... Please wait...
cd /d "%~dp0android_app"
call gradlew.bat assembleDebug

if %ERRORLEVEL% equ 0 (
    echo.
    echo ===============================================================
    echo   [SUCCESS] Android APK Build Succeeded!
    echo ===============================================================
    
    set "OUTPUT_DIR=%~dp0APK_Outputs"
    if not exist "!OUTPUT_DIR!" mkdir "!OUTPUT_DIR!"
    
    copy /Y "%~dp0android_app\app\build\outputs\apk\debug\app-debug.apk" "!OUTPUT_DIR!\PR_Marketplace.apk" >nul
    copy /Y "%~dp0android_app\app\build\outputs\apk\debug\app-debug.apk" "%~dp0PR_Marketplace.apk" >nul
    
    echo.
    echo [INFO] APK file generated at:
    echo   - %~dp0PR_Marketplace.apk
    echo   - !OUTPUT_DIR!\PR_Marketplace.apk
    echo.
    echo Opening output folder...
    explorer.exe /select,"%~dp0PR_Marketplace.apk"
) else (
    echo.
    echo [!] Build failed with error code %ERRORLEVEL%.
)

cd /d "%~dp0"
echo.
pause
