import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../../dates/state.js',import.meta.url),'utf8');
const {mergeVotes,remainingActions}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const old={actor:'dmitri',idea_id:'test',choice:'yes',client_at:'2026-09-29T01:00:00Z',event_id:'old'};
const latest={...old,choice:'none',client_at:'2026-09-29T01:01:00Z',event_id:'new'};
const tulin={...old,actor:'tulin',event_id:'other'};
assert.equal(mergeVotes([old,tulin],[latest])['dmitri:test'].choice,'none');
assert.equal(mergeVotes([latest],[old])['dmitri:test'].choice,'none');
assert.equal(mergeVotes([old,tulin],[latest])['tulin:test'].choice,'yes');
assert.deepEqual(remainingActions([old,latest],[old]),[latest]);
assert.deepEqual(remainingActions([latest],[old]),[latest]);
const data=JSON.parse(await readFile(new URL('../../dates/ideas.json',import.meta.url),'utf8'));
assert.equal(data.ideas.length,28);assert.equal(new Set(data.ideas.map(i=>i.id)).size,28);
for(const i of data.ideas){assert.match(i.image.url,/^https:\/\//);assert.match(i.source,/^https:\/\//);assert.ok(i.days.length);assert.ok(i.when);assert.ok(i.availability);assert.notEqual(i.id,'morgan');}
console.log('PASS: offline undo wins over older remote state, profiles stay separate, acknowledgments retain in-flight choices, and 28 unique sourced cards.');
