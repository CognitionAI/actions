#!/usr/bin/env bash
# Holds the build until the NVIDIA driver answers. A VM without a card has
# nothing to wait for.
if ! grep -qsx 0x10de "${PCI_DEVICES_DIR:-/sys/bus/pci/devices}"/*/vendor; then
    echo "No NVIDIA card on this VM: not waiting for nvidia-smi"
    exit 0
fi
timeout="$NVIDIA_WAIT_TIMEOUT_SECONDS"
deadline=$((SECONDS + timeout))
answer="nvidia-smi is not installed"
while [ "$SECONDS" -lt "$deadline" ]; do
    if answer=$(nvidia-smi --query-gpu=name,driver_version,pci.bus_id --format=csv,noheader 2>&1); then
        echo "NVIDIA driver bound: $answer"
        exit 0
    fi
    sleep 5
done
echo "NVIDIA driver did not answer within ${timeout}s: $answer"
exit 1
