$ErrorActionPreference = 'Stop'

$taskName = 'StructureFlow Kiwoom Bridge'
$startScript = Join-Path $PSScriptRoot 'start-local-bridge.ps1'
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$escapedScript = $startScript.Replace('"', '""')
$arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$escapedScript`""

try {
  $action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 0)
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Description 'StructureFlow 키움 시세 브리지와 Cloudflare Tunnel 자동 실행' -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-Output "작업 스케줄러 등록 완료: $taskName"
} catch {
  $startupDir = [Environment]::GetFolderPath('Startup')
  $startupFile = Join-Path $startupDir 'StructureFlow Kiwoom Bridge.cmd'
  $command = "@echo off`r`nstart `"`" /min `"$powershell`" $arguments`r`n"
  [System.IO.File]::WriteAllText($startupFile, $command, [System.Text.UTF8Encoding]::new($false))
  Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden
  Write-Output "시작프로그램 등록 완료: $startupFile"
}
