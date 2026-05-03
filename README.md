# OverTerm

Web-based SSH/SFTP client — a browser replacement for PuTTY and WinSCP.

**Features:** Multi-tab SSH terminals · SFTP file browser · tmux session persistence · 2FA (TOTP) · Proxmox VM auto-sync · Session recording · Quick commands · SSH key management · Group-based access control

## Requirements

- Docker + Docker Compose

## Installation

```bash
git clone https://github.com/drstrangelove52/overterm.git
cd overterm
cp .env.example .env
```

Edit `.env` and set at minimum:

| Variable | Description |
|---|---|
| `DB_ROOT_PASSWORD` | MariaDB root password |
| `DB_PASSWORD` | MariaDB app password |
| `SECRET_KEY` | Random 64-char string for JWT signing |
| `ENCRYPTION_KEY` | Random 32-byte base64 key for credential encryption |
| `FIRST_ADMIN_PASSWORD` | Password for the initial admin account |

Generate keys:
```bash
# SECRET_KEY
openssl rand -hex 32

# ENCRYPTION_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Then start:
```bash
./rebuild.sh
```

The app will be available at **http://localhost** (or https if `DOMAIN` is set).  
API docs: **http://localhost:8000/docs**

## HTTPS (Let's Encrypt)

Set `DOMAIN=yourdomain.com` in `.env`, ensure ports 80 and 443 are open, then start with the `letsencrypt` profile:

```bash
docker compose --profile letsencrypt up -d
```

## Update

```bash
git pull
./rebuild.sh
```

## Default Login

Username: `admin` (or the value of `FIRST_ADMIN_USERNAME`)  
Password: value of `FIRST_ADMIN_PASSWORD`

> The first admin account is only created if no users exist in the database.
