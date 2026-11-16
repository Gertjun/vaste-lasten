/* Synthetische CR06-conflicten voor uitsluitend de PR #9-preview.
 * De caller bepaalt de preview-only toegang en bewaart de uitkomst in de kluizen.
 */
(function (root) {
  'use strict';

  const PATHS = Object.freeze([
    'paid:2026-11:pr9-cr06-paid',
    'cats:pr9-cr06-category',
    'settle:pr9-cr06-settlement',
    'meta',
    'inc:p1',
    'prof',
    'scen:pr9-cr06-scenario',
  ]);

  function createCr06Fixture({ me = 'p1', timestamp = 1794852000000 } = {}) {
    if (!['p1', 'p2'].includes(me)) throw new TypeError('Onbekend persoonlijk profiel.');
    const review = root.VasteLastenConflictReview;
    if (!review) throw new Error('ConflictReview-module ontbreekt.');

    const make = (domain, path, left, right) => review.createConflict({
      domain, path, kind: 'content', left, right, timestamp,
    });
    const shared = review.empty();
    const personal = review.empty();
    const add = (target, conflict) => {
      if (!conflict) throw new Error('CR06-fixture bevat een leeg conflict.');
      target.pending[conflict.id] = conflict;
      target.records[conflict.id] = conflict;
    };

    add(shared, make('shared', PATHS[0],
      { p: true, u: timestamp }, { p: false, u: timestamp }));
    add(shared, make('shared', PATHS[1],
      { id: 'pr9-cr06-category', name: 'CR06 categorie A', c: 'c1', u: timestamp },
      { id: 'pr9-cr06-category', name: 'CR06 categorie B', c: 'c2', u: timestamp }));
    add(shared, make('shared', PATHS[2],
      { id: 'pr9-cr06-settlement', name: 'CR06 verrekening A', amount: 125, u: timestamp },
      { id: 'pr9-cr06-settlement', name: 'CR06 verrekening B', amount: 140, u: timestamp }));
    add(shared, make('shared', PATHS[3],
      { p1: 'CR06 profiel A', p2: 'CR06 partner', split: 50, u: timestamp },
      { p1: 'CR06 profiel B', p2: 'CR06 partner', split: 60, u: timestamp }));
    add(shared, make('shared', PATHS[4],
      { amount: 3000, u: timestamp }, { amount: 3250, u: timestamp }));
    add(shared, make('shared', PATHS[6],
      { id: 'pr9-cr06-scenario', name: 'CR06 scenario A', amount: 250, u: timestamp },
      { id: 'pr9-cr06-scenario', name: 'CR06 scenario B', amount: 275, u: timestamp }));
    add(personal, make('personal-' + me, PATHS[5],
      { name: 'CR06 eigen profiel A', income: 3000, u: timestamp },
      { name: 'CR06 eigen profiel B', income: 3250, u: timestamp }));

    return { shared, personal, paths: [...PATHS] };
  }

  root.VasteLastenCr06Fixture = Object.freeze({ createCr06Fixture, paths: PATHS });
})(globalThis);
