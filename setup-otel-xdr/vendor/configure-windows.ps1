$ErrorActionPreference = "Stop"

$serviceName = "devin-xdr"
$root = "C:\ProgramData\DevinXdr"
$binary = Join-Path $root "otelcol-contrib.exe"
$identityScript = Join-Path $root "identity.ps1"
$archive = Join-Path $env:TEMP "otelcol-contrib.tar.gz"
$url = "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v$env:DEVIN_XDR_COLLECTOR_VERSION/otelcol-contrib_$($env:DEVIN_XDR_COLLECTOR_VERSION)_windows_$($env:DEVIN_XDR_ARCH).tar.gz"

curl.exe -fsSL --ssl-no-revoke --retry 3 $url -o $archive
if ($LASTEXITCODE -ne 0) { throw "Collector download failed" }
curl.exe -fsSL --ssl-no-revoke --retry 3 "$url.sha256" -o "$archive.sha256"
if ($LASTEXITCODE -ne 0) { throw "Collector checksum download failed" }
$expected = (Get-Content "$archive.sha256" -Raw).Split()[0].ToLowerInvariant()
$actual = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw "Collector checksum mismatch" }

if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
  Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
  sc.exe delete $serviceName | Out-Null
  Start-Sleep -Seconds 1
}

New-Item -ItemType Directory -Path $root -Force | Out-Null
icacls.exe $root /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not restrict collector configuration ACLs" }
tar.exe -xzf $archive -C $root otelcol-contrib.exe
Copy-Item $env:DEVIN_XDR_TEMP_CONFIG $env:DEVIN_XDR_CONFIG_PATH -Force
Copy-Item (Join-Path $env:GITHUB_ACTION_PATH "vendor\windows-identity.ps1") $identityScript -Force
Remove-Item (Join-Path $root "oidc-audience"), (Join-Path $root "oidc-subject-keys") -Force -ErrorAction SilentlyContinue
if ($env:DEVIN_XDR_TEMP_OIDC_AUDIENCE) {
  Copy-Item $env:DEVIN_XDR_TEMP_OIDC_AUDIENCE (Join-Path $root "oidc-audience") -Force
  Copy-Item $env:DEVIN_XDR_TEMP_OIDC_SUBJECT_KEYS (Join-Path $root "oidc-subject-keys") -Force
}

& $binary validate --config $env:DEVIN_XDR_CONFIG_PATH
if ($LASTEXITCODE -ne 0) { throw "Collector configuration is invalid" }

if ($env:DEVIN_XDR_COLLECT_NATIVE_AUDIT -eq "true") {
  auditpol.exe /set /subcategory:"Process Creation" /success:enable /failure:enable | Out-Null
  auditpol.exe /set /subcategory:"Audit Policy Change" /success:enable /failure:enable | Out-Null
  auditpol.exe /set /subcategory:"Security System Extension" /success:enable | Out-Null
  auditpol.exe /set /subcategory:"Other Object Access Events" /success:enable /failure:enable | Out-Null
  auditpol.exe /set /subcategory:"Sensitive Privilege Use" /success:enable /failure:enable | Out-Null
  wevtutil.exe sl Microsoft-Windows-TaskScheduler/Operational /e:true
  wevtutil.exe sl Security /ms:268435456
}

$imagePath = "`"$binary`" --config `"$env:DEVIN_XDR_CONFIG_PATH`""
sc.exe create $serviceName binPath= $imagePath start= demand obj= LocalSystem DisplayName= "Devin XDR collector" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not create collector service" }
sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null

$taskCommand = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$identityScript`""
schtasks.exe /Create /TN DevinXdrIdentity /SC ONSTART /RU SYSTEM /RL HIGHEST /F /TR $taskCommand | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not create identity startup task" }

New-Item -ItemType Directory -Path (Split-Path $env:DEVIN_XDR_LOG_PATH) -Force | Out-Null
Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
Remove-Item $env:DEVIN_XDR_STATE_DIR -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $archive, "$archive.sha256" -Force -ErrorAction SilentlyContinue
Write-Host "devin-xdr enabled for boot; golden-image identity and queue removed"
