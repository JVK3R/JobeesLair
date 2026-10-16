#!/usr/bin/env bash
# Packages a built PS5 app folder as the exFAT image ShadowMount+ installs.
#
# The app's files sit at the root of the image (/eboot.bin, /sce_module/,
# /sce_sys/, /data/...), which is how the released Jobee'sLair image is laid out.
# Needs root: it mounts the image to copy into it.
#
# usage: make-exfat.sh <app-folder> <out.exfat> [label] [cluster-size]
set -euo pipefail

app="${1:-}"
out="${2:-}"
label="${3:-JOBEESLAIR}"
cluster="${4:-64K}"

if [ -z "$app" ] || [ -z "$out" ]; then
    echo "usage: $0 <app-folder> <out.exfat> [label] [cluster-size]" >&2
    exit 2
fi
[ -d "$app" ] || { echo "error: no such app folder: $app" >&2; exit 1; }
[ -f "$app/eboot.bin" ] || { echo "error: $app has no eboot.bin, it is not a built PS5 app" >&2; exit 1; }
[ "$(id -u)" = 0 ] || { echo "error: needs root to mount the image, run it with sudo" >&2; exit 1; }
command -v mkfs.exfat >/dev/null || { echo "error: mkfs.exfat not found, install exfatprogs" >&2; exit 1; }

# Size the image from what exFAT actually consumes. Every file takes whole
# clusters, and this app ships thousands of small JSON files, so the payload's
# apparent size underestimates the volume by an order of magnitude: 14.7 MB of
# catalog JSON needs 285 MB of 64 KiB clusters. Asking `du` for a block size
# does not emulate that (it scales the host filesystem's own usage), hence the
# count here. The slack covers the FAT, the upcase table and the directories.
slack=$(( 128 * 1024 * 1024 ))
case "$cluster" in
    32K|32k) cluster_bytes=32768 ;;
    128K|128k) cluster_bytes=131072 ;;
    *) cluster_bytes=65536 ;;
esac
clusters=$(find "$app" -type f -printf '%s\n' |
    awk -v c="$cluster_bytes" '{ n += int(($1 + c - 1) / c) } END { print n + 0 }')
directories=$(find "$app" -type d | wc -l)
payload=$(( (clusters + directories) * cluster_bytes ))
size=$(( (payload + slack + 1048575) / 1048576 * 1048576 ))

mkdir -p "$(dirname "$out")"
rm -f "$out"
truncate -s "$size" "$out"

# Not every exfatprogs takes a cluster size, and the default it would otherwise
# pick is not the 64 KiB the released image uses.
if mkfs.exfat -L "$label" -c "$cluster" "$out" >/dev/null 2>&1; then
    echo "mkfs.exfat: label $label, cluster $cluster, $size bytes"
else
    rm -f "$out"
    truncate -s "$size" "$out"
    mkfs.exfat -L "$label" "$out" >/dev/null
    echo "mkfs.exfat: label $label (this exfatprogs refused -c $cluster), $size bytes"
fi

mnt=$(mktemp -d)
mounted=0
cleanup() {
    if [ "$mounted" = 1 ]; then
        umount "$mnt" 2>/dev/null || fusermount -u "$mnt" 2>/dev/null || true
    fi
    rmdir "$mnt" 2>/dev/null || true
}
trap cleanup EXIT

# Hosted runners ship kernels without the exfat module, so fall back to the
# FUSE driver, which can read the image either directly or through a loop
# device.
mount_image() {
    modprobe exfat 2>/dev/null || true
    if mount -o loop -t exfat "$out" "$mnt" 2>/dev/null; then
        echo "mounted: kernel exfat driver"
        return 0
    fi
    if command -v mount.exfat-fuse >/dev/null; then
        if mount.exfat-fuse "$out" "$mnt" 2>/dev/null; then
            echo "mounted: exfat-fuse"
            return 0
        fi
        local loop
        if loop=$(losetup -f --show "$out" 2>/dev/null); then
            if mount.exfat-fuse "$loop" "$mnt" 2>/dev/null; then
                echo "mounted: exfat-fuse on $loop"
                return 0
            fi
            losetup -d "$loop" 2>/dev/null || true
        fi
    fi
    return 1
}

mount_image || { echo "error: could not mount $out, install exfat-fuse or a kernel with exfat" >&2; exit 1; }
mounted=1
cp -r "$app/." "$mnt/"
src=$(find "$app" -type f | wc -l)
dst=$(find "$mnt" -type f | wc -l)
[ "$src" = "$dst" ] || { echo "error: wrote $dst files, the app has $src" >&2; exit 1; }
sync
umount "$mnt" || fusermount -u "$mnt"
mounted=0

echo "wrote $out ($(stat -c%s "$out") bytes)"
