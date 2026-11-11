# Installs the pinned GRID build of the NVIDIA driver. GRID runs the card in
# WDDM mode, so the desktop, DirectX and the browser render on it, and CUDA
# works. The installer is a self-extracting 7-Zip archive; pnputil adds its
# INFs to the driver store and installs them on the card.

# A failed cmdlet stops the script. The progress bar slows a large download
# and is noise in a build log.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# With stderr redirected, as it is in a build, Windows PowerShell 5.1 turns a
# native tool's stderr output into an error even when the tool succeeds. Print
# it and carry on; the exit code checks below catch a tool that failed.
trap {
    if ($_.FullyQualifiedErrorId -in @('NativeCommandError', 'NativeCommandErrorMessage')) {
        [Console]::Error.WriteLine("$_")
        continue
    }
    break
}

$version = $env:NVIDIA_DRIVER_VERSION
$smi = 'C:\Windows\System32\nvidia-smi.exe'
if (Test-Path $smi) {
    $ErrorActionPreference = 'Continue'
    # One line per card.
    $bound = @(& $smi --query-gpu=driver_version --format=csv,noheader 2>&1 | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
    if ($LASTEXITCODE -eq 0 -and $bound.Count -gt 0 -and @($bound | Where-Object { $_ -ne $version }).Count -eq 0) {
        Write-Host "NVIDIA driver $version is already bound"
        exit 0
    }
    $ErrorActionPreference = 'Stop'
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$temp = [IO.Path]::GetTempPath()
$installer = Join-Path $temp "nvidia-$version.exe"
$extract = Join-Path $temp "nvidia-$version"

Invoke-WebRequest -Uri $env:NVIDIA_DRIVER_URL -OutFile $installer -UseBasicParsing
$actual = (Get-FileHash -Path $installer -Algorithm SHA256).Hash.ToLower()
if ($actual -ne $env:NVIDIA_DRIVER_SHA256) {
    Remove-Item $installer -Force
    throw "NVIDIA driver checksum mismatch: expected $env:NVIDIA_DRIVER_SHA256, got $actual"
}

# 7-Zip from PATH, from its own installer, or the copy Chocolatey ships. A box
# with none of them gets 7-Zip's standalone console build, which reads 7z
# archives only: the installer is one, behind its launcher.
$sevenZip = @(
    (Get-Command 7z -ErrorAction SilentlyContinue).Source,
    'C:\Program Files\7-Zip\7z.exe',
    'C:\ProgramData\chocolatey\tools\7z.exe'
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
$sevenZipArgs = @()
$downloaded = $null
if (-not $sevenZip) {
    $downloaded = Join-Path $temp '7zr.exe'
    Invoke-WebRequest -Uri $env:SEVEN_ZIP_URL -OutFile $downloaded -UseBasicParsing
    $actual = (Get-FileHash -Path $downloaded -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $env:SEVEN_ZIP_SHA256) {
        Remove-Item $installer, $downloaded -Force
        throw "7-Zip checksum mismatch: expected $env:SEVEN_ZIP_SHA256, got $actual"
    }
    $sevenZip = $downloaded
    $sevenZipArgs = @('-t7z')
}
& $sevenZip x @sevenZipArgs $installer "-o$extract" -y | Out-Null
# 7-Zip exits 1 for a warning, which the launcher's signature after the
# archive can raise; 2 and above are errors.
if ($LASTEXITCODE -gt 1) { throw "7z extraction failed with exit code $LASTEXITCODE" }
if (-not (Test-Path "$extract\Display.Driver\*.inf")) {
    throw "7z extraction (exit code $LASTEXITCODE) left no driver INF in $extract\Display.Driver"
}

& pnputil.exe /add-driver "$extract\Display.Driver\*.inf" /install /subdirs
$pnputilExit = $LASTEXITCODE
Remove-Item (@($installer, $extract, $downloaded) | Where-Object { $_ }) -Recurse -Force -ErrorAction SilentlyContinue
$staged = (& pnputil.exe /enum-drivers | Out-String) -match 'Provider Name:\s+NVIDIA'
if (-not $staged) { throw "pnputil exited $pnputilExit and the driver store lists no NVIDIA driver" }
Write-Host "NVIDIA driver $version installed (pnputil exit $pnputilExit)"
exit 0
