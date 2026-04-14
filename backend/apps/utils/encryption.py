"""
Credential Encryption Utility
Encrypts sensitive company credentials (API keys, tokens) before storing in MongoDB.
Uses Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256).
"""
import base64
import logging
import os
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

logger = logging.getLogger(__name__)


def _get_fernet() -> Fernet:
    """Get or auto-generate the Fernet encryption instance."""
    key = getattr(settings, 'ENCRYPTION_KEY', '') or os.environ.get('ENCRYPTION_KEY', '')

    if not key:
        # Auto-generate a key and warn — in production this must be set explicitly
        logger.warning(
            "ENCRYPTION_KEY not set. Auto-generating a key. "
            "Credentials stored now will NOT be recoverable if the server restarts. "
            "Set ENCRYPTION_KEY in your .env for production."
        )
        key = Fernet.generate_key().decode()
        # Cache on settings so at least it's stable within one process lifetime
        settings.ENCRYPTION_KEY = key

    if isinstance(key, str):
        key = key.encode()

    return Fernet(key)


def encrypt_value(plaintext: str) -> str:
    """
    Encrypt a string value for safe storage in MongoDB.
    Returns a base64-encoded encrypted string prefixed with 'enc:'.
    """
    if not plaintext:
        return plaintext
    try:
        f = _get_fernet()
        encrypted = f.encrypt(plaintext.encode())
        return 'enc:' + base64.urlsafe_b64encode(encrypted).decode()
    except Exception as e:
        logger.error(f"Encryption error: {e}")
        raise ValueError("Failed to encrypt credential")


def decrypt_value(ciphertext: str) -> str:
    """
    Decrypt a previously encrypted value.
    Returns the original plaintext string.
    Raises ValueError if decryption fails.
    """
    if not ciphertext:
        return ciphertext
    if not ciphertext.startswith('enc:'):
        # Not encrypted (legacy plain value) — return as-is
        return ciphertext
    try:
        f = _get_fernet()
        raw = base64.urlsafe_b64decode(ciphertext[4:].encode())
        return f.decrypt(raw).decode()
    except InvalidToken:
        logger.error("Decryption failed: invalid token or wrong encryption key")
        raise ValueError("Could not decrypt credential. The encryption key may have changed.")
    except Exception as e:
        logger.error(f"Decryption error: {e}")
        raise ValueError("Failed to decrypt credential")


def mask_value(value: str, show_chars: int = 4) -> str:
    """
    Mask a sensitive value for display in the UI.
    e.g. 'sk_test_abc123xyz' → 'sk_t...xyz'
    """
    if not value or len(value) <= show_chars * 2:
        return '••••••••'
    return value[:show_chars] + '••••••••' + value[-show_chars:]


def encrypt_dict(data: dict, keys_to_encrypt: list) -> dict:
    """Encrypt specific keys in a dict before storage."""
    result = dict(data)
    for key in keys_to_encrypt:
        if result.get(key):
            result[key] = encrypt_value(str(result[key]))
    return result


def decrypt_dict(data: dict, keys_to_decrypt: list) -> dict:
    """Decrypt specific keys from a stored dict."""
    result = dict(data)
    for key in keys_to_decrypt:
        if result.get(key):
            try:
                result[key] = decrypt_value(str(result[key]))
            except ValueError:
                result[key] = None  # Key changed / corrupted
    return result
