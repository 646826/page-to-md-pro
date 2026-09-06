import test from 'node:test';
import assert from 'node:assert/strict';
import { getOptions, setOptions, ensureDefaultOptions } from '../src/storage.js';
function area(data={}) {
  return {
    data:{...data}, failSet:false, failGet:false, failRemove:false,
    async get(keys) { if(this.failGet) throw Error('unavailable'); return Object.fromEntries(keys.filter(k=>k in this.data).map(k=>[k,this.data[k]])); },
    async set(values) { if(this.failSet) throw Error('quota'); Object.assign(this.data,values); },
    async remove(keys) { if(this.failRemove) throw Error('cleanup failed'); for(const key of keys) delete this.data[key]; }
  };
}
function storage(){return {sync:area({actionMode:'main'}),local:area({unrelated:'keep'})};}
test('a failed sync write remains effective even when stale sync values are readable',async()=>{
  const s=storage();s.sync.failSet=true;
  assert.equal((await setOptions(s,{actionMode:'full',includeImages:false})).area,'local');
  assert.equal((await getOptions(s)).actionMode,'full');
  assert.equal((await getOptions(s)).includeImages,false);
});
test('pending settings survive a new storage wrapper and default initialization',async()=>{
  const s=storage();s.sync.failSet=true;await setOptions(s,{actionMode:'full'});
  const reopened={sync:area(s.sync.data),local:area(s.local.data)};
  assert.equal((await ensureDefaultOptions(reopened)).actionMode,'full');
  assert.equal((await getOptions(reopened)).actionMode,'full');
});
test('a later successful save clears pending state and permits subsequent sync updates',async()=>{
  const s=storage();s.sync.failSet=true;await setOptions(s,{actionMode:'full'});
  s.sync.failSet=false;await setOptions(s,{actionMode:'auto'});
  assert.deepEqual(s.local.data,{unrelated:'keep'});
  s.sync.data.actionMode='main';assert.equal((await getOptions(s)).actionMode,'main');
});
test('a cleanup failure cannot resurrect older locally pending settings',async()=>{
  const s=storage();s.sync.failSet=true;await setOptions(s,{actionMode:'full'});
  s.sync.failSet=false;s.local.failRemove=true;
  await setOptions(s,{actionMode:'auto'});
  assert.equal((await getOptions(s)).actionMode,'auto');
  s.sync.failGet=true;assert.equal((await getOptions(s)).actionMode,'auto');
});
test('legacy unmarked local data continues to defer to readable sync data',async()=>{
  const s=storage();s.local.data.actionMode='full';assert.equal((await getOptions(s)).actionMode,'main');
});
test('storage reads start concurrently rather than waiting for one area',async()=>{
  const s=storage();let release;let localStarted=false;
  s.sync.get=()=>new Promise(resolve=>{release=resolve;});
  s.local.get=async()=>{localStarted=true;return {};};
  const pending=getOptions(s);await Promise.resolve();const observed=localStarted;release({actionMode:'main'});await pending;
  assert.equal(observed,true);
});
test('failure of both storage reads safely returns defaults',async()=>{
  const s=storage();s.sync.failGet=true;s.local.failGet=true;assert.equal((await getOptions(s)).actionMode,'auto');
});
test('failure of both write destinations is not reported as a saved preference',async()=>{
  const s=storage();s.sync.failSet=true;s.local.failSet=true;await assert.rejects(setOptions(s,{actionMode:'full'}),/quota/);
});
