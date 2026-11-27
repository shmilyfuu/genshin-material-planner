#!/usr/bin/env bash
set -euo pipefail
trap 'echo "Gitee release script failed at line ${LINENO}." >&2' ERR

: "${GITEE_TOKEN:?GITEE_TOKEN is required}"
: "${VERSION:?VERSION is required}"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Refusing to publish non-release VERSION: $VERSION" >&2
  exit 1
fi

OWNER="shmilyfuu"
REPO="genshin-material-planner"
TAG="desktop-v${VERSION}"
API="https://gitee.com/api/v5/repos/${OWNER}/${REPO}"
TITLE="原神养成规划桌面版 v${VERSION}"
NOTES_FILE="release-notes.md"
: "${PACKAGE:?PACKAGE is required}"
[[ "$PACKAGE" == "GenshinPlanner-WebView2-v${VERSION}-win-x64" ]]
WINDOWS_ASSET="${PACKAGE}.zip"
WINDOWS_CHECKSUM="${WINDOWS_ASSET}.sha256"

for file in "$NOTES_FILE" "$WINDOWS_ASSET" "$WINDOWS_CHECKSUM"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing release file: $file" >&2
    exit 1
  fi
done

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "Validating Gitee API token..."
user_json="$tmp_dir/user.json"
status="$(curl --silent --show-error --output "$user_json" --write-out '%{http_code}' \
  --get "https://gitee.com/api/v5/user" \
  --data-urlencode "access_token=${GITEE_TOKEN}")"
if [[ "$status" != "200" ]]; then
  echo "Gitee API token validation failed (HTTP ${status})." >&2
  cat "$user_json" >&2
  exit 1
fi

echo "Querying Gitee release ${TAG}..."
release_json="$tmp_dir/release.json"
status="$(curl --silent --show-error --output "$release_json" --write-out '%{http_code}' \
  --get "${API}/releases/tags/${TAG}" \
  --data-urlencode "access_token=${GITEE_TOKEN}")"

release_payload="$tmp_dir/release-payload.json"
echo "Preparing Gitee release metadata..."
jq -n \
  --arg access_token "$GITEE_TOKEN" \
  --arg tag_name "$TAG" \
  --arg target_commitish "main" \
  --arg name "$TITLE" \
  --rawfile body "$NOTES_FILE" \
  '{access_token: $access_token, tag_name: $tag_name, target_commitish: $target_commitish, name: $name, body: $body, prerelease: false}' \
  > "$release_payload"

existing_release_id=""
if [[ "$status" == "200" ]]; then
  existing_release_id="$(jq -r '.id // empty' "$release_json")"
fi

if [[ "$status" == "200" && -n "$existing_release_id" ]]; then
  echo "Updating existing Gitee release ${TAG}..."
  release_id="$existing_release_id"
  status="$(curl --silent --show-error --output "$release_json" --write-out '%{http_code}' \
    --request PATCH "${API}/releases/${release_id}" \
    --header "Content-Type: application/json" \
    --data-binary "@${release_payload}")"
  expected_status="200"
elif [[ "$status" == "404" || ( "$status" == "200" && -z "$existing_release_id" ) ]]; then
  echo "Creating Gitee release ${TAG}..."
  status="$(curl --silent --show-error --output "$release_json" --write-out '%{http_code}' \
    --request POST "${API}/releases" \
    --header "Content-Type: application/json" \
    --data-binary "@${release_payload}")"
  expected_status="201"
else
  echo "Unable to query Gitee release ${TAG} (HTTP ${status})." >&2
  cat "$release_json" >&2
  exit 1
fi

if [[ "$status" != "$expected_status" ]]; then
  echo "Unable to publish Gitee release ${TAG} (HTTP ${status})." >&2
  cat "$release_json" >&2
  exit 1
fi
release_id="$(jq -er '.id' "$release_json")"

assets_json="$tmp_dir/assets.json"
echo "Loading existing Gitee release attachments..."
curl --fail --silent --show-error --output "$assets_json" \
  --get "${API}/releases/${release_id}/attach_files" \
  --data-urlencode "access_token=${GITEE_TOKEN}"

for file in "$WINDOWS_ASSET" "$WINDOWS_CHECKSUM"; do
  while IFS= read -r asset_id; do
    curl --fail --silent --show-error --output /dev/null \
      --request DELETE "${API}/releases/${release_id}/attach_files/${asset_id}" \
      --get \
      --data-urlencode "access_token=${GITEE_TOKEN}"
  done < <(jq -r --arg name "$(basename "$file")" '.[] | select(.name == $name) | .id' "$assets_json")

  echo "Uploading $(basename "$file") to Gitee..."
  curl --fail --silent --show-error --output /dev/null \
    --request POST "${API}/releases/${release_id}/attach_files" \
    --form-string "access_token=${GITEE_TOKEN}" \
    --form "file=@${file}"
done

releases_json="$tmp_dir/releases.json"
echo "Verifying uploaded release attachments..."
curl --fail --silent --show-error --output "$assets_json" \
  --get "${API}/releases/${release_id}/attach_files" \
  --data-urlencode "access_token=${GITEE_TOKEN}"
for file in "$WINDOWS_ASSET" "$WINDOWS_CHECKSUM"; do
  jq -e --arg name "$file" 'any(.[]; .name == $name)' "$assets_json" >/dev/null
done
echo "Applying Gitee release retention policy..."
curl --fail --silent --show-error --output "$releases_json" \
  --get "${API}/releases" \
  --data-urlencode "access_token=${GITEE_TOKEN}" \
  --data-urlencode "page=1" \
  --data-urlencode "per_page=100" \
  --data-urlencode "direction=desc"

while IFS= read -r old_release_id; do
  curl --fail --silent --show-error --output /dev/null \
    --request DELETE "${API}/releases/${old_release_id}" \
    --get \
    --data-urlencode "access_token=${GITEE_TOKEN}"
done < <(jq -r '[.[] | select((.tag_name // "") | test("^desktop-v[0-9]+\\.[0-9]+\\.[0-9]+$")) | select(.prerelease != true and .draft != true)] | sort_by(.tag_name | sub("^desktop-v"; "") | split(".") | map(tonumber)) | reverse | .[5:][] | .id' "$releases_json")

echo "Published ${TAG} to Gitee and retained the newest five releases."
