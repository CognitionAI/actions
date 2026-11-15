# Holds the build until the pinned NVIDIA driver answers for every card. An
# older driver that still answers means the install did not take. Windows can
# finish a driver install in the background; a snapshot taken before that has
# no bound driver.
$ErrorActionPreference = 'Continue'
$smi = 'C:\Windows\System32\nvidia-smi.exe'
$version = $env:NVIDIA_DRIVER_VERSION
$timeout = [int]$env:NVIDIA_WAIT_TIMEOUT_SECONDS
# A VM without a card has nothing to wait for: Windows installs the staged
# driver when a VM with a card boots this image. A failed device query is not
# "no card".
try {
    $cards = @(Get-PnpDevice -PresentOnly -ErrorAction Stop | Where-Object { $_.InstanceId -like 'PCI\VEN_10DE*' })
    if ($cards.Count -eq 0) {
        Write-Host "No NVIDIA card on this VM: driver $version is staged, not waiting for nvidia-smi"
        exit 0
    }
} catch {
    Write-Host "Could not list devices ($_); waiting for nvidia-smi"
}
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
