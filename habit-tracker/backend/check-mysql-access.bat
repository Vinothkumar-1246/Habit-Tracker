@echo off
set "MYSQL_EXE=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"

if not exist "%MYSQL_EXE%" (
  echo MySQL client was not found at:
  echo %MYSQL_EXE%
  pause
  exit /b 1
)

echo Checking HabitFlow MySQL login...
"%MYSQL_EXE%" -uVINOTH -pvinothkumar123 -e "SELECT USER(), CURRENT_USER(); SHOW DATABASES LIKE 'habitflow'; USE habitflow; SHOW TABLES;"
pause
