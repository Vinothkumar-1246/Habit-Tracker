$ErrorActionPreference = "Stop"

$base = "C:\Users\broke\OneDrive\Desktop\HB\habit-tracker\backend"
$log = Join-Path $base "admin-fix-mysql.log"
$myIni = "C:\ProgramData\MySQL\MySQL Server 8.0\my.ini"
$backup = "C:\ProgramData\MySQL\MySQL Server 8.0\my.ini.habitflow-backup"
$init = Join-Path $base "mysql-init-grants.sql"
$mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"

function Log($message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
  Add-Content -LiteralPath $log -Value $line
  Write-Host $line
}

try {
  Set-Content -LiteralPath $log -Value "HabitFlow MySQL admin repair log"
  Log "Backing up my.ini"
  Copy-Item -LiteralPath $myIni -Destination $backup -Force

  Log "Adding one-time init-file to MySQL config"
  $content = Get-Content -LiteralPath $myIni -Raw
  $content = $content -replace "(?m)^init-file=.*\r?\n?", ""
  $content = $content -replace "(?m)^\[mysqld\]\s*", "[mysqld]`r`ninit-file=`"$init`"`r`n"
  Set-Content -LiteralPath $myIni -Value $content -Encoding ASCII

  Log "Restarting MySQL80 to apply grants"
  Restart-Service -Name MySQL80 -Force
  Start-Sleep -Seconds 10

  Log "Checking grants after init-file"
  & $mysql -uVINOTH -pvinothkumar123 -e "SHOW GRANTS; SHOW DATABASES LIKE 'habitflow';" 2>&1 | ForEach-Object { Log $_ }

  Log "Restoring original my.ini"
  Copy-Item -LiteralPath $backup -Destination $myIni -Force

  Log "Restarting MySQL80 cleanly"
  Restart-Service -Name MySQL80 -Force
  Start-Sleep -Seconds 8

  Log "Final access check"
  & $mysql -uVINOTH -pvinothkumar123 -e "SHOW GRANTS; SHOW DATABASES LIKE 'habitflow'; USE habitflow;" 2>&1 | ForEach-Object { Log $_ }

  Log "Done"
} catch {
  Log "FAILED: $($_.Exception.Message)"
  throw
}

Read-Host "Press Enter to close"
