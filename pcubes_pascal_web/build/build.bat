@echo off
setlocal EnableExtensions
set "PROJECT_DIR=%~dp0.."
set "WEB_DIR=%PROJECT_DIR%\web"
set "SOURCE_DIR=%PROJECT_DIR%\source"
set "WEBCOMPAT_DIR=%PROJECT_DIR%\webcompat"
set "PAS2JS_EXE="
for /f "delims=" %%I in ('where pas2js 2^>nul') do if not defined PAS2JS_EXE set "PAS2JS_EXE=%%I"
if not defined PAS2JS_EXE (echo ERROR: pas2js.exe was not found on PATH.& exit /b 1)
for %%I in ("%PAS2JS_EXE%") do set "PAS2JS_BIN=%%~dpI"
set "PAS2JS_ROOT=%PAS2JS_BIN%.."
if not exist "%PAS2JS_ROOT%\packages" set "PAS2JS_ROOT=%PAS2JS_BIN%..\.."
if not exist "%PAS2JS_ROOT%\packages" (echo ERROR: Pas2JS packages folder not found.& exit /b 1)
set "RTL_SRC=%PAS2JS_ROOT%\packages\rtl\src"
if not exist "%RTL_SRC%\system.pas" set "RTL_SRC=%PAS2JS_ROOT%\packages\rtl"
if not exist "%RTL_SRC%\system.pas" (echo ERROR: Pas2JS RTL System unit not found.& exit /b 1)
cd /d "%WEB_DIR%"
echo Compiler: %PAS2JS_EXE%
echo RTL: %RTL_SRC%
"%PAS2JS_EXE%" -Tbrowser -Jc -Jirtl.js -dPCUBES_WEB -Fu"%RTL_SRC%" -Fu"%PAS2JS_ROOT%\packages\rtl\namespaced" -Fu"%WEBCOMPAT_DIR%" -Fu"%SOURCE_DIR%" pcubes_web.pas -opcubes_web.js
if errorlevel 1 exit /b 1
echo Build successful: web\pcubes_web.js
