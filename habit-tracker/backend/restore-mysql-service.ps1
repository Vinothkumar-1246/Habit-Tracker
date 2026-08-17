$ErrorActionPreference = "Stop"

$log = "C:\Users\broke\OneDrive\Desktop\HB\habit-tracker\backend\restore-mysql-service.log"
$myIni = "C:\ProgramData\MySQL\MySQL Server 8.0\my.ini"

function Log($message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
  Add-Content -LiteralPath $log -Value $line
  Write-Host $line
}

Set-Content -LiteralPath $log -Value "Restore MySQL service log"
Log "Removing init-file from my.ini"
$lines = Get-Content -LiteralPath $myIni
$lines = $lines | Where-Object { $_ -notmatch '^\s*init-file=' }
Set-Content -LiteralPath $myIni -Value $lines -Encoding ASCII

Log "Starting MySQL80"
Start-Service -Name MySQL80
Start-Sleep -Seconds 8
Log "Service status: $((Get-Service MySQL80).Status)"

Read-Host "Press Enter to close"
