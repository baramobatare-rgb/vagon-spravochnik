@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Справочник осмотрщика вагонов
echo Откройте http://localhost:8000
echo Офлайн-режим включается только при запуске через этот сервер.
python -m http.server 8000
if errorlevel 1 py -m http.server 8000
pause
