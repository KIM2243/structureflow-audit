$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectDir '.runtime'
$envFile = Join-Path $projectDir '.env'
$cloudflared = Join-Path $projectDir '.tools\cloudflared.exe'

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
if (-not (Test-Path -LiteralPath $envFile)) {
  throw '.env 파일이 없습니다.'
}
if (-not (Test-Path -LiteralPath $cloudflared)) {
  throw '.tools\cloudflared.exe 파일이 없습니다.'
}

$settings = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
  $separator = $trimmed.IndexOf('=')
  if ($separator -le 0) { continue }
  $settings[$trimmed.Substring(0, $separator).Trim()] = $trimmed.Substring($separator + 1).Trim()
}

$tunnelToken = $settings['CLOUDFLARE_TUNNEL_TOKEN']
if (-not $tunnelToken) { throw 'CLOUDFLARE_TUNNEL_TOKEN이 없습니다.' }

$bridgePortText = $settings['KIWOOM_BRIDGE_PORT']
if (-not $bridgePortText) { $bridgePortText = '8790' }
$bridgePort = [int]$bridgePortText
$bridgeListening = Get-NetTCPConnection -LocalPort $bridgePort -State Listen -ErrorAction SilentlyContinue
if (-not $bridgeListening) {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $bridge = Start-Process -FilePath $node -ArgumentList @(
    '--env-file=.env',
    '--experimental-strip-types',
    'scripts/kiwoom-bridge.mjs'
  ) -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'bridge.out.log') -RedirectStandardError (Join-Path $runtimeDir 'bridge.err.log')
  Set-Content -LiteralPath (Join-Path $runtimeDir 'bridge.pid') -Value $bridge.Id
}

$tunnelRunning = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
if (-not $tunnelRunning) {
  $env:TUNNEL_TOKEN = $tunnelToken
  $tunnel = Start-Process -FilePath $cloudflared -ArgumentList @(
    'tunnel',
    '--no-autoupdate',
    'run'
  ) -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'tunnel.out.log') -RedirectStandardError (Join-Path $runtimeDir 'tunnel.err.log')
  Set-Content -LiteralPath (Join-Path $runtimeDir 'tunnel.pid') -Value $tunnel.Id
}
