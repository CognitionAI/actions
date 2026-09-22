$ErrorActionPreference = "Stop"

$root = "C:\ProgramData\DevinXdr"
$state = Join-Path $root "state"
$hostIdPath = Join-Path $state "host.id"
$sessionIdPath = "C:\ProgramData\devin\devin_id"
$remoteIdPath = "C:\ProgramData\devin\remote_id"

New-Item -ItemType Directory -Path $state -Force | Out-Null
if (-not (Test-Path $hostIdPath)) {
  [guid]::NewGuid().ToString() | Set-Content $hostIdPath -Encoding ASCII -NoNewline
}
for ($attempt = 0; $attempt -lt 180 -and -not (Test-Path $sessionIdPath); $attempt++) {
  Start-Sleep -Seconds 1
}
if (-not (Test-Path $sessionIdPath)) { throw "Devin session identity is unavailable" }

$sessionId = (Get-Content $sessionIdPath -Raw).Trim()
$remoteId = if (Test-Path $remoteIdPath) { (Get-Content $remoteIdPath -Raw).Trim() } else { "unavailable" }
$serviceEnvironment = @(
  "DEVIN_XDR_BOOT_ID=$([guid]::NewGuid())",
  "DEVIN_XDR_HOST_ID=$((Get-Content $hostIdPath -Raw).Trim())",
  "DEVIN_XDR_REMOTE_ID=$remoteId",
  "DEVIN_XDR_SESSION_ID=$sessionId"
)
New-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\devin-xdr" -Name Environment -PropertyType MultiString -Value $serviceEnvironment -Force | Out-Null

function ConvertFrom-Base64Url([string]$value) {
  $value = $value.Replace("-", "+").Replace("_", "/")
  while ($value.Length % 4) { $value += "=" }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))
}

function Exchange-OidcToken([string]$url, [string]$generalToken, [string]$audience, [string]$subjectKeys) {
  try {
    $response = curl.exe -fsS --ssl-no-revoke --connect-timeout 5 --max-time 30 -X POST $url `
      --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" `
      --data-urlencode "subject_token=$generalToken" `
      --data-urlencode "subject_token_type=urn:ietf:params:oauth:token-type:jwt" `
      --data-urlencode "audience=$audience" `
      --data-urlencode "subject_keys=$subjectKeys"
    if ($LASTEXITCODE -eq 0) { return ($response | ConvertFrom-Json).access_token }
  } catch {}
  return $null
}

$audiencePath = Join-Path $root "oidc-audience"
if (Test-Path $audiencePath) {
  $audience = (Get-Content $audiencePath -Raw).Trim()
  $subjectKeys = (Get-Content (Join-Path $root "oidc-subject-keys") -Raw).Trim()
  $generalTokenPath = "C:\ProgramData\devin\oidc_token"
  while ($true) {
    try {
      $generalToken = (Get-Content $generalTokenPath -Raw).Trim()
      $issuer = ((ConvertFrom-Base64Url $generalToken.Split(".")[1]) | ConvertFrom-Json).iss.TrimEnd("/")
      $accessToken = Exchange-OidcToken "$issuer/api/oidc/token" $generalToken $audience $subjectKeys
      if (-not $accessToken) {
        $issuerHost = ([uri]$issuer).Host.Split(".")
        $baseDomain = ($issuerHost[1..($issuerHost.Length - 1)] -join ".")
        $accessToken = Exchange-OidcToken "http://git-manager.local:7000/oidc/token" $generalToken $audience $subjectKeys
        if (-not $accessToken) {
          $accessToken = Exchange-OidcToken "https://git-manager.$baseDomain/oidc/token" $generalToken $audience $subjectKeys
        }
      }
      if (-not $accessToken) { throw "Token exchange failed" }
      $temporaryToken = Join-Path $state "oidc-token.new"
      Set-Content $temporaryToken $accessToken -Encoding ASCII -NoNewline
      Move-Item $temporaryToken (Join-Path $state "oidc-token") -Force
      Start-Service devin-xdr -ErrorAction SilentlyContinue
    } catch {}
    Start-Sleep -Seconds 30
  }
}

Start-Service devin-xdr
