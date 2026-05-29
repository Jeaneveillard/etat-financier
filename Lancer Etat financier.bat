@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Etat financier
set PORT=8776
set URL=http://127.0.0.1:%PORT%/

echo.
echo  Etat financier — demarrage...
echo  %URL%
echo  Ne fermez pas cette fenetre.
echo.

start "" "%URL%"

python -m http.server %PORT% --bind 127.0.0.1 2>nul
if not errorlevel 1 goto :done

py -m http.server %PORT% --bind 127.0.0.1 2>nul
if not errorlevel 1 goto :done

echo Python introuvable — serveur PowerShell...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
goto :done

:done
pause
