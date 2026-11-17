// App-adapter voor Vaste Lasten. De cryptografie en replaybescherming komen uit PWA-Core.
import {
  createPairingPayload,
  openPairingPayload,
  markPairingUsed,
  DEVICE_PAIRING_TTL_MS,
} from './core/device-pairing.js';

const CONTEXT = 'vaste-lasten/device-pairing/v1';
const USED_KEY = 'vastelasten.v3.pairing.used';

function validatePairingData(profile, token) {
  if (!profile || typeof profile !== 'object') throw new Error('De koppelgegevens ontbreken.');
  if (typeof profile.workspaceId !== 'string' || !/^[a-f0-9-]{8,64}$/i.test(profile.workspaceId)) throw new Error('De workspace-code is ongeldig.');
  if (typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 60) throw new Error('De administratienaam is ongeldig.');
  if (typeof profile.owner !== 'string' || !/^[A-Za-z0-9-]+$/.test(profile.owner)) throw new Error('De GitHub-eigenaar is ongeldig.');
  if (typeof profile.repo !== 'string' || !/^[A-Za-z0-9._-]+$/.test(profile.repo)) throw new Error('De GitHub-repository is ongeldig.');
  if (!['p1', 'p2'].includes(profile.me)) throw new Error('De gebruikersrol is ongeldig.');
  if (typeof token !== 'string' || !token || token.length > 500) throw new Error('De GitHub-token ontbreekt of is ongeldig.');
}

export async function createPairingQrPayload({ profile, token, passwords, now = Date.now() }) {
  validatePairingData(profile, token);
  const created = await createPairingPayload({
    data: { profile, token },
    secrets: [passwords?.shared, passwords?.personal],
    context: CONTEXT,
    now,
  });
  return { payload: created.payload, expiresAt: created.expiresAt, nonce: created.pairingId };
}

export async function openPairingQrPayload(payload, passwords, now = Date.now()) {
  const opened = await openPairingPayload({
    payload,
    secrets: [passwords?.shared, passwords?.personal],
    context: CONTEXT,
    now,
  });
  validatePairingData(opened.data?.profile, opened.data?.token);
  return {
    profile: opened.data.profile,
    token: opened.data.token,
    nonce: opened.pairingId,
    expiresAt: opened.expiresAt,
  };
}

export function markPairingNonceUsed(storage, nonce, now = Date.now()) {
  markPairingUsed(storage, nonce, { storageKey: USED_KEY, now });
}

export const PAIRING_QR_TTL_MS = DEVICE_PAIRING_TTL_MS;
