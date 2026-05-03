#!/bin/sh
set -e

DOMAIN="${DOMAIN:-}"
CERT_DIR="/etc/nginx/ssl"
LE_LIVE="/etc/letsencrypt/live/${DOMAIN}"

mkdir -p "$CERT_DIR" /var/www/certbot

install_cert() {
    if [ -n "$DOMAIN" ] && [ -f "${LE_LIVE}/fullchain.pem" ]; then
        # Check if LE cert is newer than our copy
        if [ "${LE_LIVE}/fullchain.pem" -nt "$CERT_DIR/cert.pem" ] 2>/dev/null || [ ! -f "$CERT_DIR/cert.pem" ]; then
            echo "[ssl] Installing Let's Encrypt certificate for $DOMAIN"
            cp "${LE_LIVE}/fullchain.pem" "$CERT_DIR/cert.pem"
            cp "${LE_LIVE}/privkey.pem"   "$CERT_DIR/key.pem"
            chmod 600 "$CERT_DIR/key.pem"
        fi
        return 0
    fi

    if [ ! -f "$CERT_DIR/cert.pem" ]; then
        CN="${DOMAIN:-localhost}"
        echo "[ssl] Generating self-signed certificate (CN=$CN)"
        openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
            -keyout "$CERT_DIR/key.pem" \
            -out    "$CERT_DIR/cert.pem" \
            -subj   "/CN=$CN/O=OverTerm/C=CH" 2>/dev/null
        chmod 600 "$CERT_DIR/key.pem"
        echo "[ssl] Self-signed certificate generated"
    fi
    return 1
}

install_cert || true

# Background watcher: re-check every 12 h, reload nginx when LE cert is renewed
if [ -n "$DOMAIN" ]; then
    (while true; do
        sleep 12h
        if install_cert; then
            echo "[ssl] Certificate updated — reloading nginx"
            nginx -s reload 2>/dev/null || true
        fi
    done) &
fi

exec nginx -g "daemon off;"
