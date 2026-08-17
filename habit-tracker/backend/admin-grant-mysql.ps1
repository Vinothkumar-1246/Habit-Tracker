$ErrorActionPreference = "Stop"

$base = "C:\Users\broke\OneDrive\Desktop\HB\habit-tracker\backend"
$log = Join-Path $base "admin-grant-mysql.log"
$myIni = "C:\ProgramData\MySQL\MySQL Server 8.0\my.ini"
$programDataInit = "C:\ProgramData\MySQL\MySQL Server 8.0\habitflow-init.sql"
$mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"

function Log($message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
  Add-Content -LiteralPath $log -Value $line
  Write-Host $line
}

function Remove-InitFileLine {
  $lines = Get-Content -LiteralPath $myIni
  $lines = $lines | Where-Object { $_ -notmatch '^\s*init-file=' }
  Set-Content -LiteralPath $myIni -Value $lines -Encoding ASCII
}

try {
  Set-Content -LiteralPath $log -Value "HabitFlow MySQL grant repair log"
  Log "Writing init SQL inside ProgramData"
  @"
CREATE DATABASE IF NOT EXISTS habitflow;
CREATE USER IF NOT EXISTS 'VINOTH'@'localhost' IDENTIFIED BY 'vinothkumar123';
ALTER USER 'VINOTH'@'localhost' IDENTIFIED BY 'vinothkumar123';
CREATE USER IF NOT EXISTS 'VINOTH'@'%' IDENTIFIED BY 'vinothkumar123';
ALTER USER 'VINOTH'@'%' IDENTIFIED BY 'vinothkumar123';
GRANT ALL PRIVILEGES ON habitflow.* TO 'VINOTH'@'localhost';
GRANT ALL PRIVILEGES ON habitflow.* TO 'VINOTH'@'%';
FLUSH PRIVILEGES;
"@ | Set-Content -LiteralPath $programDataInit -Encoding ASCII

  Log "Adding init-file line"
  Remove-InitFileLine
  $content = Get-Content -LiteralPath $myIni -Raw
  $content = $content -replace "(?m)^\[mysqld\]\s*", "[mysqld]`r`ninit-file=`"$programDataInit`"`r`n"
  Set-Content -LiteralPath $myIni -Value $content -Encoding ASCII

  Log "Restarting MySQL80 to apply grants"
  Restart-Service -Name MySQL80 -Force
  Start-Sleep -Seconds 10
  Log "Service after grant restart: $((Get-Service MySQL80).Status)"

  Log "Removing init-file line"
  Remove-InitFileLine

  Log "Restarting MySQL80 cleanly"
  Restart-Service -Name MySQL80 -Force
  Start-Sleep -Seconds 8
  Log "Service after clean restart: $((Get-Service MySQL80).Status)"

  Log "Checking VINOTH access"
  & $mysql -uVINOTH -pvinothkumar123 -e "SHOW GRANTS; SHOW DATABASES LIKE 'habitflow'; USE habitflow;" 2>&1 | ForEach-Object { Log $_ }

  Log "Done"
} catch {
  Log "FAILED: $($_.Exception.Message)"
  try {
    Remove-InitFileLine
    Start-Service -Name MySQL80 -ErrorAction SilentlyContinue
  } catch {}
  throw
}
