@echo off
REM Launcher for the fixed PowerShell script
echo Starting Live Video Player servers...
powershell -ExecutionPolicy Bypass -File "%~dp0fixed-start-servers.ps1" %*
pause
