/**
 * Back-upherstel voor Vaste Lasten.
 * De state wordt eerst als nieuwe snapshot opgebouwd; de aanroeper publiceert
 * die pas na de opslagbevestiging naar de zichtbare app-state.
 */
export function mergeBackupState({ backup, currentState, stores, merge, now = Date.now() } = {}) {
  if (!backup || !currentState || !Array.isArray(stores) || typeof merge !== 'function') {
    throw new TypeError('De gegevens voor het terugzetten van de back-up zijn onvolledig.');
  }
  const nextState = structuredClone(currentState);
  let count = 0;
  for (const store of stores) {
    const incoming = structuredClone(backup[store]);
    if (!incoming || !Array.isArray(incoming.items)) {
      throw new Error('De back-up bevat geen geldige gegevens voor ' + store + '.');
    }
    incoming.items.forEach(item => { item.u = now; item.example = false; count++; });
    const current = currentState[store];
    nextState[store] = merge({
      items: [],
      del: current.del,
      paid: current.paid,
      meta: current.meta,
    }, incoming);
    nextState[store].items.forEach(item => { delete nextState[store].del[item.id]; });
  }
  return { state: nextState, count };
}

/**
 * Sla de herstelde snapshot duurzaam op. Core-mode wacht expliciet op zowel
 * persistState als flushLocal; alleen een afgeronde promise geldt als succes.
 */
export async function persistBackupState({ state, coreMode = false, coreReady = false, coreRuntime = null, saveLegacy } = {}) {
  if (coreMode) {
    if (!coreReady || !coreRuntime) throw new Error('Ontgrendel eerst de Core-kluizen.');
    await coreRuntime.persistState(state);
    await coreRuntime.flushLocal();
    return 'core';
  }
  if (typeof saveLegacy !== 'function') throw new TypeError('De opslagfunctie voor de back-up ontbreekt.');
  await saveLegacy(state);
  return 'legacy';
}
