# OverTerm

Web-based SSH/SFTP client — a browser replacement for PuTTY and WinSCP.

**Features:** Multi-tab SSH terminals · SFTP file browser · tmux session persistence · 2FA (TOTP) · Proxmox VM auto-sync · Session recording · Quick commands · SSH key management · Group-based access control

## Auf einer VM installieren (automatisiert)

```bash
git clone https://github.com/drstrangelove52/overterm.git
cd overterm
./install.sh
```

Installiert Docker + Tailscale, generiert `.env` mit zufälligen Secrets, baut und
startet den Stack und richtet Tailscale-HTTPS ein. Siehe Kommentar am Kopf von
`install.sh` für optionale Umgebungsvariablen (`TAILSCALE_AUTHKEY`, `ADMIN_USERNAME`,
`ADMIN_PASSWORD`, `LAN_IP`, …). Idempotent — `git pull && ./install.sh` ist auch der
Update-Workflow.

**Wichtig:** `install.sh` generiert Secrets nur, wenn `.env` noch nicht existiert.
`ENCRYPTION_KEY` darin verschlüsselt gespeicherte SSH-Zugangsdaten direkt in der
Datenbank — `.env` auf einer VM mit echten Daten niemals löschen/neu generieren lassen,
sonst werden alle gespeicherten Passwörter/Keys/Passphrasen unlesbar.

## Lokal starten (manuell)

```bash
cp .env.example .env
# .env anpassen (DB-Passwörter, SECRET_KEY, ENCRYPTION_KEY, LAN_IP)
docker compose up --build -d
```

Frontend: `https://<LAN_IP>` (selbstsigniertes Zertifikat, Browser-Warnung beim ersten Aufruf bestätigen; HTTP leitet automatisch auf HTTPS um)
Backend-API: `https://<LAN_IP>/api` (via Caddy/Nginx-Proxy)
API-Dokumentation: `https://<LAN_IP>/docs`

## HTTPS einrichten

### Mit Caddy (LAN-Direktzugriff)

Das mitgelieferte `Caddyfile` terminiert HTTPS für die per `LAN_IP` übergebene Adresse:

```caddy
{
	default_sni {$LAN_IP}
}

https://{$LAN_IP} {
    tls internal
    reverse_proxy frontend:80
}
```

**Wichtig:** `default_sni {$LAN_IP}` ist zwingend nötig. curl und die meisten
RFC-6066-konformen Clients (inkl. Tailscale) senden bei einer nackten IP kein SNI — ohne
`default_sni` fällt Caddy dann auf die interne Docker-Bridge-IP zurück und findet nie ein
passendes Zertifikat (`internal_error`-Handshake-Abbruch, live bei der overbudget-Migration
gefunden und hier direkt vorweggenommen).

### Mit Tailscale (empfohlen, macht `install.sh` automatisch)

`install.sh` installiert Tailscale, verbindet die VM mit dem Tailnet und richtet
`tailscale serve` ein — echtes, öffentlich vertrauenswürdiges Zertifikat fürs Tailnet,
kein offener Port nötig:

```bash
sudo tailscale serve --bg "https+insecure://${LAN_IP}:443"
```

Ersetzt den früheren öffentlichen Let's-Encrypt/certbot-Weg — SSH-Zugriff unterwegs läuft
jetzt über die Tailscale-App statt über eine öffentliche Domain.

## Update

```bash
git pull
./install.sh
```

## Authentifizierung

Session-Cookie (httpOnly, `SameSite=Lax`), gesetzt via `POST /api/auth/login`. Passwort-Hashing:
Argon2 für neue/geänderte Passwörter, bestehende bcrypt-Hashes bleiben gültig und werden beim
nächsten erfolgreichen Login transparent auf Argon2 migriert. Rate-Limiting auf `/api/auth/login`
(10 Versuche/Minute pro IP). 2FA (TOTP) optional pro User, mit Recovery-Codes.

## Default Login

Username: `admin` (or the value of `FIRST_ADMIN_USERNAME`)
Password: value of `FIRST_ADMIN_PASSWORD`

> The first admin account is only created if no users exist in the database.
