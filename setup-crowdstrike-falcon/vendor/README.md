# Vendored CrowdStrike installer (maintainers)

`falcon-linux-install.sh` is CrowdStrike's official installer from [CrowdStrike/falcon-scripts](https://github.com/CrowdStrike/falcon-scripts) at tag `v1.13.0`
(SHA-256 `4d4aee62aaa42516bb6245e9289c76c64062e771870108464b66985952ef0f33`).

To update:

1. Download the new tag: `https://raw.githubusercontent.com/CrowdStrike/falcon-scripts/<tag>/bash/install/falcon-linux-install.sh`
2. Review the diff against the current copy (env var names, `PREP_GOLDEN_IMAGE` behavior, `FALCON_SENSOR_VERSION_DECREMENT` range).
3. Replace the file, keep it executable, and record the new tag and checksum here.
