@echo off
REM Export local MySQL databases for VPS upload (XAMPP / local MySQL)
REM Output: t2g_backend\sql\exports\
REM
REM Edit below if your setup differs:
REM   MYSQL = path to mysqldump.exe
REM   MYSQL_USER / MYSQL_PASS (leave pass empty for XAMPP default root)

set MYSQL=C:\xampp\mysql\bin\mysqldump.exe
set MYSQL_USER=root
set MYSQL_PASS=
set OUT=%~dp0..\sql\exports
set MAIN_DB=tech2globe
set BLOG_DB=tech2globe_blog

if not exist "%MYSQL%" (
  echo ERROR: mysqldump not found at %MYSQL%
  echo Install XAMPP or edit MYSQL= in this file.
  exit /b 1
)

if not exist "%OUT%" mkdir "%OUT%"

set AUTH=-u %MYSQL_USER%
if not "%MYSQL_PASS%"=="" set AUTH=-u %MYSQL_USER% -p%MYSQL_PASS%

echo Exporting MAIN database: %MAIN_DB%
"%MYSQL%" %AUTH% --databases %MAIN_DB% --routines --triggers --single-transaction > "%OUT%\main_%MAIN_DB%.sql"
if errorlevel 1 (
  echo Main export FAILED.
  exit /b 1
)

echo Exporting BLOG database: %BLOG_DB%
"%MYSQL%" %AUTH% --databases %BLOG_DB% --routines --triggers --single-transaction > "%OUT%\blog_%BLOG_DB%.sql"
if errorlevel 1 (
  echo Blog export FAILED. Run: npm run migrate:blog  locally first if blog DB missing.
  exit /b 1
)

echo.
echo Done. Upload these two files to your VPS:
echo   %OUT%\main_%MAIN_DB%.sql
echo   %OUT%\blog_%BLOG_DB%.sql
echo.
echo On VPS, place them in:  ~/t2g_backend/sql/exports/
echo Then run:  bash scripts/vps-import-databases.sh
echo.
dir /b "%OUT%\*.sql"
pause
