#!/usr/bin/env bash
# Holds the build until the NVIDIA driver answers.
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
