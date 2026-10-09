@echo off
cd /d "%~dp0"
if not exist "dist\main.js" (
  call npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
start "LX Studio" /d "%~dp0" "node_modules\electron\dist\electron.exe" .
