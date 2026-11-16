/* Duurzame, domeingebonden conflictadministratie voor Vaste Lasten.
 * Dit bestand bevat alleen deterministische, zuivere bewerkingen op synthetische metadata.
 * De aanroepende app bewaart de uitkomst binnen de betreffende versleutelde kluis.
 */
(function (root) {
  'use strict';

  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const canonical = (value) => {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
  };
  const hash = (value) => {
    const run = (seed) => { let h = seed; for (const char of value) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
    return run(2166136261) + run(2246822519);
  };
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const empty = () => ({ version: 1, pending: {}, decisions: {} });
  const normalize = (input) => {
    const out = empty();
    if (!input || input.version !== 1) return out;
    for (const [id, item] of Object.entries(input.pending || {})) {
      if (item && item.id === id && Array.isArray(item.alternatives) && item.alternatives.length >= 2) out.pending[id] = clone(item);
    }
    for (const [id, decisions] of Object.entries(input.decisions || {})) {
      if (!Array.isArray(decisions)) continue;
      out.decisions[id] = decisions.filter((d) => d && typeof d.id === 'string' && d.conflictId === id && Object.hasOwn(d, 'selected')).map(clone);
    }
    return out;
  };
  const conflictId = (domain, path, kind, alternatives) =>
    'c-' + hash(canonical({ domain, path, kind, alternatives }));

  function createConflict({ domain, path, kind = 'content', left, right, timestamp = 0 } = {}) {
    if (!['shared', 'personal-p1', 'personal-p2'].includes(domain)) throw new TypeError('Onbekend kluisdomein.');
    if (typeof path !== 'string' || !path) throw new TypeError('Een conflictpad is verplicht.');
    const alternatives = [left, right].map(clone).sort((a, b) => compare(canonical(a), canonical(b)));
    if (canonical(alternatives[0]) === canonical(alternatives[1])) return null;
    const id = conflictId(domain, path, kind, alternatives);
    return { id, domain, path, kind, createdAt: Number(timestamp) || 0, alternatives };
  }

  function mergeConflictState(first, second) {
    const a = normalize(first), b = normalize(second);
    const out = empty();
    for (const source of [a, b]) {
      for (const [id, conflict] of Object.entries(source.pending)) {
        const current = out.pending[id];
        if (!current || conflict.createdAt < current.createdAt) out.pending[id] = clone(conflict);
      }
      for (const [id, decisions] of Object.entries(source.decisions)) {
        const byId = new Map((out.decisions[id] || []).map((d) => [d.id, d]));
        for (const decision of decisions) byId.set(decision.id, clone(decision));
        out.decisions[id] = [...byId.values()].sort((x, y) => compare(x.id, y.id));
      }
    }

    for (const [id, decisions] of Object.entries(out.decisions)) {
      const selected = new Map();
      for (const decision of decisions) selected.set(canonical(decision.selected), decision.selected);
      if (selected.size <= 1) {
        delete out.pending[id];
        continue;
      }
      const original = a.pending[id] || b.pending[id] || out.pending[id];
      if (!original) continue;
      const alternatives = [...selected.values()].sort((x, y) => compare(canonical(x), canonical(y)));
      const nextId = conflictId(original.domain, original.path, 'concurrent-review', alternatives);
      out.pending[nextId] = {
        id: nextId,
        domain: original.domain,
        path: original.path,
        kind: 'concurrent-review',
        parentConflictId: id,
        createdAt: Math.max(...decisions.map((d) => Number(d.at) || 0)),
        alternatives: clone(alternatives),
      };
      delete out.pending[id];
    }

    // Een beslisrecord onderdrukt een oude pending kopie, ook als die later opnieuw wordt gesynchroniseerd.
    for (const id of Object.keys(out.pending)) {
      if (out.decisions[id]?.length) delete out.pending[id];
    }
    return out;
  }

  function resolveConflictState(state, id, selection, { at = Date.now(), deviceId = 'device' } = {}) {
    const current = normalize(state);
    const conflict = current.pending[id];
    if (!conflict) throw new Error('Dit conflict staat niet (meer) open voor beoordeling.');
    const selected = Number.isInteger(selection)
      ? conflict.alternatives[selection]
      : conflict.alternatives.find((value) => canonical(value) === canonical(selection));
    if (selected === undefined) throw new RangeError('Kies een van de getoonde versies.');
    const decision = {
      id: 'd-' + hash(canonical({ conflictId: id, selected, at, deviceId })),
      conflictId: id,
      selected: clone(selected),
      at: Number(at) || 0,
      deviceId: String(deviceId),
    };
    current.decisions[id] = [...(current.decisions[id] || []).filter((d) => d.id !== decision.id), decision];
    return mergeConflictState(current, empty());
  }

  function pendingConflicts(state) {
    return Object.values(normalize(state).pending).sort((a, b) =>
      a.createdAt - b.createdAt || compare(a.id, b.id));
  }

  root.VasteLastenConflictReview = Object.freeze({
    empty,
    canonical,
    createConflict,
    mergeConflictState,
    resolveConflictState,
    pendingConflicts,
  });
})(globalThis);
