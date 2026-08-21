#!/bin/bash
# Deploy the PhD Demographics chat assistant to AWS
# Usage: ./deploy.sh [dev|prod]
set -euo pipefail

ENV="${1:-prod}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== PhD Demographics Chat Assistant ==="
echo "Environment: $ENV"
echo "Region: us-east-1"
echo "Profile: personal"
echo ""

# Validate SAM CLI is installed
if ! command -v sam &>/dev/null; then
    echo "ERROR: AWS SAM CLI is required. Install: brew install aws-sam-cli"
    exit 1
fi

# ---------------------------------------------------------------------------
# Sync handler source + data artifacts from the public repo.
#
# The handler lives in $REPO/cloud/chat/ so that it sits next to the data it
# reads and is version controlled with it. This directory is a build output:
# index.py is a shim, everything else here is copied.
# ---------------------------------------------------------------------------
STACK_NAME="${STACK_NAME:-phd-demographics-chat}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-https://phd-demographics.andy-barr.com}"
REPO="${PHD_REPO:-$HOME/usds_china}"
SRC="$REPO/cloud/chat"

if [[ ! -d "$SRC" ]]; then
    echo "ERROR: handler source not found at $SRC"
    echo "       Set PHD_REPO to the usds_china checkout."
    exit 1
fi

echo "Rebuilding chat data artifacts from $REPO ..."
python3 "$REPO/scripts/build_site_map.py"
python3 "$REPO/scripts/build_chat_facts.py"

echo "Syncing handler source into lambda/ ..."
# Extension modules are listed explicitly rather than globbed so that a
# stray file in cloud/chat/ never ships to the Lambda by accident.
for f in handler.py prompt.py tools.py blocks.py data_store.py realtime.py cache.py facts.py \
         knowledge_figures.py \
         tools_joins.py tools_demographics.py tools_search.py tools_provenance.py \
         tools_levels.py; do
    cp "$SRC/$f" "$SCRIPT_DIR/lambda/$f"
done
# The module list above is hand-maintained and has silently omitted a new
# module twice, each time producing a Runtime.ImportModuleError in production
# rather than a failed deploy. Check that every local module the handler
# imports is actually packaged.
# tools.py loads its extension modules by name and its loader swallows
# ImportError so a broken module degrades to "that tool is absent". That is the
# right behaviour at runtime and the wrong behaviour at deploy time: an omitted
# extension ships silently, and the model then answers from whatever tool IS
# present -- which is how a master's question gets a doctorate figure. Check the
# declared extension list against the package.
echo "Verifying every tools.py extension is packaged..."
EXT_MISSING=$(python3 - "$SRC" "$SCRIPT_DIR/lambda" <<'PYEOF'
import ast, os, sys
src_dir, pkg_dir = sys.argv[1], sys.argv[2]
tree = ast.parse(open(os.path.join(src_dir, "tools.py")).read())
names = []
for node in ast.walk(tree):
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == "_EXTENSIONS":
                if isinstance(node.value, (ast.Tuple, ast.List)):
                    names = [e.value for e in node.value.elts
                             if isinstance(e, ast.Constant)]
print(" ".join(n for n in names
                if not os.path.exists(os.path.join(pkg_dir, n + ".py"))))
PYEOF
)
if [ -n "$EXT_MISSING" ]; then
    echo "ERROR: tools.py declares these extensions but they are not packaged: $EXT_MISSING"
    echo "       Add them to the copy list above. They would ship as missing tools."
    exit 1
fi
echo "  all tools.py extensions are packaged"

echo "Verifying the package satisfies handler.py's imports..."
MISSING=$(python3 - "$SRC" "$SCRIPT_DIR/lambda" <<'PYEOF'
import ast, os, sys
src_dir, pkg_dir = sys.argv[1], sys.argv[2]
tree = ast.parse(open(os.path.join(src_dir, "handler.py")).read())
wanted = set()
for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        for a in node.names:
            wanted.add(a.name.split(".")[0])
    elif isinstance(node, ast.ImportFrom):
        if node.level:                      # from . import x
            for a in node.names:
                wanted.add(a.name.split(".")[0])
local = {n[:-3] for n in os.listdir(src_dir) if n.endswith(".py")}
need = wanted & local
missing = [m for m in sorted(need)
           if not os.path.exists(os.path.join(pkg_dir, m + ".py"))]
print(" ".join(missing))
PYEOF
)
if [[ -n "$MISSING" ]]; then
    echo "ERROR: handler.py imports these, but they are not in the package: $MISSING"
    echo "Add them to the module list above."
    exit 1
fi
echo "  all handler imports are packaged"

rm -rf "$SCRIPT_DIR/lambda/chat_data"
mkdir -p "$SCRIPT_DIR/lambda/chat_data"
# Copy every artifact, not a hand-listed set of extensions. The previous
# glob was *.csv *.csv.gz *.json, which silently dropped search_index.bin
# (tools_search) and sheeo_state_compact.json.gz (tools_demographics) — the
# deploy still succeeded and both tool families failed at runtime.
cp "$SRC/chat_data/"* "$SCRIPT_DIR/lambda/chat_data/"
# Knowledge base: stable prose the assistant should know but that no data
# tool returns. Loaded by prompt.load_kb().
rm -rf "$SCRIPT_DIR/lambda/knowledge"
mkdir -p "$SCRIPT_DIR/lambda/knowledge"
cp "$SRC/knowledge/"*.md "$SCRIPT_DIR/lambda/knowledge/"

echo "Bundle contents:"
du -sh "$SCRIPT_DIR/lambda/chat_data"
ls -la "$SCRIPT_DIR/lambda/chat_data"

# Fail fast if an artifact the data tools need is missing.
for required in nra_index.csv.gz cip_titles.csv hd_names.csv \
                universities_compact.json national_series.json site_map.json \
                search_index.bin sheeo_state_compact.json.gz; do
    if [[ ! -s "$SCRIPT_DIR/lambda/chat_data/$required" ]]; then
        echo "ERROR: chat_data/$required is missing or empty."
        exit 1
    fi
done

# Build
echo "Building Lambda package..."
cd "$SCRIPT_DIR"
sam build \
    --template-file template.yaml \
    --profile personal

# Deploy
echo ""
echo "Deploying to AWS..."
# Arguments are explicit rather than read from samconfig.toml. The config
# file was not being picked up, so sam deploy ran with no --stack-name and
# failed -- and because this script had no `set -e`, it exited 0 anyway and
# reported success. Its `confirm_changeset = true` would also hang any
# non-interactive run.
sam deploy \
    --template-file .aws-sam/build/template.yaml \
    --stack-name "$STACK_NAME" \
    --region us-east-1 \
    --profile personal \
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
    --resolve-s3 \
    --s3-prefix "$STACK_NAME" \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset \
    --parameter-overrides "Environment=$ENV AllowedOrigin=$ALLOWED_ORIGIN"
SAM_STATUS=$?
if [[ $SAM_STATUS -ne 0 ]]; then
    echo "ERROR: sam deploy failed (exit $SAM_STATUS). Nothing was updated."
    exit $SAM_STATUS
fi

# Get the function URL
echo ""
echo "=== Deployment Complete ==="
CHAT_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --profile personal \
    --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`ChatEndpoint`].OutputValue' \
    --output text 2>/dev/null || echo "UNKNOWN")

echo "Chat Endpoint: $CHAT_URL"
echo ""
echo "IMPORTANT: Update the CHAT_ENDPOINT in site/chat-widget.js with this URL"
echo "site/data/chat/site_map.json is regenerated by this script and must be"
echo "deployed with the site — the widget fetches it at runtime."
