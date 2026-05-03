import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from core.config import settings


def _get_key() -> bytes:
    if settings.encryption_key and settings.encryption_key.strip():
        try:
            return base64.b64decode(settings.encryption_key)
        except Exception:
            pass
    # Derive a stable key from secret_key for dev (not for production)
    import hashlib
    return hashlib.sha256(settings.secret_key.encode()).digest()


def encrypt(plaintext: str) -> str:
    """Encrypt a string, return base64-encoded nonce+ciphertext."""
    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ct).decode()


def decrypt(token: str) -> str:
    """Decrypt a base64-encoded nonce+ciphertext string."""
    key = _get_key()
    aesgcm = AESGCM(key)
    raw = base64.b64decode(token)
    nonce, ct = raw[:12], raw[12:]
    return aesgcm.decrypt(nonce, ct, None).decode()
