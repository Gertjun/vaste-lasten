// App-eigen biometrische sleutelbundel voor de twee actieve Vaste Lasten-kluizen.
// PWA-Core blijft ongewijzigd: deze wrapper geeft de bundelsleutel expliciet
// wrapKey/unwrapKey-rechten, terwijl de afzonderlijke vault-DEK's encrypt/decrypt houden.
import { randomBytes, secretKey, wrapDataKey, bytesToB64, b64ToBytes } from './core/crypto.js';

const encoder = new TextEncoder();

export function generateBundleKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['wrapKey', 'unwrapKey'],
  );
}

export function wrapVaultKey(vaultKey, bundleKey) {
  return wrapDataKey(vaultKey, bundleKey);
}

export function unwrapVaultKey(wrapped, bundleKey) {
  return crypto.subtle.unwrapKey(
    'raw',
    b64ToBytes(wrapped.data),
    bundleKey,
    { name: 'AES-GCM', iv: b64ToBytes(wrapped.iv) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export function unwrapBundleKey(wrapped, passkeyKek) {
  return crypto.subtle.unwrapKey(
    'raw',
    b64ToBytes(wrapped.data),
    passkeyKek,
    { name: 'AES-GCM', iv: b64ToBytes(wrapped.iv) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['wrapKey', 'unwrapKey'],
  );
}

/** Herkent app-eigen, gestructureerde WebAuthn userHandles bij opnieuw koppelen. */
export function isForeignUserHandle(userHandle, allowedPrefixes = []) {
  if (!userHandle || userHandle.byteLength === 0) return false;
  const id = new Uint8Array(userHandle);
  const colon = id.indexOf(0x3a);
  // Oude credentials gebruikten een willekeurige userHandle; die blijven koppelbaar.
  if (colon < 1 || colon > 40) return false;
  return !allowedPrefixes.some((prefix) => {
    if (typeof prefix !== 'string' || !prefix) return false;
    const tag = encoder.encode(`${prefix}:`);
    return id.length >= tag.length && tag.every((byte, index) => id[index] === byte);
  });
}

export function createBundleBiometric({
  storagePrefix,
  appName = 'Vaste Lasten',
  storage = globalThis.localStorage,
  allowedUserHandlePrefixes = [storagePrefix],
} = {}) {
  if (typeof storagePrefix !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(storagePrefix)) {
    throw new TypeError('storagePrefix is ongeldig.');
  }
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    throw new TypeError('storage voldoet niet aan het Storage-contract.');
  }

  const storeKey = `${storagePrefix}:biometric-bundle`;
  const prfLabel = `${storagePrefix}:biometric-bundle-prf:v1`;
  const hkdfInfo = `${storagePrefix}:biometric-bundle-kek:v1`;
  const userTag = encoder.encode(`${storagePrefix}:`);
  const acceptedUserHandlePrefixes = [...new Set([storagePrefix, ...allowedUserHandlePrefixes])];


  async function prfSalt() {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(prfLabel)));
  }

  function readSecret(value) {
    const bytes = value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : null;
    if (!bytes || bytes.byteLength !== 32) {
      throw new Error('Deze passkey leverde geen geldig PRF-resultaat. Ontgrendel met beide wachtwoorden.');
    }
    return bytes;
  }

  async function evaluate(credentialId, salt) {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: credentialId }],
        userVerification: 'required',
        timeout: 60_000,
        extensions: { prf: { eval: { first: salt } } },
      },
    });
    return readSecret(assertion.getClientExtensionResults().prf?.results?.first);
  }

  async function store(bundleKey, credentialId, salt, secret) {
    const hkdfSalt = randomBytes(32);
    const kek = await secretKey(secret, hkdfSalt, hkdfInfo);
    const wrapped = await wrapDataKey(bundleKey, kek);
    storage.setItem(storeKey, JSON.stringify({
      credentialId: bytesToB64(credentialId),
      prfSalt: bytesToB64(salt),
      hkdfSalt: bytesToB64(hkdfSalt),
      wrapped,
    }));
  }

  async function enroll(bundleKey) {
    const salt = await prfSalt();
    const userId = new Uint8Array(userTag.length + 16);
    userId.set(userTag);
    userId.set(randomBytes(16), userTag.length);
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: appName },
        user: { id: userId, name: `${appName} – gezamenlijke ontgrendeling`, displayName: appName },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        timeout: 60_000,
        extensions: { prf: { eval: { first: salt } } },
      },
    });
    const ext = credential.getClientExtensionResults();
    if (ext.prf?.enabled === false) throw new Error('Deze passkey ondersteunt PRF niet. Gebruik de wachtwoorden.');
    const secret = ext.prf?.results?.first
      ? readSecret(ext.prf.results.first)
      : await evaluate(new Uint8Array(credential.rawId), salt);
    await store(bundleKey, new Uint8Array(credential.rawId), salt, secret);
  }

  async function enrollExisting(bundleKey) {
    const salt = await prfSalt();
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        userVerification: 'required',
        timeout: 60_000,
        extensions: { prf: { eval: { first: salt } } },
      },
    });
    if (isForeignUserHandle(assertion.response?.userHandle, acceptedUserHandlePrefixes)) {
      throw new Error(`Deze passkey hoort bij een andere app. Kies een passkey voor ${appName}.`);
    }
    const secret = readSecret(assertion.getClientExtensionResults().prf?.results?.first);
    await store(bundleKey, new Uint8Array(assertion.rawId), salt, secret);
  }

  async function unlock() {
    let record;
    try { record = JSON.parse(storage.getItem(storeKey) || 'null'); } catch { record = null; }
    if (!record?.credentialId || !record?.prfSalt || !record?.hkdfSalt || !record?.wrapped) {
      throw new Error('De lokale passkeybundel ontbreekt of is beschadigd. Ontgrendel met beide wachtwoorden en koppel de passkey opnieuw.');
    }
    const secret = await evaluate(b64ToBytes(record.credentialId), b64ToBytes(record.prfSalt));
    const kek = await secretKey(secret, b64ToBytes(record.hkdfSalt), hkdfInfo);
    try {
      return await unwrapBundleKey(record.wrapped, kek);
    } catch {
      throw new Error('De passkeybundel kon niet worden geopend. Ontgrendel met beide wachtwoorden en koppel de passkey opnieuw.');
    }
  }

  return {
    isEnrolled: () => storage.getItem(storeKey) !== null,
    enroll,
    enrollExisting,
    unlock,
    disable: () => storage.removeItem(storeKey),
  };
}
