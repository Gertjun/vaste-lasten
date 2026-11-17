const VERSION = 1;
const PREFIX = 'VASTELASTEN-PAIR-1:';
const TTL_MS = 3 * 60 * 1000;
const KDF_ITERATIONS = 600000;
const MAX_QR_CHARS = 2200;
const USED_KEY = 'vastelasten.v3.pairing.used';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64UrlToBytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Ongeldige QR-code.');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}
function pairingPasswordMaterial(shared, personal) {
  if (typeof shared !== 'string' || !shared || typeof personal !== 'string' || !personal) {
    throw new Error('Vul beide kluiswachtwoorden in.');
  }
  const a = encoder.encode(shared);
  const b = encoder.encode(personal);
  const material = new Uint8Array(8 + a.length + b.length);
  const view = new DataView(material.buffer);
  view.setUint32(0, a.length, false);
  material.set(a, 4);
  view.setUint32(4 + a.length, b.length, false);
  material.set(b, 8 + a.length);
  return material;
}
async function derivePairingKey(passwords, salt) {
  const material = pairingPasswordMaterial(passwords?.shared, passwords?.personal);
  const base = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey']);
  material.fill(0);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: KDF_ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
function validateProfile(profile, token) {
  if (!profile || typeof profile !== 'object') throw new Error('De koppelgegevens ontbreken.');
  if (typeof profile.workspaceId !== 'string' || !/^[a-f0-9-]{8,64}$/i.test(profile.workspaceId)) throw new Error('De workspace-code is ongeldig.');
  if (typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 60) throw new Error('De administratienaam is ongeldig.');
  if (typeof profile.owner !== 'string' || !/^[A-Za-z0-9-]+$/.test(profile.owner)) throw new Error('De GitHub-eigenaar is ongeldig.');
  if (typeof profile.repo !== 'string' || !/^[A-Za-z0-9._-]+$/.test(profile.repo)) throw new Error('De GitHub-repository is ongeldig.');
  if (!['p1', 'p2'].includes(profile.me)) throw new Error('De gebruikersrol is ongeldig.');
  if (typeof token !== 'string' || !token || token.length > 500) throw new Error('De GitHub-token ontbreekt of is ongeldig.');
}
export async function createPairingQrPayload({ profile, token, passwords, now = Date.now() }) {
  validateProfile(profile, token);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const nonce = bytesToBase64Url(randomBytes(16));
  const expiresAt = now + TTL_MS;
  const key = await derivePairingKey(passwords, salt);
  const plaintext = encoder.encode(JSON.stringify({
    version: VERSION,
    profile: {
      workspaceId: profile.workspaceId,
      name: profile.name,
      owner: profile.owner,
      repo: profile.repo,
      me: profile.me,
    },
    token,
    nonce,
    issuedAt: now,
    expiresAt,
  }));
  const additionalData = encoder.encode(PREFIX + expiresAt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
    key,
    plaintext,
  );
  plaintext.fill(0);
  const payload = PREFIX + bytesToBase64Url(encoder.encode(JSON.stringify({
    version: VERSION,
    expiresAt,
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  })));
  if (payload.length > MAX_QR_CHARS) throw new Error('De koppelcode is te groot voor een betrouwbare QR-scan.');
  return { payload, expiresAt, nonce };
}
export async function openPairingQrPayload(payload, passwords, now = Date.now()) {
  if (typeof payload !== 'string' || !payload.startsWith(PREFIX) || payload.length > MAX_QR_CHARS) throw new Error('Dit is geen geldige Vaste Lasten-koppelcode.');
  let envelope;
  try { envelope = JSON.parse(decoder.decode(base64UrlToBytes(payload.slice(PREFIX.length)))); }
  catch { throw new Error('De QR-code is beschadigd of onvolledig.'); }
  if (envelope?.version !== VERSION || !Number.isSafeInteger(envelope.expiresAt)) throw new Error('Deze koppelcode wordt niet ondersteund.');
  if (envelope.expiresAt < now) throw new Error('Deze QR-code is verlopen. Maak op de laptop een nieuwe code.');
  if (envelope.expiresAt > now + TTL_MS + 30000) throw new Error('De geldigheidsduur van deze QR-code klopt niet.');
  const salt = base64UrlToBytes(envelope.salt);
  const iv = base64UrlToBytes(envelope.iv);
  const ciphertext = base64UrlToBytes(envelope.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17 || ciphertext.length > 1600) throw new Error('De koppelcode heeft een ongeldige inhoud.');
  const key = await derivePairingKey(passwords, salt);
  let decoded;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(PREFIX + envelope.expiresAt), tagLength: 128 },
      key,
      ciphertext,
    );
    decoded = JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error('De twee wachtwoorden horen niet bij deze koppelcode, of de code is beschadigd.');
  }
  if (decoded?.version !== VERSION || decoded.expiresAt !== envelope.expiresAt ||
      !Number.isSafeInteger(decoded.issuedAt) || decoded.issuedAt > now + 30000 ||
      typeof decoded.nonce !== 'string' || !/^[A-Za-z0-9_-]{20,30}$/.test(decoded.nonce)) {
    throw new Error('De inhoud van de koppelcode is ongeldig.');
  }
  if (now - decoded.issuedAt > TTL_MS || decoded.expiresAt - decoded.issuedAt !== TTL_MS) {
    throw new Error('Deze QR-code is verlopen. Maak op de laptop een nieuwe code.');
  }
  validateProfile(decoded.profile, decoded.token);
  return { profile: decoded.profile, token: decoded.token, nonce: decoded.nonce, expiresAt: decoded.expiresAt };
}
export function markPairingNonceUsed(storage, nonce, now = Date.now()) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error('Lokale opslag is niet beschikbaar.');
  if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{20,30}$/.test(nonce)) throw new Error('De koppelcode heeft een ongeldige eenmalige sleutel.');
  let entries = [];
  try { entries = JSON.parse(storage.getItem(USED_KEY) || '[]'); } catch { entries = []; }
  if (!Array.isArray(entries)) entries = [];
  entries = entries.filter(entry => entry && Number.isSafeInteger(entry.usedAt) && now - entry.usedAt < 10 * 60 * 1000);
  if (entries.some(entry => entry.nonce === nonce)) throw new Error('Deze QR-code is op dit apparaat al gebruikt. Maak op de laptop een nieuwe code.');
  entries.push({ nonce, usedAt: now });
  storage.setItem(USED_KEY, JSON.stringify(entries.slice(-20)));
}
export const PAIRING_QR_TTL_MS = TTL_MS;
