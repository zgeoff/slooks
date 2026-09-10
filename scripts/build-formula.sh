#!/usr/bin/env bash
# Prints the Homebrew formula for one released version, reading each
# platform's checksum from the SHA256SUMS the binary build wrote.
#
#   scripts/build-formula.sh <version> <path to SHA256SUMS>
set -euo pipefail

version="$1"
sums="$2"

sha() {
  awk -v name="slooks-$1" '$2 == name { print $1 }' "$sums"
}

base="https://github.com/zgeoff/slooks/releases/download/@zgeoff/slooks@$version"

cat <<FORMULA
class Slooks < Formula
  desc "Slack hooks daemon: run shell commands on Slack events, as you"
  homepage "https://github.com/zgeoff/slooks"
  version "$version"
  license "MIT"

  on_macos do
    on_arm do
      url "$base/slooks-darwin-arm64"
      sha256 "$(sha darwin-arm64)"
    end
    on_intel do
      url "$base/slooks-darwin-x64"
      sha256 "$(sha darwin-x64)"
    end
  end

  on_linux do
    on_arm do
      url "$base/slooks-linux-arm64"
      sha256 "$(sha linux-arm64)"
    end
    on_intel do
      url "$base/slooks-linux-x64"
      sha256 "$(sha linux-x64)"
    end
  end

  def install
    binary = Dir["slooks-*"].first
    bin.install binary => "slooks"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/slooks --version")
  end
end
FORMULA
