#!/bin/sh
# Installs the latest slooks release binary for this machine into ~/.local/bin
# (or the directory in SLOOKS_INSTALL_DIR). No Bun or Node is needed.
#
#   curl -fsSL https://raw.githubusercontent.com/zgeoff/slooks/main/install.sh | sh
set -eu

repo="zgeoff/slooks"
dir="${SLOOKS_INSTALL_DIR:-$HOME/.local/bin}"

case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *) echo "slooks: no binary for $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) arch="arm64" ;;
  x86_64 | amd64) arch="x64" ;;
  *) echo "slooks: no binary for $(uname -m)" >&2; exit 1 ;;
esac

asset="slooks-$os-$arch"
url="https://github.com/$repo/releases/latest/download/$asset"

mkdir -p "$dir"
echo "slooks: downloading $url"
curl -fsSL "$url" -o "$dir/slooks.tmp"
chmod +x "$dir/slooks.tmp"
mv "$dir/slooks.tmp" "$dir/slooks"
echo "slooks: installed $("$dir/slooks" --version) to $dir/slooks"

case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "slooks: add $dir to your PATH" ;;
esac
