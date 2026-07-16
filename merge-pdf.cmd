@echo off
setlocal
node "%~dp0merge-pdf.js" %*
exit /b %ERRORLEVEL%
