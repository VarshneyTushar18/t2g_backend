@echo off
REM Export local MySQL databases for VPS upload (XAMPP)
REM Output: tech2globe-backend\sql\exports\

set MYSQL=C:\xampp\mysql\bin\mysqldump.exe
set OUT=%~dp0..\sql\exports
set MAIN_DB=tech2globe
set BLOG_DB=tech2globe_blog

if not exist "%MYSQL%" (
  echo ERROR: XAMPP mysqldump not found at %MYSQL%
  echo Edit MYSQL= in this file if XAMPP is elsewhere.
  exit /b 1
)

if not exist "%OUT%" mkdir "%OUT%"

echo Exporting main database: %MAIN_DB%
"%MYSQL%" -u root --databases %MAIN_DB% --routines --triggers > "%OUT%\main_%MAIN_DB%.sql"
if errorlevel 1 (
  echo Main export FAILED. Try: set password in command or run as admin.
  exit /b 1
)

echo Exporting blog database: %BLOG_DB%
"%MYSQL%" -u root --databases %BLOG_DB% --routines --triggers > "%OUT%\blog_%BLOG_DB%.sql"
if errorlevel 1 (
  echo Blog export FAILED.
  exit /b 1
)

echo.
echo Done. Files created:
dir /b "%OUT%\*.sql"
echo.
echo Upload both files to VPS with FileZilla, then run on server:
echo   bash scripts/vps-import-databases.sh
echo.
pause
