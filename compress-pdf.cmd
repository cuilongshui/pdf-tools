@echo off
setlocal
node "%~dp0compress-pdf.js" %*
exit /b %ERRORLEVEL%
