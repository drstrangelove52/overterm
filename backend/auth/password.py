from passlib.context import CryptContext

# argon2 for new hashes; bcrypt still verifiable so existing user passwords
# (hashed before this migration) keep working without a forced reset.
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="bcrypt")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def verify_and_upgrade(password: str, hashed: str) -> tuple[bool, str | None]:
    """Verifies against any supported scheme; returns a re-hashed value to
    persist if the stored hash used a deprecated scheme (bcrypt), else None."""
    return pwd_context.verify_and_update(password, hashed)
