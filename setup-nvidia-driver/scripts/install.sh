#!/usr/bin/env bash
# Installs Ubuntu's NVIDIA server driver on a VM with a passed-through card:
# the packages in $NVIDIA_DRIVER_PACKAGES, the running kernel's headers and
# dkms to build the module for it, and Xorg, which the driver's X module needs
# to render the desktop on the card.
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
    "linux-headers-$kernel" dkms $NVIDIA_DRIVER_PACKAGES \
    xserver-xorg-core mesa-utils

# dkms must have built the module for the running kernel.
modinfo -k "$kernel" nvidia > /dev/null

# A kernel upgrade would boot a kernel the module was not built for.
# shellcheck disable=SC2046
sudo apt-mark hold $(dpkg-query -W -f='${db:Status-Abbrev} ${binary:Package}\n' |
    awk '$1 == "ii" && $2 ~ /^(linux-image|linux-headers|linux-modules)-/ { print $2 }')
echo "NVIDIA driver installed: $NVIDIA_DRIVER_PACKAGES"
