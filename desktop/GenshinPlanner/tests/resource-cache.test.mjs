import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../wwwroot/desktop-app.mjs',import.meta.url),'utf8');
test('startup prefers local data and background applies only a current changed snapshot',()=>{
 assert.match(app,/loadSnapshot\('local',true\)/);
 assert.match(app,/loadSnapshot\('prefer'\)/);
 assert.match(app,/if\(loaded\)void checkCatalogInBackground\(\)/);
 assert.match(app,/if\(!selectionCurrent\(snapshot.selection\)\)/);
 assert.match(app,/if\(!snapshotChanged\(snapshot\)\)/);
 assert.match(app,/if\(!canApplyBackground\(\)\)/);
 assert.match(app,/generation===catalogGeneration/);
 assert.match(app,/!materialAddContext/);
 assert.match(app,/!waitTasks.isLocked\(\)/);
});
test('same resource requests share a promise and remote stale cache prevents snapshot replacement',()=>{
 assert.match(app,/if\(!requests.has\(path\)\)requests.set\(path,/);
 assert.match(app,/return requests.get\(path\)/);
 assert.match(app,/strict&&r.source==='stale-cache'/);
 assert.match(app,/if\(strict\)\{const failed=data.find/);
});
