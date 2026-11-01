@echo off
rem Away on Windows. This is a thin wrapper: the work happens in away.ps1.
rem
rem   bin\away.cmd start --open
rem   bin\away.cmd status
rem   bin\away.cmd stop
rem   bin\away.cmd test
rem
setlocal
where powershell >nul 2>nul
if errorlevel 1 (
  echo PowerShell was not found on PATH. It ships with Windows, so something is unusual here.
  echo Try opening a new terminal, or running: powershell -File "%~dp0away.ps1" help
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0away.ps1" %*
exit /b %ERRORLEVEL%
