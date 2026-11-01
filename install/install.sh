#!/usr/bin/env bash
#
# Away — one-command install for macOS and Linux.
#
#   ./install/install.sh
#
# What it does, in order, and only doing the parts that are missing:
#   1. checks what is already here (Node, npm, a package manager, the files)
#   2. installs Node 22+ if it is missing or too old  (brew / apt / dnf / pacman,
#      or the official tarball unpacked into .runtime/ when there is no sudo)
#   3. installs dependencies and builds the web app
#   4. writes .env.local (once — never overwrites) with generated secrets
#   5. builds the SQLite database from the app's own schema and reports the tables
#   6. installs a headless browser for the click-through test
#   7. starts both servers, runs the browser test, and stops them again
#
# There is no database server to install: the app stores everything in one
# SQLite file and talks to it through Node's built-in driver (`node:sqlite`),
# which is why the only hard requirement is Node 22.5 or newer.
#
# Nothing here needs a paid key, an account, or a developer console.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ---------------------------------------------------------------------------
# options
# ---------------------------------------------------------------------------
PORT=3000
OUTREACH_PORT=3100
RUN_E2E=1
INSTALL_BROWSER=1
ASSUME_YES=0
SYSTEM_OK=1
CHECK_ONLY=0

usage() {
  cat <<'USAGE'
Usage: ./install/install.sh [options]

  --port N            web port for the start script (default 3000)
  --outreach-port N   outreach tool port (default 3100)
  --no-e2e            install everything, skip running the browser test
  --no-browser        skip downloading the headless browser as well
  --skip-system       never install system packages (brew/apt/dnf/pacman)
  --check             report what is installed and what is missing, change nothing
  --yes               don't ask anything, just do it
  -h, --help          this text

Exit codes: 0 installed (or everything already present), 1 something failed,
2 the app installed but the browser test did not pass.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:?--port needs a number}"; shift 2 ;;
    --port=*) PORT="${1#*=}"; shift ;;
    --outreach-port) OUTREACH_PORT="${2:?--outreach-port needs a number}"; shift 2 ;;
    --outreach-port=*) OUTREACH_PORT="${1#*=}"; shift ;;
    --no-e2e) RUN_E2E=0; shift ;;
    --no-browser) RUN_E2E=0; INSTALL_BROWSER=0; shift ;;
    --skip-system) SYSTEM_OK=0; shift ;;
    --check) CHECK_ONLY=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# output
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; OFF=$'\033[0m'
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; PURPLE=$'\033[35m'
else
  BOLD=""; DIM=""; OFF=""; GREEN=""; YELLOW=""; RED=""; PURPLE=""
fi

step() { printf '\n%s▸ %s%s\n' "$PURPLE$BOLD" "$*" "$OFF"; }
ok()   { printf '   %s✓%s %s\n' "$GREEN" "$OFF" "$*"; }
info() { printf '   %s·%s %s\n' "$DIM" "$OFF" "$*"; }
warn() { printf '   %s!%s %s\n' "$YELLOW" "$OFF" "$*"; }
bad()  { printf '   %s✗%s %s\n' "$RED" "$OFF" "$*" >&2; }
die()  { bad "$*"; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

ask() { # ask "question" -> 0 yes, 1 no
  local prompt="$1"
  if [ "$ASSUME_YES" = "1" ] || [ ! -t 0 ]; then return 0; fi
  printf '   %s?%s %s [Y/n] ' "$BOLD" "$OFF" "$prompt"
  local answer=""
  read -r answer || answer=""
  case "$answer" in n|N|no|NO) return 1 ;; *) return 0 ;; esac
}

version_ge() { # version_ge 22.5.0 22.5.0
  awk -v a="$1" -v b="$2" 'BEGIN{
    n=split(a,A,"."); split(b,B,".");
    for(i=1;i<=3;i++){ if(A[i]+0>B[i]+0) exit 0; if(A[i]+0<B[i]+0) exit 1 }
    exit 0
  }'
}

node_version() { node -p 'process.versions.node' 2>/dev/null || echo ""; }

NODE_MIN="22.5.0"
node_ok() {
  have node || return 1
  local v; v="$(node_version)"
  [ -n "$v" ] && version_ge "$v" "$NODE_MIN"
}

# sudo only when we are not root and sudo exists.
if [ "$(id -u)" = "0" ]; then SUDO=""
elif have sudo; then SUDO="sudo"
else SUDO=""; fi

SUDO_RAN=0
run_privileged() {
  if [ -n "$SUDO" ] && [ "$SUDO_RAN" = "0" ]; then
    warn "the steps below need your password for $SUDO"
    SUDO_RAN=1
  fi
  if [ -n "$SUDO" ]; then $SUDO "$@"; else "$@"; fi
}

OS="$(uname -s)"
ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64) NODE_ARCH="x64" ;;
  arm64|aarch64) NODE_ARCH="arm64" ;;
  *) NODE_ARCH="$ARCH_RAW" ;;
esac
case "$OS" in
  Darwin) NODE_OS="darwin" ;;
  Linux) NODE_OS="linux" ;;
  *) die "this installer speaks macOS and Linux (uname says $OS). On Windows use install/install.ps1." ;;
esac

DISTRO="unknown"
if [ -r /etc/os-release ]; then
  DISTRO="$( . /etc/os-release; echo "${ID:-unknown}" )"
fi

printf '%s\n' "$BOLD"
printf '  Away — local install\n'
printf '  %s%s · %s · %s%s\n' "$OS" "$DIM" "$ARCH_RAW" "$DISTRO" "$OFF"
printf '%s\n' "$OFF"

# ---------------------------------------------------------------------------
# 1. what is already here
# ---------------------------------------------------------------------------
step "Looking at what this machine already has"

info "repository   $ROOT"
info "node         $(if have node; then echo "$(node_version) ($(command -v node))"; else echo 'not installed'; fi)"
info "npm          $(if have npm; then npm -v 2>/dev/null || echo '?'; else echo 'not installed'; fi)"
info "git          $(if have git; then git --version | awk '{print $3}'; else echo 'not installed'; fi)"
info "curl         $(if have curl; then curl --version | head -1 | awk '{print $2}'; else echo 'not installed'; fi)"
info "package mgr  $(for pm in brew apt-get dnf pacman zypper apk; do have $pm && printf '%s ' $pm; done)"

HAVE_NODE=0; node_ok && HAVE_NODE=1
HAVE_DEPS=0; [ -d apps/web/node_modules/next ] && HAVE_DEPS=1
HAVE_BUILD=0; [ -f apps/web/.next/BUILD_ID ] && HAVE_BUILD=1
HAVE_DB=0; [ -f apps/web/data/away.db ] && HAVE_DB=1
HAVE_ENV=0; [ -f apps/web/.env.local ] && HAVE_ENV=1
HAVE_E2E_DEPS=0; [ -d e2e/node_modules/@playwright ] && HAVE_E2E_DEPS=1
browser_cached() {
  # A half-finished download leaves a directory behind, so look for a real one.
  local dir found
  for dir in "$HOME/.cache/ms-playwright" "$HOME/Library/Caches/ms-playwright"; do
    [ -d "$dir" ] || continue
    found="$(find "$dir" -maxdepth 1 -type d -name 'chromium*' 2>/dev/null | head -1)"
    if [ -n "$found" ]; then return 0; fi
  done
  return 1
}
HAVE_BROWSER=0; browser_cached && HAVE_BROWSER=1

status_line() { # status_line "label" 1/0 "found" "what I'd do"
  if [ "$2" = "1" ]; then printf '   %s✓%s %-22s %s\n' "$GREEN" "$OFF" "$1" "$3"
  else printf '   %s·%s %-22s %s\n' "$YELLOW" "$OFF" "$1" "$4"; fi
}

printf '\n'
status_line "node ≥ $NODE_MIN" "$HAVE_NODE" "$(node_version)" "will install it"
status_line "web dependencies" "$HAVE_DEPS" "installed" "npm ci"
status_line "web build" "$HAVE_BUILD" "built" "npm run build"
status_line "database" "$HAVE_DB" "apps/web/data/away.db" "will be created from lib/schema.ts"
status_line ".env.local" "$HAVE_ENV" "present (left alone)" "will be generated"
status_line "test dependencies" "$HAVE_E2E_DEPS" "installed" "npm ci in e2e/"
status_line "headless browser" "$HAVE_BROWSER" "cached" "will download once"

if [ "$CHECK_ONLY" = "1" ]; then
  printf '\n'
  info "no changes made (--check)"
  exit 0
fi

# ---------------------------------------------------------------------------
# 2. node
# ---------------------------------------------------------------------------
step "Node 22.5 or newer"

install_node_tarball() {
  info "unpacking the official Node build into .runtime/ (no sudo needed)"
  mkdir -p .runtime
  local base="https://nodejs.org/dist/latest-v22.x"
  local checksums="$base/SHASUMS256.txt"
  local file=""
  if have curl; then
    file="$(curl -fsSL "$checksums" 2>/dev/null | awk -v pat="-$NODE_OS-$NODE_ARCH.tar.gz" '$2 ~ pat {print $2; exit}')"
  fi
  if [ -z "$file" ]; then
    warn "could not reach nodejs.org to find the newest 22.x build"
    return 1
  fi
  info "downloading $file (about 50 MB)"
  if ! curl -fsSL -o ".runtime/$file" "$base/$file"; then
    warn "download failed"
    return 1
  fi
  # Verify against the published checksum before running anything from it.
  if curl -fsSL -o ".runtime/SHASUMS256.txt" "$checksums" 2>/dev/null; then
    expected="$(awk -v f="$file" '$2 == f {print $1}' ".runtime/SHASUMS256.txt")"
    if [ -n "$expected" ]; then
      if have shasum; then actual="$(shasum -a 256 ".runtime/$file" | awk '{print $1}')"
      else actual="$(sha256sum ".runtime/$file" | awk '{print $1}')"; fi
      if [ "$actual" = "$expected" ]; then
        ok "checksum matches nodejs.org"
      else
        rm -f ".runtime/$file"
        warn "checksum mismatch — refusing to use that download"
        return 1
      fi
    fi
  fi
  tar -xzf ".runtime/$file" -C .runtime
  rm -f ".runtime/$file"
  local dir="${file%.tar.gz}"
  ln -sfn "$dir" .runtime/node
  export PATH="$ROOT/.runtime/node/bin:$PATH"
  hash -r 2>/dev/null || true
}

if node_ok; then
  ok "node $(node_version) is already new enough"
else
  if have node; then
    warn "node $(node_version) is too old — the app stores data through node:sqlite, which arrived in 22.5"
  else
    info "node is not installed"
  fi

  if [ "$SYSTEM_OK" = "0" ]; then
    warn "--skip-system was given, so no package manager will be used"
  elif have brew; then
    if ask "install Node 22 with Homebrew?"; then
      info "brew install node@22"
      if brew install node@22 2>&1 | tail -3; then :; fi
      if [ -d "$(brew --prefix node@22 2>/dev/null)/bin" ]; then
        export PATH="$(brew --prefix node@22)/bin:$PATH"
      fi
      hash -r 2>/dev/null || true
      node_ok && ok "node $(node_version) installed via Homebrew"
    fi
  elif have apt-get; then
    if ask "install Node 22 with apt (NodeSource repository)? This needs sudo."; then
      run_privileged apt-get update -qq || true
      run_privileged apt-get install -y ca-certificates curl gnupg >/dev/null || true
      if curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh 2>/dev/null; then
        run_privileged bash /tmp/nodesource_setup.sh >/dev/null 2>&1 || warn "the NodeSource setup script reported a problem"
        run_privileged apt-get install -y nodejs >/dev/null 2>&1 || warn "apt could not install nodejs"
      else
        warn "could not fetch the NodeSource setup script"
      fi
      hash -r 2>/dev/null || true
      node_ok && ok "node $(node_version) installed via apt"
    fi
  elif have dnf || have yum; then
    local_pm="$(have dnf && echo dnf || echo yum)"
    if ask "install Node 22 with $local_pm (NodeSource repository)? This needs sudo."; then
      if curl -fsSL https://rpm.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh 2>/dev/null; then
        run_privileged bash /tmp/nodesource_setup.sh >/dev/null 2>&1 || warn "the NodeSource setup script reported a problem"
        run_privileged "$local_pm" install -y nodejs >/dev/null 2>&1 || warn "$local_pm could not install nodejs"
      fi
      hash -r 2>/dev/null || true
      node_ok && ok "node $(node_version) installed via $local_pm"
    fi
  elif have pacman; then
    if ask "install nodejs with pacman? This needs sudo."; then
      run_privileged pacman -Sy --noconfirm nodejs npm >/dev/null 2>&1 || warn "pacman reported a problem"
      hash -r 2>/dev/null || true
      node_ok && ok "node $(node_version) installed via pacman"
    fi
  fi

  if ! node_ok; then
    install_node_tarball || true
  fi

  if ! node_ok; then
    bad "node 22.5+ is still not available."
    cat >&2 <<'HINT'
   There are three ways out, any of them works:
     · macOS:   brew install node@22 && export PATH="$(brew --prefix node@22)/bin:$PATH"
     · Linux:   install Node 22 from nodejs.org, then run this script again
     · neither: nvm install 22 && nvm use 22
   Then re-run:  ./install/install.sh
HINT
    exit 1
  fi
  ok "node $(node_version) at $(command -v node)"
fi

if ! node_ok; then
  die "node 22.5+ is required"
fi
if ! have curl; then
  warn "curl is not installed — needed later to download the test browser"
fi
NODE_V="$(node_version)"

# ---------------------------------------------------------------------------
# 3. dependencies, build, database
# ---------------------------------------------------------------------------
step "Web app dependencies"
if [ -d apps/web/node_modules/next ]; then
  ok "already installed — skipping (npm ci would throw them away for nothing)"
else
  info "npm ci in apps/web (a minute or two)"
  if [ -f apps/web/package-lock.json ]; then
    ( cd apps/web && npm ci --no-audit --no-fund ) || ( cd apps/web && npm install --no-audit --no-fund )
  else
    ( cd apps/web && npm install --no-audit --no-fund )
  fi
  [ -d apps/web/node_modules/next ] || die "npm could not install the web app's dependencies"
  ok "installed"
fi

step "Building the web app"
if [ -f apps/web/.next/BUILD_ID ]; then
  ok "already built — skipping (delete apps/web/.next to force a rebuild)"
else
  ( cd apps/web && npm run build )
  [ -f apps/web/.next/BUILD_ID ] || die "the build did not produce apps/web/.next/BUILD_ID"
  ok "built"
fi

step "Configuration"
if [ -f apps/web/.env.local ]; then
  ok "apps/web/.env.local already exists — left exactly as it is"
else
  secret() { node -e 'process.stdout.write(require("node:crypto").randomBytes(18).toString("hex"))'; }
  cat > apps/web/.env.local <<ENV
# Written by install/install.sh. Yours to edit — delete it and re-run the
# installer to get fresh secrets.
APP_URL=http://localhost:$PORT

# Demo accounts on /login. Turn off to see what a stranger sees.
DEMO_LOGIN=1

# A stand-in Google/Facebook/Apple you can click through with no developer
# console. Real providers need their own client ids — see README.
# ALLOW_PROD is needed because `./bin/away start` runs the production build;
# it only means "this stand-in is allowed to exist on this machine". Delete both
# lines (and set real client ids) before anything is deployed.
OAUTH_MOCK=1
OAUTH_MOCK_ALLOW_PROD=1

# Signs the one-off links and the webhook. Generated, not shared.
INGEST_TOKEN=$(secret)
DIGEST_TOKEN=$(secret)
PAYMENT_WEBHOOK_SECRET=$(secret)

# Leave empty to keep payments in the sandbox. Set both to use Stripe.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
ENV
  ok "wrote apps/web/.env.local with generated secrets"
fi

if [ -f .away/env ]; then
  ok ".away/env already exists — left alone"
else
  mkdir -p .away/logs
  secret() { node -e 'process.stdout.write(require("node:crypto").randomBytes(18).toString("hex"))'; }
  cat > .away/env <<ENV
# Read by ./bin/away (start/stop/status/logs). Not read by Next.
AWAY_PORT=$PORT
AWAY_OUTREACH_PORT=$OUTREACH_PORT

# The outreach tool has its own password: it is the only part of this that can
# talk to the outside world (email), so it is deliberately separate.
OUTREACH_PASSWORD=$(secret)
OUTREACH_SECRET=$(secret)

# A real postal address is required by law in every commercial email. Empty
# means "simulate and write .eml files", which is the default and is fine.
OUTREACH_POSTAL_ADDRESS=
ENV
  chmod 600 .away/env
  ok "wrote .away/env (ports, outreach password, signing key)"
fi

step "Building the database from lib/schema.ts"
info "the app creates its own tables on the first request — this boots it on a spare port and asks it for a page"
( cd apps/web && node --no-warnings scripts/db-init.mjs ) || die "the database could not be created"
ok "database ready at apps/web/data/away.db"

# ---------------------------------------------------------------------------
# 4. browser + the click-through test
# ---------------------------------------------------------------------------
if [ "$INSTALL_BROWSER" = "1" ]; then
  step "Test dependencies"
  if [ -d e2e/node_modules/@playwright ]; then
    ok "already installed"
  else
    info "npm ci in e2e/"
    ( cd e2e && { [ -f package-lock.json ] && npm ci --no-audit --no-fund || npm install --no-audit --no-fund; } ) \
      || die "npm could not install the test dependencies"
    ok "installed"
  fi

  step "A headless browser (about 150 MB, once)"
  if [ "$HAVE_BROWSER" = "1" ]; then
    ok "Playwright's browser is already cached"
  else
    if [ -n "$SUDO" ] && [ "$SYSTEM_OK" = "1" ] && ask "also install the system libraries Chromium needs (sudo)?"; then
      ( cd e2e && npx --yes playwright install --with-deps chromium ) || ( cd e2e && npx --yes playwright install chromium ) || true
    else
      ( cd e2e && npx --yes playwright install chromium ) || true
    fi
    if browser_cached; then
      ok "browser downloaded"
    else
      warn "the browser could not be downloaded (offline, or the download host is blocked)."
      # A browser people already have is a perfectly good browser.
      if [ -d "/Applications/Google Chrome.app" ] || have google-chrome || have chromium || have chromium-browser; then
        warn "using the Chrome/Chromium already on this machine instead"
        export AWAY_E2E_CHANNEL="chrome"
      elif have microsoft-edge || have microsoft-edge-stable; then
        warn "using Microsoft Edge instead"
        export AWAY_E2E_CHANNEL="msedge"
      else
        warn "the app is installed and runnable; run this later to get the test:"
        warn "  cd e2e && npx playwright install chromium"
        RUN_E2E=0
      fi
    fi
  fi
fi

chmod +x bin/away 2>/dev/null || true

E2E_RESULT="skipped"
if [ "$RUN_E2E" = "1" ]; then
  step "The click-through test (this starts both servers itself)"
  info "sign in · join · chat · book · pay · share · post · moderate · approve a city · send a letter"
  set +e
  ( cd e2e && npm test )
  E2E_STATUS=$?
  set -e
  if [ "$E2E_STATUS" = "0" ]; then
    E2E_RESULT="passed"
    ok "every journey worked in a real browser"
  else
    E2E_RESULT="failed"
    warn "the browser test did not pass — the app itself is installed and runnable."
    warn "the report is in e2e/playwright-report/ (open it with: cd e2e && npm run report)"
  fi
fi

# ---------------------------------------------------------------------------
# 5. what you have
# ---------------------------------------------------------------------------
printf '\n%s%s  Away is installed%s\n' "$BOLD" "$GREEN" "$OFF"
printf '\n  %sStart it%s            %s./bin/away start --open%s\n' "$BOLD" "$OFF" "$DIM" "$OFF"
printf '  %sStop it%s             %s./bin/away stop%s\n' "$BOLD" "$OFF" "$DIM" "$OFF"
printf '  %sLogs%s                %s./bin/away logs%s\n' "$BOLD" "$OFF" "$DIM" "$OFF"
printf '  %sRun the test again%s  %scd e2e && npm test%s\n' "$BOLD" "$OFF" "$DIM" "$OFF"
printf '\n  %sWeb app%s   http://localhost:%s\n' "$BOLD" "$OFF" "$PORT"
printf '  %sOutreach%s  http://localhost:%s  (password in .away/env)\n' "$BOLD" "$OFF" "$OUTREACH_PORT"
printf '\n  %sDemo accounts on /login%s (password away1234):\n' "$BOLD" "$OFF"
printf '    marta@away.app        traveller in Lisbon\n'
printf '    ana@homelisbon.pt     hostel front desk\n'
printf '    ops@away.app          ops / city approvals\n'
printf '\n  %sConfig%s   apps/web/.env.local (app) · .away/env (ports, outreach)\n' "$BOLD" "$OFF"
printf '  %sNode%s     %s\n' "$BOLD" "$OFF" "$NODE_V"
printf '  %sBrowser test%s  %s\n\n' "$BOLD" "$OFF" "$E2E_RESULT"

if [ "$E2E_RESULT" = "failed" ]; then
  exit 2
fi
exit 0
