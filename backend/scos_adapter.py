"""
SCOS adapter layer for ISS Digital Twin.
Copied and adapted from SCOS MVP crypto concepts without modifying source product.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from typing import Dict, Any

from nacl.public import Box, PrivateKey, PublicKey
from nacl.signing import SigningKey, VerifyKey


@dataclass
class ScosPacket:
    nonce: str
    ciphertext: str
    signature: str
    sender_pub: str
    algorithm: str = "x25519-box+ed25519"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "nonce": self.nonce,
            "ciphertext": self.ciphertext,
            "signature": self.signature,
            "sender_pub": self.sender_pub,
            "algorithm": self.algorithm,
        }


class ScosSecureChannel:
    """
    Lightweight secure channel:
    - Encrypt: X25519 Box
    - Sign: Ed25519 over (nonce:ciphertext:sender_pub)
    """

    def __init__(self, seed: str = "iss-dt-scos-seed"):
        seed_hash = hashlib.sha256(seed.encode("utf-8")).digest()
        # Derive deterministic keys for demo reproducibility
        self._signing = SigningKey(seed_hash)
        self.verify_key = self._signing.verify_key

        enc_seed = hashlib.sha256((seed + ":enc").encode("utf-8")).digest()
        self._private = PrivateKey(enc_seed)
        self.public_key = self._private.public_key

    def encrypt(self, payload: str) -> ScosPacket:
        plaintext = payload.encode("utf-8")
        # Ephemeral sender key
        eph_private = PrivateKey.generate()
        eph_public = eph_private.public_key
        box = Box(eph_private, self.public_key)
        encrypted = box.encrypt(plaintext)
        nonce_b64 = base64.b64encode(encrypted.nonce).decode("utf-8")
        cipher_b64 = base64.b64encode(encrypted.ciphertext).decode("utf-8")
        sender_pub_b64 = base64.b64encode(bytes(eph_public)).decode("utf-8")

        signed_blob = f"{nonce_b64}:{cipher_b64}:{sender_pub_b64}".encode("utf-8")
        sig = self._signing.sign(signed_blob).signature
        sig_b64 = base64.b64encode(sig).decode("utf-8")
        return ScosPacket(
            nonce=nonce_b64,
            ciphertext=cipher_b64,
            signature=sig_b64,
            sender_pub=sender_pub_b64,
        )

    def decrypt(self, packet: Dict[str, str]) -> str:
        nonce_b64 = packet["nonce"]
        cipher_b64 = packet["ciphertext"]
        sig_b64 = packet["signature"]
        sender_pub_b64 = packet["sender_pub"]

        signed_blob = f"{nonce_b64}:{cipher_b64}:{sender_pub_b64}".encode("utf-8")
        VerifyKey(bytes(self.verify_key)).verify(signed_blob, base64.b64decode(sig_b64))

        sender_pub = PublicKey(base64.b64decode(sender_pub_b64))
        box = Box(self._private, sender_pub)
        plaintext = box.decrypt(base64.b64decode(cipher_b64), base64.b64decode(nonce_b64))
        return plaintext.decode("utf-8", errors="replace")

