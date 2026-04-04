#!/bin/bash
# Link private files into the public repo for local development.
#
# Usage:
#   cd usds_china_private
#   ./link.sh           # create symlinks
#   ./link.sh --unlink  # remove symlinks
#
# After linking, the public repo works as a complete development environment
# with all 6 pipeline steps, site generation, and deployment.

set -e

PRIVATE_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DIR="$(dirname "$PRIVATE_DIR")/usds_china"

if [ ! -d "$PUBLIC_DIR/pipeline" ]; then
    echo "ERROR: Public repo not found at $PUBLIC_DIR"
    echo "Expected usds_china/ alongside usds_china_private/"
    exit 1
fi

if [ "$1" = "--unlink" ]; then
    echo "Removing symlinks..."
    # Remove file symlinks
    for f in scripts/generate_name_lists_html.py scripts/name_classifier.py \
             scripts/classify_all_datasets.py scripts/classify_by_department.py \
             scripts/classify_high_nra.py scripts/build_dashboard.py \
             scripts/generate_dashboard_data.py \
             pipeline/step5_generate.py pipeline/step6_deploy.py \
             pipeline/manifest.json pipeline/ai_classifications.json \
             pipeline/degree_classifier.pkl \
             infra LOCAL_DEVELOPMENT.md; do
        target="$PUBLIC_DIR/$f"
        [ -L "$target" ] && rm "$target" && echo "  Removed $f"
    done
    # Remove site/ symlink
    [ -L "$PUBLIC_DIR/site" ] && rm "$PUBLIC_DIR/site" && echo "  Removed site/"
    # Remove plans/ symlink
    [ -L "$PUBLIC_DIR/plans" ] && rm "$PUBLIC_DIR/plans" && echo "  Removed plans/"
    echo "Done. Public repo is now standalone."
    exit 0
fi

echo "Linking private files into $PUBLIC_DIR ..."

# Link entire directories
for dir in site plans infra; do
    target="$PUBLIC_DIR/$dir"
    if [ -L "$target" ]; then
        echo "  Already linked: $dir/"
    elif [ -d "$target" ]; then
        echo "  WARNING: $dir/ exists as real directory in public repo."
        echo "  Remove it first: rm -rf $PUBLIC_DIR/$dir"
    else
        ln -s "$PRIVATE_DIR/$dir" "$target"
        echo "  Linked: $dir/"
    fi
done

# Link individual files
for f in scripts/generate_name_lists_html.py scripts/name_classifier.py \
         scripts/classify_all_datasets.py scripts/classify_by_department.py \
         scripts/classify_high_nra.py scripts/build_dashboard.py \
         scripts/generate_dashboard_data.py \
         pipeline/step5_generate.py pipeline/step6_deploy.py \
         pipeline/manifest.json pipeline/ai_classifications.json \
         pipeline/degree_classifier.pkl; do
    target="$PUBLIC_DIR/$f"
    source="$PRIVATE_DIR/$f"
    if [ -L "$target" ]; then
        echo "  Already linked: $f"
    elif [ -f "$target" ]; then
        echo "  WARNING: $f exists as real file. Remove it first."
    elif [ -f "$source" ]; then
        ln -s "$source" "$target"
        echo "  Linked: $f"
    fi
done

echo ""
echo "Done. Public repo now has full development environment."
echo "Run 'python -m pipeline run' from $PUBLIC_DIR"
