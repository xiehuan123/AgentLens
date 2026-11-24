#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
if [ "$(uname -s)" != Darwin ]; then
  echo 'This script packages AgentLens for macOS.' >&2
  exit 1
fi

profile=${1:-release}
case "$profile" in
  debug) cargo build --locked --features custom-protocol ;;
  release) cargo build --locked --release --features custom-protocol ;;
  *) echo 'Usage: scripts/package-macos.sh [debug|release]' >&2; exit 2 ;;
esac

target_dir=${CARGO_TARGET_DIR:-target}
output="$target_dir/$profile/bundle/macos"
mkdir -p "$output"
staging=$(mktemp -d "$output/.agentlens.XXXXXX")
trap 'rm -rf "$staging"' EXIT
app="$staging/AgentLens.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
install -m 755 "$target_dir/$profile/agentlens" "$app/Contents/MacOS/agentlens"
install -m 644 icons/icon.icns "$app/Contents/Resources/icon.icns"
version=$(sed -n 's/^version = "\([^"]*\)"/\1/p' Cargo.toml)
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>AgentLens</string>
<key>CFBundleDisplayName</key><string>AgentLens</string>
<key>CFBundleIdentifier</key><string>dev.agentlens.desktop</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>agentlens</string>
<key>CFBundleIconFile</key><string>icon.icns</string>
<key>CFBundleShortVersionString</key><string>$version</string>
<key>CFBundleVersion</key><string>$version</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
plutil -lint "$app/Contents/Info.plist"
codesign --force --sign - "$app"
codesign --verify --strict "$app"
if [ -e "$output/AgentLens.app" ]; then
  mv "$output/AgentLens.app" "$staging/previous.app"
fi
if ! mv "$app" "$output/AgentLens.app"; then
  if [ -e "$staging/previous.app" ]; then mv "$staging/previous.app" "$output/AgentLens.app"; fi
  exit 1
fi
printf '%s\n' "$PWD/$output/AgentLens.app"
