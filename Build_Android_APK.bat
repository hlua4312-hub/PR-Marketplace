@echo off
title PR Marketplace - Build Android APK
setlocal enabledelayedexpansion

echo ===============================================================
echo   PR Marketplace - Android APK Builder
echo ===============================================================
echo.

:: Point at Android Studio's bundled Java runtime if JAVA_HOME is unset.
if "%JAVA_HOME%"=="" (
    if exist "C:\Program Files\Android\Android Studio\jbr" (
        set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
        echo [*] Using Android Studio Java Runtime: !JAVA_HOME!
    )
)

:: The web assets no longer need copying here. The Gradle build runs the
:: syncWebAssets task before every compile, so the APK cannot ship stale HTML.

echo [*] Building debug APK via Gradle. This can take a few minutes...
echo.
cd /d "%~dp0android_app"
call gradlew.bat assembleDebug

if %ERRORLEVEL% neq 0 (
    echo.
    echo [!] Build failed with error code %ERRORLEVEL%.
    echo     If Gradle cannot find the Android SDK, open android_app in
    echo     Android Studio once - it writes local.properties for you.
    cd /d "%~dp0"
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ===============================================================
echo   [SUCCESS] Debug APK built.
echo ===============================================================

set "OUTPUT_DIR=%~dp0APK_Outputs"
if not exist "!OUTPUT_DIR!" mkdir "!OUTPUT_DIR!"

copy /Y "%~dp0android_app\app\build\outputs\apk\debug\app-debug.apk" "!OUTPUT_DIR!\PR_Marketplace.apk" >nul

echo.
echo [INFO] APK written to:
echo   !OUTPUT_DIR!\PR_Marketplace.apk
echo.
echo   This is a DEBUG build. For a signed release, copy
echo   android_app\keystore.properties.example to keystore.properties,
echo   fill it in, then run: gradlew.bat assembleRelease
echo.

explorer.exe "!OUTPUT_DIR!"

cd /d "%~dp0"
pause
