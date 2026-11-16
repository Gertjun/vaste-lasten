// App-adapter voor de drie onafhankelijke Vaste Lasten-domeinen.
import * as coreCrypto from './core/crypto.js';
// De Core-factories worden geïnjecteerd zodat de domeinregels afzonderlijk testbaar blijven.

export const VAULT_DOMAINS = Object.freeze({
  shared: Object.freeze({
    storagePrefix: 'vaste-lasten-shared',
    path: 'pwa-core-v1/samen.json',
    domain: 'shared',
  }),
  'personal-p1': Object.freeze({
    storagePrefix: 'vaste-lasten-personal-p1',
    path: 'pwa-core-v1/eigen-p1.json',
    domain: 'personal-p1',
  }),
  'personal-p2': Object.freeze({
    storagePrefix: 'vaste-lasten-personal-p2',
    path: 'pwa-core-v1/eigen-p2.json',
    domain: 'personal-p2',
  }),
});

const clone = (value) => structuredClone(value ?? {});
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Fail closed when an expected legacy JSON is absent from the configured private repository. */
export function requireLegacyEnvelope({ env, file, owner, repo } = {}) {
  if (env) return env;
  const target = owner && repo ? `${owner}/${repo}` : 'de ingestelde privérepository';
  throw new Error(`Het bestaande legacybestand ${file || '(onbekend bestand)'} ontbreekt in ${target}. Controleer de repository; de migratie is gestopt voordat er iets is geschreven.`);
}

function assertDomainId(id) {
  if (!Object.hasOwn(VAULT_DOMAINS, id)) throw new TypeError(`Onbekend gegevensdomein: ${id}`);
}

/** Splitst de oude lokale {samen,eigen}-state zonder privévelden te kopiëren. */
export function splitLegacyState(state, me) {
  if (!['p1', 'p2'].includes(me)) throw new TypeError('Persoon moet p1 of p2 zijn.');
  if (!isRecord(state) || !isRecord(state.samen) || !isRecord(state.eigen)) {
    throw new TypeError('De bestaande lokale gegevens hebben geen herkenbare {samen,eigen}-structuur.');
  }

  const shared = clone(state.samen);
  for (const key of ['prof', 'scen']) delete shared[key];

  const personal = clone(state.eigen);
  for (const key of ['meta', 'cats', 'inc', 'settle']) delete personal[key];

  return {
    shared: { ...shared, schema: 2, domain: 'shared' },
    [`personal-${me}`]: { ...personal, schema: 2, domain: `personal-${me}` },
  };
}

export function validateDomainPayload(payload, id) {
  assertDomainId(id);
  if (!isRecord(payload) || ![1, 2].includes(payload.schema) || payload.domain !== VAULT_DOMAINS[id].domain) {
    throw new Error(`De inhoud van de kluis hoort niet bij het domein ${id} of heeft een onbekend schema.`);
  }
  const forbidden = id === 'shared' ? ['prof', 'scen'] : ['meta', 'cats', 'inc', 'settle'];
  if (forbidden.some((key) => Object.hasOwn(payload, key))) {
    throw new Error(`De kluis ${id} bevat velden buiten het toegestane gegevensdomein.`);
  }
  return payload;
}

/** Behoudt de bestaande app-merge, maar dwingt domeingrenzen af. */
export function mergeDomainPayload(local, remote, id, mergeStore) {
  validateDomainPayload(local, id);
  validateDomainPayload(remote, id);
  if (typeof mergeStore !== 'function') throw new TypeError('De bestaande app-mergefunctie ontbreekt.');
  const merged = mergeStore(local, remote);
  if (!isRecord(merged)) throw new Error('De samenvoeging leverde geen geldig gegevensobject op.');
  // De bestaande app-merge start met EMPTY(), dat standaard meta:null bevat.
  // Dat lege standaardveld mag niet alsnog in een persoonlijk Core-domein belanden.
  const forbidden = id === 'shared' ? ['prof', 'scen'] : ['meta', 'cats', 'inc', 'settle'];
  for (const key of forbidden) if (Object.hasOwn(merged, key) && merged[key] == null) delete merged[key];
  return validateDomainPayload({ ...merged, schema: 2, domain: VAULT_DOMAINS[id].domain }, id);
}

/** Maakt alle drie de instanties aan; alleen shared + eigen persoonlijk worden ontgrendeld. */
export function createVaultRegistry({
  createVault, createSync, createSessionLock, createBiometric,
  storage = globalThis.localStorage, kdfIterations = 600000, appName = 'Vaste Lasten',
} = {}) {
  for (const [name, fn] of Object.entries({ createVault, createSync, createSessionLock, createBiometric })) {
    if (typeof fn !== 'function') throw new TypeError(`${name} ontbreekt.`);
  }
  const registry = {};
  try {
    for (const [id, spec] of Object.entries(VAULT_DOMAINS)) {
      const vault = createVault({ storagePrefix: spec.storagePrefix, kdfIterations, storage });
      registry[id] = { vault, path: spec.path, storage };
      registry[id].sync = createSync({ vault, appName });
      registry[id].lock = createSessionLock({ storagePrefix: spec.storagePrefix });
      registry[id].biometric = createBiometric({ storagePrefix: spec.storagePrefix, appName, storage });
    }
    return registry;
  } catch (error) {
    for (const entry of Object.values(registry)) {
      try { entry.vault.lock?.(); } catch { /* behoud de oorspronkelijke fout */ }
      try { void entry.vault.dispose?.(); } catch { /* behoud de oorspronkelijke fout */ }
    }
    throw error;
  }
}

/** Verkrijgt de twee benodigde locks; bij gedeeltelijk succes wordt teruggedraaid. */
export async function acquireActiveLocks(registry, me) {
  if (!['p1', 'p2'].includes(me)) throw new TypeError('Persoon moet p1 of p2 zijn.');
  const ids = ['shared', `personal-${me}`];
  const handles = [];
  try {
    for (const id of ids) {
      const handle = await registry[id].lock.acquireSessionLock();
      if (!handle) throw new Error('Deze kluis is al ontgrendeld in een ander tabblad. Vergrendel of sluit dat tabblad eerst.');
      handles.push(handle);
    }
    return {
      async release() {
        // Eerst alle lokale writes bevestigen; bij een fout blijven de locks vast.
        for (const id of ids) await registry[id].vault.flush();
        // Pas daarna de ontsleutelde data uit geheugen verwijderen.
        for (const id of ids) registry[id].vault.lock();
        for (const handle of [...handles].reverse()) await handle.release();
      },
    };
  } catch (error) {
    for (const handle of [...handles].reverse()) {
      try { await handle.release(); } catch { /* behoud de oorspronkelijke fout */ }
    }
    throw error;
  }
}

const keyMismatch = (error) => /met een andere sleutel versleuteld/i.test(error?.message || '');

/**
 * Ontgrendelt/importeren, voegt lokale legacygegevens samen en synchroniseert één domein.
 * createClient is uitsluitend voor preflight en herstel bij een race om de eerste upload.
 */
export async function openAndSyncDomain({
  id, password, legacyData, registry, settings, createClient, mergeStore, canonicalize = JSON.stringify,
  allowCreate = true,
} = {}) {
  assertDomainId(id);
  if (!password) throw new Error(`Het wachtwoord voor ${id} ontbreekt.`);
  if (!registry?.[id]) throw new TypeError(`De kluisinstantie voor ${id} ontbreekt.`);
  if (typeof createClient !== 'function') throw new TypeError('De GitHub-client ontbreekt.');
  validateDomainPayload(legacyData, id);

  const entry = registry[id];
  const remoteSettings = { ...settings, path: VAULT_DOMAINS[id].path };
  const client = createClient(remoteSettings);
  const remote = await client.getFile();

  if (entry.vault.hasVault()) {
    if (!remote && !allowCreate) {
      throw new Error(`Het remote Core-bestand voor ${id} ontbreekt. De bestaande lokale kluis wordt niet automatisch opnieuw gepubliceerd.`);
    }
    try {
      await entry.vault.unlockWithPassword(password);
    } catch (unlockError) {
      // Een ander apparaat kan het wachtwoord hebben gewijzigd terwijl de DEK
      // gelijk bleef. Open dan de remote envelope met het nieuwe wachtwoord,
      // ontsleutel de oude lokale payload met diezelfde DEK en merge vóór sync.
      const vaultKey = entry.vault.KEYS?.vault;
      const storage = entry.storage || globalThis.localStorage;
      const localRaw = vaultKey && storage?.getItem?.(vaultKey);
      let localEnvelope = null;
      try { localEnvelope = localRaw ? JSON.parse(localRaw) : null; } catch { /* behoud unlockError */ }
      if (!remote || !localEnvelope) throw unlockError;
      await entry.vault.importEnvelope(remote.envelope, password);
      try {
        const localData = await entry.vault.decryptRemote(localEnvelope);
        entry.vault.setSyncMeta({ ...entry.vault.getSyncMeta(), sha: remote.sha, dirty: false });
        const remoteData = entry.vault.getData();
        const preserved = mergeDomainPayload(remoteData, localData, id, mergeStore);
        if (canonicalize(preserved) !== canonicalize(remoteData)) await entry.vault.setData(preserved);
        await entry.vault.flush();
      } catch (error) {
        try { storage.setItem(vaultKey, localRaw); } finally { entry.vault.lock(); }
        if (error === unlockError) throw error;
        throw new Error('De lokale Core-kluis kon niet veilig met de remote kluis worden samengevoegd. De oorspronkelijke lokale kluis is hersteld.', { cause: error });
      }
    }
  } else if (remote) {
    await entry.vault.importEnvelope(remote.envelope, password);
    entry.vault.setSyncMeta({ ...entry.vault.getSyncMeta(), sha: remote.sha, dirty: false });
  } else {
    if (!allowCreate) {
      throw new Error(`Het Core-bestand voor ${id} ontbreekt; er wordt geen nieuwe kluis aangemaakt omdat de lokale legacybron niet meer beschikbaar is.`);
    }
    await entry.vault.create(password, clone(legacyData));
  }

  let current = entry.vault.getData();
  let merged = mergeDomainPayload(current, legacyData, id, mergeStore);
  if (canonicalize(merged) !== canonicalize(current)) await entry.vault.setData(merged);
  await entry.vault.flush();

  const syncOptions = {
    settings: remoteSettings,
    merge: (local, incoming) => mergeDomainPayload(local, incoming, id, mergeStore),
    migrate: (incoming) => validateDomainPayload(incoming, id),
    schemaVersion: 2,
  };

  try {
    const result = await entry.sync.syncNow(syncOptions);
    return { id, result, data: entry.vault.getData(), path: remoteSettings.path };
  } catch (error) {
    if (!keyMismatch(error)) throw error;

    // Twee apparaten kunnen tegelijk het eerste bestand aanmaken. De remote
    // envelope die GitHub heeft geaccepteerd bepaalt dan de DEK voor dit domein.
    const winner = await client.getFile();
    if (!winner) throw error;
    const localSnapshot = clone(entry.vault.getData());
    await entry.vault.importEnvelope(winner.envelope, password);
    entry.vault.setSyncMeta({ ...entry.vault.getSyncMeta(), sha: winner.sha, dirty: false });
    current = entry.vault.getData();
    merged = mergeDomainPayload(current, localSnapshot, id, mergeStore);
    if (canonicalize(merged) !== canonicalize(current)) await entry.vault.setData(merged);
    await entry.vault.flush();

    const result = await entry.sync.syncNow(syncOptions);
    return { id, result, data: entry.vault.getData(), path: remoteSettings.path, recoveredConcurrentCreate: true };
  }
}


/**
 * Controleert dat een Core-domein werkelijk leeg is op app-niveau.
 * Core mag daarnaast zijn eigen __pwaSync-apparaat-/verwijdermetadata bewaren.
 */
export function assertEmptyDomainPayload(payload, id) {
  validateDomainPayload(payload, id);
  if (payload.schema !== 2) throw new Error(`De kluis ${id} heeft een onbekend schema; er wordt niets gewijzigd.`);
  const allowed = id === 'shared'
    ? ['items', 'del', 'paid', 'meta', 'schema', 'domain', '__pwaSync']
    : ['items', 'del', 'paid', 'schema', 'domain', '__pwaSync'];
  if (Object.keys(payload).some((key) => !allowed.includes(key))) {
    throw new Error(`De kluis ${id} bevat bestaande of onbekende gegevens. De lege start is afgebroken; niets is overschreven.`);
  }
  if (!Array.isArray(payload.items) || payload.items.length !== 0
    || !isRecord(payload.del) || Object.keys(payload.del).length !== 0
    || !isRecord(payload.paid) || Object.keys(payload.paid).length !== 0
    || (id === 'shared' ? payload.meta !== null : Object.hasOwn(payload, 'meta'))) {
    throw new Error(`De kluis ${id} is niet leeg. De lege start is afgebroken; bestaande gegevens zijn behouden.`);
  }
  if (Object.hasOwn(payload, '__pwaSync') && !isRecord(payload.__pwaSync)) {
    throw new Error(`De Core-synchronisatiemetadata van ${id} is ongeldig. Er is niets gewijzigd.`);
  }
  return payload;
}

/**
 * Maakt een lege kluis aan of sluit aan op een bestaande lege remote kluis.
 * De legacybestanden en legacy-state worden bewust nergens gelezen.
 */
async function decryptEnvelopeWithPassword(vault, envelope, password) {
  vault.validateEnvelope(envelope);
  const kek = await coreCrypto.passwordKey(password, coreCrypto.b64ToBytes(envelope.kdf.salt), envelope.kdf.iterations);
  let key;
  try { key = await coreCrypto.unwrapDataKey(envelope.wrappedKey, kek); }
  catch { throw new Error('Het wachtwoord voor de bestaande Core-kluis klopt niet. Er is niets gewijzigd.'); }
  try { return await coreCrypto.decryptJSON(envelope.payload, key); }
  catch { throw new Error('De bestaande Core-kluis kan niet veilig worden ontsleuteld. Er is niets gewijzigd.'); }
}

export async function initializeEmptyDomain({
  id, password, registry, settings, createClient, mergeStore,
  openEnvelope = decryptEnvelopeWithPassword,
} = {}) {
  assertDomainId(id);
  if (typeof password !== 'string' || !password) throw new Error(`Het nieuwe wachtwoord voor ${id} ontbreekt.`);
  const entry = registry?.[id];
  if (!entry?.vault || !entry?.sync) throw new TypeError(`De kluisinstantie voor ${id} ontbreekt.`);
  if (typeof createClient !== 'function' || typeof mergeStore !== 'function') {
    throw new TypeError('De GitHub-client en Vaste Lasten-samenvoegfunctie zijn verplicht.');
  }

  const remoteSettings = { ...settings, path: VAULT_DOMAINS[id].path };
  const client = createClient(remoteSettings);
  const remote = await client.getFile();
  const localExists = entry.vault.hasVault();

  if (localExists) {
    await entry.vault.unlockWithPassword(password);
    assertEmptyDomainPayload(entry.vault.getData(), id);
    if (remote) {
      // Alleen dezelfde lokale datasleutel mag de remote inhoud inspecteren.
      // Een sleutelconflict stopt; we resetten of vervangen geen bestaande kluis.
      const remoteData = assertEmptyDomainPayload(
        await entry.vault.decryptRemote(remote.envelope), id,
      );
      void remoteData;
    }
  } else if (remote) {
    // Inspecteer vóór import: een bestaande niet-lege kluis komt niet in lokale opslag terecht.
    assertEmptyDomainPayload(await openEnvelope(entry.vault, remote.envelope, password), id);
    await entry.vault.importEnvelope(remote.envelope, password);
    assertEmptyDomainPayload(entry.vault.getData(), id);
    entry.vault.setSyncMeta({ ...entry.vault.getSyncMeta(), sha: remote.sha, dirty: false });
  } else {
    const empty = {
      items: [], del: {}, paid: {},
      ...(id === 'shared' ? { meta: null } : {}),
      schema: 2, domain: VAULT_DOMAINS[id].domain,
    };
    await entry.vault.create(password, empty);
  }

  const syncOptions = {
    settings: remoteSettings,
    merge: (local, incoming) => mergeDomainPayload(local, incoming, id, mergeStore),
    migrate: (incoming) => validateDomainPayload(incoming, id),
    schemaVersion: 2,
  };
  const result = await entry.sync.syncNow(syncOptions);
  await entry.vault.flush();
  assertEmptyDomainPayload(entry.vault.getData(), id);

  const confirmed = await client.getFile();
  if (!confirmed) throw new Error(`GitHub heeft de lege kluis ${id} niet bevestigd. De lokale kluis is behouden; probeer opnieuw.`);
  assertEmptyDomainPayload(await entry.vault.decryptRemote(confirmed.envelope), id);
  return { id, result, path: remoteSettings.path, confirmed: true };
}

/** Verhoogt alleen de minimumversie in het legacy gedeelde bestand; het envelope-formaat blijft legacy. */
export async function raiseLegacyUpdateBarrier({
  readLegacy, openLegacy, writeLegacy, minApp = '3.0.0',
  currentAppVersion = minApp, attempts = 4, compareVersions,
} = {}) {
  for (const name of ['readLegacy', 'openLegacy', 'writeLegacy', 'compareVersions']) {
    if (typeof ({ readLegacy, openLegacy, writeLegacy, compareVersions })[name] !== 'function') {
      throw new TypeError(`${name} ontbreekt voor de legacy-updatebarrière.`);
    }
  }
  for (let attempt = 0; attempt < attempts; attempt++) {
    const remote = await readLegacy();
    if (!remote?.env) throw new Error('Het bestaande gezamenlijke legacybestand ontbreekt; migratie is afgebroken.');
    const data = await openLegacy(remote.env);
    if (!isRecord(data)) throw new Error('Het gezamenlijke legacybestand bevat geen geldig gegevensobject.');
    if (data.minApp && compareVersions(data.minApp, currentAppVersion) > 0) {
      throw new Error(`De legacygegevens vereisen appversie ${data.minApp} of nieuwer.`);
    }
    // Behoud een bestaande, hogere minimumversie; verlaag de barrière nooit.
    const targetMinApp = data.minApp && compareVersions(data.minApp, minApp) > 0
      ? data.minApp
      : minApp;
    if (data.minApp && compareVersions(data.minApp, targetMinApp) === 0) {
      return { alreadyMarked: true, sha: remote.sha };
    }
    const next = { ...data, minApp: targetMinApp };
    const sha = await writeLegacy(next, remote.sha);
    if (sha) return { alreadyMarked: false, sha };
  }
  throw new Error('De updatebarrière kon na vier pogingen niet veilig worden bevestigd.');
}

/**
 * Migreert gedeeld + de actieve persoonlijke kluis. Bij gedeeltelijk succes
 * worden de reeds bevestigde resultaten teruggegeven; de legacybron blijft behouden.
 */
export async function migrateActiveDomains({
  state, getState, me, passwords, registry, settings, createClient, mergeStore,
  legacySync, raiseBarrier,
} = {}) {
  if (!['p1', 'p2'].includes(me)) throw new TypeError('Persoon moet p1 of p2 zijn.');
  if (typeof legacySync !== 'function' || typeof raiseBarrier !== 'function') {
    throw new TypeError('De bestaande legacy-sync en updatebarrière zijn verplicht.');
  }
  await legacySync();
  await raiseBarrier();

  const latestState = typeof getState === 'function' ? getState() : state;
  const split = splitLegacyState(latestState, me);
  const active = ['shared', `personal-${me}`];
  const results = {};
  for (const id of active) {
    try {
      results[id] = await openAndSyncDomain({
        id,
        password: passwords?.[id],
        legacyData: split[id],
        registry,
        settings,
        createClient,
        mergeStore,
      });
    } catch (error) {
      return { complete: false, results, failedDomain: id, error };
    }
  }
  return { complete: true, results, legacySourceCanBeRetired: true };
}
