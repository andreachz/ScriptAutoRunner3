#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ]; then
    echo "Usage: $0 <source_folder> <output_zip> [exclude1 exclude2 ...]"
    exit 1
fi

SOURCE="$1"
OUTPUT="$2"
shift 2

# Get absolute path of the script’s directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Resolve output path relative to script dir
OUTPUT="$SCRIPT_DIR/$OUTPUT"

# Enter the source directory so excludes match relative paths
cd "$SOURCE"

# Build excludes relative to SOURCE
EXCLUDES=()
for pattern in "$@"; do
    EXCLUDES+=("-x" "$pattern")
done

# Build the zip
zip -r "$OUTPUT" . "${EXCLUDES[@]}"


# ./pack.sh . ./a.zip ".git/*" "history/*" "docs/*" $0


# run this to pack
# ./pack.sh ../ScriptAutoRunner3 ./a.zip ".git/*" "history/*" "docs/*" $0