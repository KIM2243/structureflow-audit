$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $PSScriptRoot
$sourceEnv = Join-Path $projectDir '.env.local'
$targetEnv = Join-Path $projectDir '.env'
$runtimeDir = Join-Path $projectDir '.runtime'
$bridgeTokenFile = Join-Path $runtimeDir 'bridge-token.txt'

if (-not (Test-Path -LiteralPath $sourceEnv)) {
  throw '.env.local 파일이 없습니다.'
}

$installCommand = Get-Clipboard -Raw
if ($installCommand -notmatch 'service\s+install\s+(?<token>eyJ\S+)') {
  throw '클립보드에서 Cloudflare Tunnel 토큰을 찾지 못했습니다.'
}
$tunnelToken = $Matches['token'].Trim()

$settings = [ordered]@{}
foreach ($line in Get-Content -LiteralPath $sourceEnv) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
  $separator = $trimmed.IndexOf('=')
  if ($separator -le 0) { continue }
  $settings[$trimmed.Substring(0, $separator).Trim()] = $trimmed.Substring($separator + 1).Trim()
}

$bridgeTokenBytes = New-Object byte[] 32
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($bridgeTokenBytes) } finally { $random.Dispose() }
$bridgeToken = ([BitConverter]::ToString($bridgeTokenBytes) -replace '-', '').ToLowerInvariant()

$settings['KIWOOM_MODE'] = 'real'
$settings['KIWOOM_BRIDGE_HOST'] = '127.0.0.1'
$settings['KIWOOM_BRIDGE_PORT'] = '8790'
$settings['KIWOOM_BRIDGE_TOKEN'] = $bridgeToken
$settings['CLOUDFLARE_TUNNEL_TOKEN'] = $tunnelToken

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$lines = foreach ($entry in $settings.GetEnumerator()) { "$($entry.Key)=$($entry.Value)" }
[System.IO.File]::WriteAllLines($targetEnv, $lines, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($bridgeTokenFile, $bridgeToken, [System.Text.UTF8Encoding]::new($false))

Write-Output '터널 및 브리지 보안 설정 저장 완료'
