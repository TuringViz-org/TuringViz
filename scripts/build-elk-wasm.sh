#!/usr/bin/env bash
set -euo pipefail

# Rebuild the checked-in browser backend from the exact upstream release plus
# our stack-safe traversals and positions export. Application builds need no Rust.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
vendor_dir="$repo_root/src/vendor/elk-wasm"
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/turingviz-elk-wasm.XXXXXX")"
trap 'rm -rf "$build_dir"' EXIT
export RUSTUP_TOOLCHAIN="${ELK_RUST_TOOLCHAIN:-1.94.1}"

git init -q "$build_dir/source"
git -C "$build_dir/source" remote add origin https://github.com/openedges/elk-rs.git
git -C "$build_dir/source" fetch --depth 1 origin 22fbee456ccffe88d524e8fefe7d6ffd8d9f5063
git -C "$build_dir/source" checkout -q --detach FETCH_HEAD
git -C "$build_dir/source" apply "$vendor_dir/safari-stack.patch"
git -C "$build_dir/source" apply "$vendor_dir/positions-output.patch"

rustup target add --toolchain "$RUSTUP_TOOLCHAIN" wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.113 --locked --root "$build_dir/tools"
(
  cd "$build_dir/source"
  RUSTFLAGS='-C debuginfo=1' cargo build --locked --release \
    --target wasm32-unknown-unknown -p org-eclipse-elk-wasm
)
"$build_dir/tools/bin/wasm-bindgen" \
  --target web \
  --remove-name-section \
  --remove-producers-section \
  --out-dir "$build_dir/output" \
  "$build_dir/source/target/wasm32-unknown-unknown/release/org_eclipse_elk_wasm.wasm"

cp "$build_dir/output/org_eclipse_elk_wasm.js" "$vendor_dir/"
cp "$build_dir/output/org_eclipse_elk_wasm.d.ts" "$vendor_dir/"
cp "$build_dir/output/org_eclipse_elk_wasm_bg.wasm" "$vendor_dir/"
cp "$build_dir/source/LICENSE" "$vendor_dir/LICENSE"
cp "$build_dir/source/NOTICE" "$vendor_dir/NOTICE"
echo "Rebuilt browser WASM in $vendor_dir"
