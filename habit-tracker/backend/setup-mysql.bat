@echo off
cd /d "%~dp0"
set "MYSQL_EXE=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"

if not exist "%MYSQL_EXE%" (
  echo MySQL client was not found at:
  echo %MYSQL_EXE%
  echo.
  echo Open setup-database.sql in MySQL Workbench and run it with an admin/root connection.
  pause
  exit /b 1
)

echo This will ask for your MySQL root/admin password.
echo It will create/fix database habitflow and user vinoth.
echo.
set /p MYSQL_ADMIN_USER=Enter MySQL admin username, usually root: 
if "%MYSQL_ADMIN_USER%"=="" set "MYSQL_ADMIN_USER=root"

"%MYSQL_EXE%" -u%MYSQL_ADMIN_USER% -p < setup-database.sql

echo.
echo Checking VINOTH permissions...
"%MYSQL_EXE%" -uVINOTH -pvinothkumar123 -e "SHOW DATABASES LIKE 'habitflow';"
echo.
echo If the check shows habitflow, restart run-backend.bat and open http://localhost:8081
echo If it still shows Access denied or no habitflow row, run setup-database.sql from MySQL Workbench using an admin/root connection.
pause
