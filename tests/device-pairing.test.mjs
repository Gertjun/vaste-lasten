import test from 'node:test';
import assert from 'node:assert/strict';
import { createPairingQrPayload, openPairingQrPayload, markPairingNonceUsed, PAIRING_QR_TTL_MS } from '../js/device-pairing.js';

const profile = {
  workspaceId: 'a20c1a05-36b8-4b60-849d-5fe0dc516c61',
  name: 'Persoonlijke administratie G',
  owner: 'Gertjun',
  repo: 'SyncData',
  me: 'p1',
};
const passwords = { shared: 'gezamenlijk-wachtwoord-voorbeeld', personal: 'persoonlijk-wachtwoord-voorbeeld' };
const token = 'test-github-access-token-placeholder';
const now = 1_800_000_000_000;

test('QR-payload bevat instellingen versleuteld en is met beide wachtwoorden te openen', async () => {
  const created = await createPairingQrPayload({ profile, token, passwords, now });
  assert.ok(created.payload.startsWith('VASTELASTEN-PAIR-1:'));
  assert.equal(created.expiresAt, now + PAIRING_QR_TTL_MS);
  assert.ok(!created.payload.includes(token));
  assert.ok(!created.payload.includes(passwords.shared));
  assert.ok(!created.payload.includes(passwords.personal));
  const opened = await openPairingQrPayload(created.payload, passwords, now + 1000);
  assert.deepEqual(opened.profile, profile);
  assert.equal(opened.token, token);
  assert.equal(opened.nonce, created.nonce);
});

test('beide wachtwoorden zijn vereist en een verkeerd wachtwoord wordt geweigerd', async () => {
  const created = await createPairingQrPayload({ profile, token, passwords, now });
  await assert.rejects(openPairingQrPayload(created.payload, { shared: passwords.shared, personal: '' }, now), /beide kluiswachtwoorden/);
  await assert.rejects(openPairingQrPayload(created.payload, { shared: 'fout', personal: passwords.personal }, now), /wachtwoorden horen niet/);
});

test('verlopen, beschadigde en gemanipuleerde QR-codes worden geweigerd', async () => {
  const created = await createPairingQrPayload({ profile, token, passwords, now });
  await assert.rejects(openPairingQrPayload(created.payload, passwords, created.expiresAt + 1), /verlopen/);
  await assert.rejects(openPairingQrPayload(created.payload + 'x', passwords, now), /ongeldige|beschadigd/);
});

test('een QR-nonce kan op hetzelfde apparaat maar één keer worden geaccepteerd', async () => {
  const created = await createPairingQrPayload({ profile, token, passwords, now });
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  markPairingNonceUsed(storage, created.nonce, now);
  assert.throws(() => markPairingNonceUsed(storage, created.nonce, now + 1000), /al gebruikt/);
  assert.doesNotThrow(() => markPairingNonceUsed(storage, 'abcdefghijklmno_12345', now + 11 * 60 * 1000));
});
