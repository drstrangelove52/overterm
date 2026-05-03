#!/usr/bin/env python3
"""
OverTerm Management CLI — run from inside the backend container:

  docker compose exec backend python manage.py list-users
  docker compose exec backend python manage.py reset-password <username>
  docker compose exec backend python manage.py disable-totp <username>
  docker compose exec backend python manage.py activate-user <username>
"""
import argparse
import asyncio
import getpass
import sys


async def _list_users():
    from sqlalchemy import select
    from models.database import AsyncSessionLocal
    from models.models import User

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).order_by(User.username))
        users = result.scalars().all()

    print(f"\n{'Benutzername':<22} {'Admin':<8} {'Aktiv':<8} {'2FA':<6}")
    print("─" * 48)
    for u in users:
        print(
            f"{u.username:<22}"
            f"{'ja' if u.is_admin else 'nein':<8}"
            f"{'ja' if u.is_active else 'nein':<8}"
            f"{'ja' if u.totp_enabled else 'nein':<6}"
        )
    print()


async def _reset_password(username: str):
    from sqlalchemy import select
    from passlib.context import CryptContext
    from models.database import AsyncSessionLocal
    from models.models import User

    pwd = getpass.getpass(f"Neues Passwort für '{username}': ")
    pwd2 = getpass.getpass("Bestätigung: ")
    if pwd != pwd2:
        print("Fehler: Passwörter stimmen nicht überein.", file=sys.stderr)
        sys.exit(1)
    if len(pwd) < 8:
        print("Fehler: Mindestens 8 Zeichen erforderlich.", file=sys.stderr)
        sys.exit(1)

    ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if not user:
            print(f"Fehler: Benutzer '{username}' nicht gefunden.", file=sys.stderr)
            sys.exit(1)
        user.password_hash = ctx.hash(pwd)
        await db.commit()
    print(f"Passwort für '{username}' wurde zurückgesetzt.")


async def _disable_totp(username: str):
    from sqlalchemy import select
    from models.database import AsyncSessionLocal
    from models.models import User

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if not user:
            print(f"Fehler: Benutzer '{username}' nicht gefunden.", file=sys.stderr)
            sys.exit(1)
        user.totp_secret = None
        user.totp_enabled = False
        user.totp_recovery_codes = None
        await db.commit()
    print(f"2FA für '{username}' wurde deaktiviert.")


async def _activate_user(username: str):
    from sqlalchemy import select
    from models.database import AsyncSessionLocal
    from models.models import User

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if not user:
            print(f"Fehler: Benutzer '{username}' nicht gefunden.", file=sys.stderr)
            sys.exit(1)
        was_active = user.is_active
        user.is_active = True
        await db.commit()
    if was_active:
        print(f"Benutzer '{username}' war bereits aktiv.")
    else:
        print(f"Benutzer '{username}' wurde aktiviert.")


def main():
    parser = argparse.ArgumentParser(
        description="OverTerm Management CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("list-users", help="Alle Benutzer anzeigen")

    p = sub.add_parser("reset-password", help="Passwort zurücksetzen")
    p.add_argument("username", help="Benutzername")

    p = sub.add_parser("disable-totp", help="2FA deaktivieren")
    p.add_argument("username", help="Benutzername")

    p = sub.add_parser("activate-user", help="Deaktivierten Benutzer aktivieren")
    p.add_argument("username", help="Benutzername")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    if args.command == "list-users":
        asyncio.run(_list_users())
    elif args.command == "reset-password":
        asyncio.run(_reset_password(args.username))
    elif args.command == "disable-totp":
        asyncio.run(_disable_totp(args.username))
    elif args.command == "activate-user":
        asyncio.run(_activate_user(args.username))


if __name__ == "__main__":
    main()
