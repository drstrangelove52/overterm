#!/bin/bash
# OverTerm — fully automated install script.
#
# Run on a fresh Ubuntu/Debian VM as a normal user with sudo rights, from
# inside the repo directory (e.g. ~/overterm). Installs Docker and
# Tailscale, generates .env with random secrets, builds and starts the
# stack, and wires up Tailscale HTTPS. Safe to re-run — every step is
# skipped or updated in place if it was already done, so `git pull &&
# ./install.sh` is also the update workflow.
#
# IMPORTANT: ENCRYPTION_KEY (in .env) decrypts stored SSH credentials
# directly in the database, not just backups. This script only ever
# generates it as part of a brand-new .env — an existing .env is left
# completely untouched. Never delete/regenerate .env on a VM with real
# data, or every stored password/key/passphrase becomes unreadable.
#
# Fully automated if these are set beforehand (as environment variables);
# otherwise falls back to a prompt only where truly unavoidable
# (Tailscale login, if no auth key is given):
#
#   TAILSCALE_AUTHKEY    Reusable/ephemeral key from
#                         https://login.tailscale.com/admin/settings/keys
#                         (optional — without it, `tailscale up` prints a
#                         login URL to open once, manually)
#   TAILSCALE_HOSTNAME   Overrides the default "overterm01"
#   ADMIN_USERNAME       First login user (default: admin)
#   ADMIN_PASSWORD       First login user's password (default: random,
#                         printed at the end)
#   LAN_IP                Overrides the auto-detected primary LAN IP
#
# Usage:
#   TAILSCALE_AUTHKEY=tskey-... ./install.sh

set -euo pipefail

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$1"; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

if [ "$(id -u)" -eq 0 ]; then
  warn "Bitte nicht als root ausführen — als normaler User mit sudo-Rechten starten."
  exit 1
fi
log "sudo-Berechtigung wird geprüft…"
sudo -v

TAILSCALE_HOSTNAME="${TAILSCALE_HOSTNAME:-overterm01}"

# 1. Docker ------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Docker wird installiert…"
  curl -fsSL https://get.docker.com | sudo sh
else
  log "Docker bereits installiert, übersprungen."
fi

# 2. Tailscale -----------------------------------------------------------
if ! command -v tailscale >/dev/null 2>&1; then
  log "Tailscale wird installiert…"
  curl -fsSL https://tailscale.com/install.sh | sudo sh
else
  log "Tailscale bereits installiert, übersprungen."
fi

if ! sudo tailscale status >/dev/null 2>&1; then
  log "Tailscale wird verbunden…"
  if [ -n "${TAILSCALE_AUTHKEY:-}" ]; then
    sudo tailscale up --authkey="$TAILSCALE_AUTHKEY" --hostname="$TAILSCALE_HOSTNAME"
  else
    warn "Kein TAILSCALE_AUTHKEY gesetzt — bitte den gleich ausgegebenen Link öffnen und mit deinem Tailscale-Konto bestätigen."
    sudo tailscale up --hostname="$TAILSCALE_HOSTNAME"
  fi
else
  log "Tailscale bereits verbunden, übersprungen."
fi

TAILSCALE_DNS="$(sudo tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"

# 3. .env -----------------------------------------------------------------
GENERATED_ADMIN_PASSWORD=false
if [ ! -f .env ]; then
  log ".env wird generiert…"
  DETECTED_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | grep -oP 'src \K[\d.]+' || true)"
  RESOLVED_LAN_IP="${LAN_IP:-$DETECTED_IP}"
  if [ -z "$RESOLVED_LAN_IP" ]; then
    warn "Konnte die LAN-IP nicht automatisch erkennen — bitte mit LAN_IP=<ip> ./install.sh erneut starten."
    exit 1
  fi

  RESOLVED_ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
  if [ -n "${ADMIN_PASSWORD:-}" ]; then
    RESOLVED_ADMIN_PASSWORD="$ADMIN_PASSWORD"
  else
    RESOLVED_ADMIN_PASSWORD="$(openssl rand -base64 18)"
    GENERATED_ADMIN_PASSWORD=true
  fi

  cp .env.example .env
  sed -i \
    -e "s|^LAN_IP=.*|LAN_IP=${RESOLVED_LAN_IP}|" \
    -e "s|^DB_ROOT_PASSWORD=.*|DB_ROOT_PASSWORD=$(openssl rand -base64 24)|" \
    -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -base64 24)|" \
    -e "s|^SECRET_KEY=.*|SECRET_KEY=$(openssl rand -hex 32)|" \
    -e "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -base64 32)|" \
    -e "s|^FIRST_ADMIN_USERNAME=.*|FIRST_ADMIN_USERNAME=${RESOLVED_ADMIN_USERNAME}|" \
    -e "s|^FIRST_ADMIN_PASSWORD=.*|FIRST_ADMIN_PASSWORD=${RESOLVED_ADMIN_PASSWORD}|" \
    .env
else
  log ".env existiert bereits, übersprungen (bestehende Secrets — insbesondere ENCRYPTION_KEY — bleiben unangetastet)."
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

# 4. Build & start ------------------------------------------------------
log "Container werden gebaut und gestartet…"
sudo docker compose up --build -d

log "Warte auf das Backend…"
BACKEND_UP=false
for _ in $(seq 1 30); do
  if curl -skf -o /dev/null "https://${LAN_IP}/health"; then
    BACKEND_UP=true
    break
  fi
  sleep 2
done
if [ "$BACKEND_UP" != true ]; then
  warn "Backend antwortet nach 60s nicht — 'sudo docker compose logs backend' zur Fehlersuche prüfen."
  exit 1
fi

# 5. Tailscale HTTPS --------------------------------------------------------
log "Tailscale HTTPS wird eingerichtet…"
sudo tailscale serve --bg "https+insecure://${LAN_IP}:443"

# 6. Summary ----------------------------------------------------------------
log "Fertig!"
echo "LAN (Zertifikatswarnung nötig):  https://${LAN_IP}"
echo "Tailscale (echtes Zertifikat):  https://${TAILSCALE_DNS}"
echo
echo "Login:    ${FIRST_ADMIN_USERNAME}"
if [ "$GENERATED_ADMIN_PASSWORD" = true ]; then
  echo "Passwort: ${FIRST_ADMIN_PASSWORD}   (automatisch generiert — nach dem ersten Login unter Profil ändern!)"
fi
echo
echo "Update:   git pull && ./install.sh"
