#!/usr/bin/env bash
#
# Publish Reflo to GitHub under github.com/EdgeF-4/reflo.
#
# Auth resolution, in order:
#   1. A token in ~/.config/gh_push_token (gitignored, never in the repo).
#   2. An authenticated `gh` CLI.
# If neither is available the script does NOT fail. It leaves the repository
# committed locally and prints how to publish later.
#
set -euo pipefail

GH_USER="EdgeF-4"
REPO_NAME="reflo"
TOKEN_FILE="${HOME}/.config/gh_push_token"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
REMOTE_HTTPS="https://github.com/${GH_USER}/${REPO_NAME}.git"

cd "$(git rev-parse --show-toplevel)"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree has uncommitted changes. Commit them first, then re-run."
  exit 1
fi

push_with_token() {
  local token="$1"
  echo "Found a push token. Creating the repository if needed and pushing..."
  # Create the repo (ignore failure if it already exists).
  curl -fsS -X POST \
    -H "Authorization: token ${token}" \
    -H "Accept: application/vnd.github+json" \
    https://api.github.com/user/repos \
    -d "{\"name\":\"${REPO_NAME}\",\"description\":\"Self-hostable partner attribution and settlement platform.\",\"private\":false}" \
    >/dev/null 2>&1 || true

  # Push using the token inline so it is never written to .git/config.
  git remote remove origin 2>/dev/null || true
  git remote add origin "${REMOTE_HTTPS}"
  git push "https://${GH_USER}:${token}@github.com/${GH_USER}/${REPO_NAME}.git" "${BRANCH}" --tags
  echo "Pushed to ${REMOTE_HTTPS} (${BRANCH})."
}

if [[ -f "${TOKEN_FILE}" ]]; then
  TOKEN="$(tr -d ' \n\r' < "${TOKEN_FILE}")"
  if [[ -n "${TOKEN}" ]]; then
    push_with_token "${TOKEN}"
    exit 0
  fi
fi

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "Using authenticated gh CLI..."
  gh repo view "${GH_USER}/${REPO_NAME}" >/dev/null 2>&1 || \
    gh repo create "${GH_USER}/${REPO_NAME}" --public --source . --remote origin --description "Self-hostable partner attribution and settlement platform." --push
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "${REMOTE_HTTPS}"
  git push -u origin "${BRANCH}" --tags
  echo "Pushed to ${REMOTE_HTTPS} (${BRANCH})."
  exit 0
fi

cat <<EOF

Nothing was pushed: no token at ${TOKEN_FILE} and gh is not authenticated.
The repository is fully committed locally and ready to publish.

To publish later, do ONE of:
  1) echo "<github_pat>" > ${TOKEN_FILE} && chmod 600 ${TOKEN_FILE} && scripts/publish.sh
  2) gh auth login && scripts/publish.sh

EOF
exit 0
