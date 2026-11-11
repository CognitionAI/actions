#!/usr/bin/env bash
# Installs Ubuntu's NVIDIA server driver: the packages in
# $NVIDIA_DRIVER_PACKAGES, plus the running kernel's headers and dkms to build
# the module for it.
if nvidia-smi > /dev/null 2>&1; then
    echo "NVIDIA driver is already bound"
    exit 0
fi
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
kernel="$(uname -r)"

sudo -E apt-get update
# shellcheck disable=SC2086
sudo -E apt-get install -y -o Dpkg::Options::=--force-confold \
    "linux-headers-$kernel" dkms $NVIDIA_DRIVER_PACKAGES

# dkms must have built the module for the running kernel.
modinfo -k "$kernel" nvidia > /dev/null

# Installing the packages does not load the module, and nvidia-smi cannot
# answer until it is loaded. Once it is, the driver package's udev rules load
# nvidia-modeset, nvidia-drm and nvidia-uvm and create the device nodes.
sudo modprobe nvidia

# A kernel upgrade would boot a kernel the module was not built for.
# shellcheck disable=SC2046
sudo apt-mark hold $(dpkg-query -W -f='${db:Status-Abbrev} ${binary:Package}\n' |
    awk '$1 ~ /^[ih]i$/ && $2 ~ /^(linux-image|linux-headers|linux-modules)-/ { print $2 }')
echo "NVIDIA driver installed: $NVIDIA_DRIVER_PACKAGES"
