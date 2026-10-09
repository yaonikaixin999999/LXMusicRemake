@echo off
cd /d "%~dp0"
if not defined LINKLINE_DATA_DIR if not defined LX_STUDIO_DATA_DIR set "LINKLINE_DATA_DIR=%~dp0artifacts\user-test-data"
if not exist "dist\main.js" (
  call npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
start "LinkLine" /d "%~dp0" "node_modules\electron\dist\electron.exe" .
