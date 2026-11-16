import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/function merge\(a,b\)\s*\{[\s\S]*?\n\}/);
assert.ok(match, 'de app-mergefunctie moet aanwezig zijn');
const moduleSource = await readFile(new URL('../js/conflict-review.js', import.meta.url), 'utf8');
const moduleContext = { globalThis: {} };
vm.runInNewContext(moduleSource, moduleContext);
const review = moduleContext.globalThis.VasteLastenConflictReview;
const canon = (value) => {
  if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canon(value[k])).join(',') + '}';
  return JSON.stringify(value === undefined ? null : value);
};
const appContext = {
  globalThis: { VasteLastenConflictReview: review },
  VasteLastenConflictReview: review,
  EMPTY: () => ({ items: [], del: {}, paid: {}, meta: null }),
  MERGE: {
    cats: (a,b) => byId(a,b),
    inc: (a,b) => ({p1:newest(a&&a.p1,b&&b.p1),p2:newest(a&&a.p2,b&&b.p2)}),
    prof: newest, settle: byId, scen: byId, minApp: (a,b) => a||b,
  },
  canon,
  prune: value => value,
};
function byId(a,b){
  const out={};
  for(const source of [a||{},b||{}]) for(const id in source){
    const value=source[id], current=out[id];
    if(value&&(!current||(+value.u||0)>(+current.u||0)||((+value.u||0)===(+current.u||0)&&canon(value)<canon(current)))) out[id]={...value};
  }
  return out;
}
function newest(a,b){
  return !a?(b?{...b}:undefined):!b?{...a}:
    ((+b.u||0)>(+a.u||0)?{...b}:(+b.u||0)<(+a.u||0)?{...a}:(canon(b)<canon(a)?{...b}:{...a}));
}
const merge = vm.runInNewContext('('+match[0]+')', appContext);
const base = () => ({ items:[],del:{},paid:{},meta:null,schema:1,domain:'shared' });
const pending = state => review.pendingConflicts(state.__conflicts);

test('equal-time item edits produce a review task and a deterministic provisional value', () => {
  const a=base(),b=base();
  a.items=[{id:'rent',amount:100,u:500}]; b.items=[{id:'rent',amount:200,u:500}];
  const ab=merge(a,b), ba=merge(b,a);
  assert.equal(pending(ab).length,1);
  assert.equal(pending(ba).length,1);
  assert.equal(canon(ab.items),canon(ba.items));
  assert.equal(pending(ab)[0].id,pending(ba)[0].id);
  assert.equal(pending(ab)[0].alternatives.length,2);
});

test('paid, metadata, category, settlement, scenario, income and profile ties are all reviewable', () => {
  const a=base(),b=base(),u=700;
  a.paid={'2026-11':{rent:{p:true,u}}}; b.paid={'2026-11':{rent:{p:false,u}}};
  a.meta={p1:'A',p2:'B',split:50,u}; b.meta={p1:'A',p2:'B',split:60,u};
  for(const key of ['cats','settle','scen']){
    a[key]={same:{id:'same',name:'A',u}}; b[key]={same:{id:'same',name:'B',u}};
  }
  a.inc={p1:{a:3000,u}}; b.inc={p1:{a:3500,u}};
  a.prof={income:3000,u}; b.prof={income:3500,u};
  const result=merge(a,b);
  const paths=pending(result).map(item=>item.path);
  for(const path of ['paid:2026-11:rent','meta','cats:same','settle:same','scen:same','inc:p1','prof']) assert.ok(paths.includes(path),path);
});

test('delete versus equal-time edit creates a review task and keeps deletion as deterministic provisional result', () => {
  const edited=base(),deleted=base();
  edited.items=[{id:'rent',amount:100,u:900}]; deleted.del={rent:900};
  const one=merge(edited,deleted),two=merge(deleted,edited);
  assert.equal(one.items.length,0); assert.equal(two.items.length,0);
  assert.equal(pending(one).length,1); assert.equal(pending(two).length,1);
  assert.equal(pending(one)[0].kind,'delete-vs-edit');
  assert.equal(pending(one)[0].id,pending(two)[0].id);
});

test('a user decision is durable against a stale device pending queue', () => {
  const a=base(),b=base();a.items=[{id:'rent',amount:100,u:1000}];b.items=[{id:'rent',amount:200,u:1000}];
  const merged=merge(a,b),task=pending(merged)[0];
  const resolved=review.resolveConflictState(merged.__conflicts,task.id,1,{at:1200,deviceId:'phone'});
  const stale={...merged,__conflicts:merged.__conflicts};
  const after=merge({...merged,__conflicts:resolved},stale);
  assert.equal(pending(after).length,0);
  assert.equal(after.__conflicts.decisions[task.id].length,1);
});

test('different concurrent choices create a second review task, not last-writer-wins', () => {
  const a=base(),b=base();a.items=[{id:'rent',amount:100,u:1500}];b.items=[{id:'rent',amount:200,u:1500}];
  const initial=merge(a,b),task=pending(initial)[0];
  const phone=review.resolveConflictState(initial.__conflicts,task.id,0,{at:1700,deviceId:'phone'});
  const tablet=review.resolveConflictState(initial.__conflicts,task.id,1,{at:1710,deviceId:'tablet'});
  const state=merge({...initial,__conflicts:phone},{...initial,__conflicts:tablet});
  assert.equal(pending(state).length,1);
  assert.equal(pending(state)[0].kind,'concurrent-review');
});


test('example records are removed before merging and never create review tasks', () => {
  const a=base(),b=base();
  a.items=[{id:'vbs0',name:'Hypotheek',amount:1145,example:true,u:0}];
  b.items=[{id:'vbs0',name:'Hypotheek',amount:1145,example:true,u:0,after:'door'}];
  a.items.push({id:'rent',name:'Test huur',amount:100,u:500});
  b.items.push({id:'rent',name:'Test huur',amount:125,u:500});
  const result=merge(a,b);
  assert.deepEqual(JSON.parse(JSON.stringify(result.items.map(item=>item.id))),['rent']);
  assert.deepEqual(JSON.parse(JSON.stringify(pending(result).map(item=>item.path))),['items:rent']);
});

test('previously persisted conflicts containing only example records are discarded', () => {
  const a=base(),b=base();
  const task=review.createConflict({
    domain:'shared',path:'items:vbs0',kind:'content',timestamp:0,
    left:{kind:'record',value:{id:'vbs0',name:'Hypotheek',amount:1145,example:true,u:0}},
    right:{kind:'record',value:{id:'vbs0',name:'Hypotheek',amount:1145,example:true,u:0,note:''}},
  });
  a.__conflicts={version:1,pending:{[task.id]:task},records:{[task.id]:task},decisions:{}};
  const result=merge(a,b);
  assert.equal(pending(result).length,0);
  assert.equal(result.__conflicts.pending[task.id],undefined);
  assert.equal(result.__conflicts.records[task.id],undefined);
  assert.equal(result.__conflicts.decisions[task.id],undefined);
});


test('a later choice on a stale client becomes a concurrent review after the first choice was synced', () => {
  const a=base(),b=base();
  a.items=[{id:'rent',name:'Test huur',amount:100,u:1500}];
  b.items=[{id:'rent',name:'Test huur',amount:200,u:1500}];
  const initial=merge(a,b),task=pending(initial)[0];
  assert.ok(task,'the initial conflict must be open on both clients');

  const choose=(snapshot,index,at,deviceId)=>{
    const next=JSON.parse(JSON.stringify(snapshot));
    const selected=task.alternatives[index];
    next.__conflicts=review.resolveConflictState(next.__conflicts,task.id,index,{at,deviceId});
    if(selected.kind==='record'){
      next.items=next.items.filter(item=>item.id!==selected.value.id);
      next.items.push({...selected.value,u:at});
    }
    return next;
  };

  // A resolves and publishes first. B still has the original open task and makes
  // a different choice locally before incorporating A's published state.
  const publishedA=choose(initial,0,1600,'p1');
  const localB=choose(initial,1,1700,'p1');
  const afterBSync=merge(localB,publishedA);
  const tasks=pending(afterBSync);
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].kind,'concurrent-review');
  assert.deepEqual(
    JSON.parse(JSON.stringify(tasks[0].alternatives.map(value=>value.value?.amount ?? value.amount).sort((x,y)=>x-y))),
    [100,200],
  );

  // A's next pull must converge on the same pending decision conflict.
  const afterASync=merge(publishedA,afterBSync);
  assert.equal(pending(afterASync).length,1);
  assert.equal(pending(afterASync)[0].id,tasks[0].id);
});

test('category delete versus equal-time rename creates a review task with both explicit alternatives', () => {
  const renamed=base(),deleted=base(),timestamp=1800000000000;
  renamed.cats={transport:{id:'transport',name:'Vervoer CR05 gewijzigd',c:'c1',u:timestamp,del:false}};
  deleted.cats={transport:{id:'transport',name:'Vervoer',c:'c1',u:timestamp,del:true}};

  const forward=merge(renamed,deleted),reverse=merge(deleted,renamed);
  const forwardTasks=pending(forward),reverseTasks=pending(reverse);
  assert.equal(forwardTasks.length,1,'de gelijke-tijd delete-versus-rename moet één reviewtaak opleveren');
  assert.equal(reverseTasks.length,1,'de uitkomst mag niet afhangen van de merge-volgorde');

  const task=forwardTasks[0];
  assert.equal(task.path,'cats:transport');
  assert.equal(task.kind,'content');
  assert.equal(task.id,reverseTasks[0].id,'beide clients moeten dezelfde conflictidentiteit berekenen');
  assert.deepEqual(
    JSON.parse(JSON.stringify(task.alternatives.map(value=>({name:value.name,deleted:value.del===true})).sort((a,b)=>a.name.localeCompare(b.name)))),
    [
      {name:'Vervoer',deleted:true},
      {name:'Vervoer CR05 gewijzigd',deleted:false},
    ],
    'de reviewtaak moet zowel de verwijderde als de gewijzigde categorie bewaren',
  );
  assert.equal(canon(forward.cats),canon(reverse.cats),'de voorlopige categorie-uitkomst moet deterministisch zijn');
});

test('category delete versus rename with different timestamps follows the newer category without a tie review', () => {
  const renamed=base(),deleted=base();
  renamed.cats={transport:{id:'transport',name:'Vervoer CR05 gewijzigd',c:'c1',u:1800000000001,del:false}};
  deleted.cats={transport:{id:'transport',name:'Vervoer',c:'c1',u:1800000000000,del:true}};

  const result=merge(renamed,deleted);
  assert.equal(pending(result).length,0,'verschillende timestamps zijn geen gelijk-tijdconflict');
  assert.equal(result.cats.transport.name,'Vervoer CR05 gewijzigd');
  assert.equal(result.cats.transport.del,false);
});

