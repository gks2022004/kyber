import { ml_kem768 } from '@noble/post-quantum/ml-kem';
import { randomBytes } from '@noble/post-quantum/utils';
import { ed25519 } from '@noble/curves/ed25519';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';

// Helper functions for encoding
const uint8ToBase64 = (arr) => Buffer.from(arr).toString('base64');
const base64ToUint8 = (str) => {
  if (typeof str !== 'string') {
    throw new Error(`base64ToUint8: Expected a base64 string, but got ${typeof str} (${str})`);
  }
  return new Uint8Array(Buffer.from(str, 'base64'));
};

// Generate long-term identity keys for authentication
export function generateIdentityKeys() {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKey: uint8ToBase64(privateKey),
    publicKey: uint8ToBase64(publicKey)
  };
}

// ML-KEM Key Exchange with MITM protection
export class SecureKEM {
  static async generateKeyPair() {
    const seed = randomBytes(64);
    const { publicKey, secretKey } = ml_kem768.keygen(seed);
    return {
      publicKey: uint8ToBase64(publicKey),
      secretKey: uint8ToBase64(secretKey)
    };
  }

  static async encapsulate(theirPublicKey, myPrivateKey) {
    const publicKey = base64ToUint8(theirPublicKey);
    

    const { cipherText, sharedSecret } = ml_kem768.encapsulate(publicKey);

    const signature = ed25519.sign(cipherText, base64ToUint8(myPrivateKey));

    return {
      cipherText: uint8ToBase64(cipherText),
      sharedSecret: uint8ToBase64(sharedSecret),
      signature: uint8ToBase64(signature)
    };
  }

  static async decapsulate(cipherText, secretKey, theirPublicIdentity) {
    const ct = base64ToUint8(cipherText.ct);
    const signature = base64ToUint8(cipherText.sig);

    const isValid = ed25519.verify(signature, ct, base64ToUint8(theirPublicIdentity));
    if (!isValid) throw new Error('Invalid message signature');

    const sk = base64ToUint8(secretKey);
    const sharedSecret = ml_kem768.decapsulate(ct, sk);

    return uint8ToBase64(sharedSecret);
  }
}

// Message Encryption/Decryption using XChaCha20-Poly1305
export class MessageCrypto {
  static encrypt(message, sharedSecret) {
    try {
      const key = base64ToUint8(sharedSecret);
      const nonce = randomBytes(24); // 24-byte nonce for XChaCha20-Poly1305

      if (key.length !== 32) {
        console.error(`Invalid key length: ${key.length}, expected 32`);
        throw new Error('Invalid key length for XChaCha20-Poly1305');
      }

      const chacha = xchacha20poly1305(key,nonce);
      const messageBytes = typeof message === 'string'
        ? new TextEncoder().encode(message)
        : message;

      const ciphertext = chacha.encrypt(messageBytes);

      return {
        nonce: uint8ToBase64(nonce),
        ciphertext: uint8ToBase64(ciphertext)
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw error;
    }
  }

  static decrypt(encrypted, sharedSecret) {
    try {
      const key = base64ToUint8(sharedSecret);
      const nonce = base64ToUint8(encrypted.nonce);
      const ciphertext = base64ToUint8(encrypted.ciphertext);

      if (key.length !== 32) {
        console.error(`Invalid key length: ${key.length}, expected 32`);
        throw new Error('Invalid key length for XChaCha20-Poly1305');
      }

      const chacha = xchacha20poly1305(key, nonce);
      const plaintext = chacha.decrypt(ciphertext);
      if (!plaintext) throw new Error('Decryption failed - message may be tampered');

      return new TextDecoder().decode(plaintext);
    } catch (error) {
      console.error('Decryption error:', error);
      throw error;
    }
  }
}

// Identity Verification Helper
export function verifyIdentity(publicKey, signature, message) {
  try {
    return ed25519.verify(
      base64ToUint8(signature),
      base64ToUint8(message),
      base64ToUint8(publicKey)
    );
  } catch (error) {
    return false;
  }
}
