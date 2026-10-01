#!/bin/sh
# Server-side deploy for SageGames, run by GitHub Actions (.github/workflows/deploy.yml) over SSH.
#
# Installed once as /usr/local/bin/sagegames-deploy and set as the forced command of the deploy
# key in /root/.ssh/authorized_keys, so that key can run this script and nothing else:
#   command="/usr/local/bin/sagegames-deploy",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA… github-deploy
#
# The requested commit comes from SSH_ORIGINAL_COMMAND ("deploy <sha>"). Optional settings come on
# stdin as KEY=VALUE lines; only the keys in ALLOWED are accepted (secrets generated on the server,
# such as the database password and API key pepper, are never touched).
#
# Steps: check the commit is on origin/main → build sagegames:<short-sha> → migrate → start →
# wait until healthy. If the new version doesn't become healthy, the previous image is started again.
set -eu

APP_DIR=${SAGEGAMES_DIR:-/opt/apps/sagegames}
ALLOWED="BREVO_API_KEY EMAIL_FROM SENTRY_DSN LOG_LEVEL SAGE_TENANT_KEYS"
KEEP_IMAGES=3

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

# shellcheck disable=SC2086
set -- ${SSH_ORIGINAL_COMMAND:-}
[ "${1:-}" = "deploy" ] || fail "usage: deploy <commit-sha>"
SHA=${2:-}
case "$SHA" in
  *[!0-9a-f]* | "") fail "invalid commit sha" ;;
esac
[ ${#SHA} -ge 7 ] && [ ${#SHA} -le 40 ] || fail "invalid commit sha"

cd "$APP_DIR"
exec 9>"$APP_DIR/.deploy.lock"
flock -w 600 9 || fail "another deploy is still running"

# ---- Settings from GitHub secrets (allow-listed keys only)
set_env() { # key value: replace the line, or append it
  tmp=$(mktemp "$APP_DIR/.env.XXXXXX")
  # Values travel through the environment: awk -v would interpret backslashes in secrets.
  K="$1" V="$2" awk 'BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"]; done = 0 }
    index($0, k "=") == 1 { print k "=" v; done = 1; next } { print }
    END { if (!done) print k "=" v }' .env > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" .env
}
if [ ! -t 0 ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [ -n "$line" ] || continue
    key=${line%%=*}
    value=${line#*=}
    case " $ALLOWED " in
      *" $key "*) set_env "$key" "$value"; log "updated $key" ;;
      *) log "ignored $key (not an allowed setting)" ;;
    esac
  done
fi

# ---- Code
git fetch --quiet origin main
git cat-file -e "$SHA^{commit}" 2>/dev/null || fail "commit $SHA not found"
git merge-base --is-ancestor "$SHA" origin/main || fail "commit $SHA is not on main"
SHORT=$(git rev-parse --short=7 "$SHA")
PREVIOUS_IMAGE=$(sed -n 's/^SAGEGAMES_IMAGE=//p' .env)
git -c advice.detachedHead=false checkout --quiet --detach "$SHA"
log "code at $SHORT: $(git log -1 --format=%s)"

# ---- Build, migrate, start
NEW_IMAGE="sagegames:$SHORT"
set_env SAGEGAMES_IMAGE "$NEW_IMAGE"
set_env RELEASE "$SHORT"
log "building $NEW_IMAGE"
docker compose build --quiet sagegames-app
log "migrating"
docker compose run --rm sagegames-migrate
log "starting"
if docker compose up -d --wait --wait-timeout 180; then
  log "healthy: $(docker compose exec -T sagegames-app node -e "fetch('http://127.0.0.1:4000/healthz').then(r=>r.text()).then(t=>console.log(t))")"
else
  log "the new version did not become healthy; last log lines:"
  docker compose logs --no-color --tail=40 sagegames-app || true
  if [ -n "$PREVIOUS_IMAGE" ] && [ "$PREVIOUS_IMAGE" != "$NEW_IMAGE" ] && docker image inspect "$PREVIOUS_IMAGE" >/dev/null 2>&1; then
    log "rolling back to $PREVIOUS_IMAGE"
    set_env SAGEGAMES_IMAGE "$PREVIOUS_IMAGE"
    set_env RELEASE "${PREVIOUS_IMAGE#sagegames:}"
    docker compose up -d --wait --wait-timeout 180 || true
  fi
  fail "deploy of $SHORT failed"
fi

# ---- Keep the last few images (for rollback), remove older ones of this product only
docker image ls sagegames --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' | sort -r | awk -v keep="$KEEP_IMAGES" 'NR > keep { print $NF }' |
  while read -r old; do [ "$old" = "$NEW_IMAGE" ] || docker image rm "$old" >/dev/null 2>&1 || true; done
docker image prune -f --filter "label=org.opencontainers.image.title=sagegames" >/dev/null 2>&1 || true
log "deployed $SHORT"
