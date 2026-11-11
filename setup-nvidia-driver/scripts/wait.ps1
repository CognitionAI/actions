# Holds the build until the pinned NVIDIA driver answers for the passed-through
# card. An older driver that still answers means the install did not take.
# Windows installs the driver for the card's PCI address in the background on
# the first boot that sees it; an image taken before that finishes has no bound
# driver, and every VM booted from it repeats the install.
$ErrorActionPreference = 'Continue'
$smi = 'C:\Windows\System32\nvidia-smi.exe'
$version = $env:NVIDIA_DRIVER_VERSION
$timeout = [int]$env:NVIDIA_WAIT_TIMEOUT_SECONDS
$deadline = (Get-Date).AddSeconds($timeout)
$answer = 'nvidia-smi.exe is not installed'
while ((Get-Date) -lt $deadline) {
    if (Test-Path $smi) {
        $answer = & $smi --query-gpu=name,driver_version,pci.bus_id --format=csv,noheader 2>&1
        $smiExit = $LASTEXITCODE
        $other = @($answer | Where-Object { "$_".Trim() -and "$_" -notlike "*, $version, *" })
        if ($smiExit -eq 0 -and $other.Count -eq 0) {
            Write-Host "NVIDIA driver bound: $answer"
            exit 0
        }
    }
    Start-Sleep -Seconds 5
}
Write-Host "NVIDIA driver $version did not answer within ${timeout}s: $answer"
exit 1
