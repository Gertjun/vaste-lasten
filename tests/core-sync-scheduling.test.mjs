import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
function extract(name) {
  const match = html.match(new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}', 'm'));
  assert.ok(match, name + ' moet in de app aanwezig zijn');
  return match[0];
}
const source = [
  extract('syncCoreWhenPossible'),
  extract('scheduleSync'),
  extract('syncNow'),
  'globalThis.runSchedule = scheduleSync;',
  'globalThis.runSyncNow = syncNow;',
].join('\n');

function harness({ online = true, connected = false } = {}) {
  const events = [];
  const context = {
    coreMode: true,
    coreReady: true,
    coreConnected: connected,
    coreRuntime: { flushLocal: async () => { events.push('flush-local'); } },
    navigator: { onLine: online },
    SYNC_DELAY: 10000,
    timer: null,
    syncing: false,
    syncError: '',
    corePersistError: '',
    setTimeout(callback, delay) {
      events.push('timer:' + delay);
      context.pendingTimer = callback;
      return 1;
    },
    clearTimeout() { events.push('timer-cleared'); },
    pillIdle() {},
    setPill() {},
    renderSyncPanel() {},
    async sync() { events.push('sync'); },
    async connectCore() { events.push('connect'); context.coreConnected = true; },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, events };
}

test('lokale Core-ontgrendeling plant online alsnog een verbinding en synchronisatie', async () => {
  const { context, events } = harness({ online: true, connected: false });
  context.runSchedule();
  assert.ok(events.includes('timer:10000'), 'er moet een debounce-timer worden gepland');
  context.pendingTimer();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(events.includes('connect'), 'een lokaal ontgrendelde kluis moet online eerst verbinden');
  assert.equal(events.includes('sync'), false, 'connectCore voert zelf de eerste synchronisatie uit');
});

test('tabblad verlaten synchroniseert ook als Core nog niet verbonden is', async () => {
  const { context, events } = harness({ online: true, connected: false });
  context.timer = 1;
  context.runSyncNow();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(events.includes('timer-cleared'), 'de uitgestelde timer moet worden opgeruimd');
  assert.ok(events.includes('connect'), 'bij verlaten van het tabblad moet online verbinding worden gemaakt');
});

test('offline lokaal ontgrendelen bewaart lokaal zonder netwerkverbinding te starten', async () => {
  const { context, events } = harness({ online: false, connected: false });
  context.runSchedule();
  assert.equal(events.some(event => String(event).startsWith('timer:')), false);
  context.runSyncNow();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(events.includes('flush-local'));
  assert.equal(events.includes('connect'), false);
});
