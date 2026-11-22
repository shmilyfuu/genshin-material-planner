import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../miyoushe-calculator.js', import.meta.url), 'utf8');
const config = { charAsc: [0,6], weapAsc: [0,6], talentA:[0,9],talentE:[0,0],talentQ:[0,0] };
function resolve(plan, avatars, weapons) {
  return vm.runInNewContext(script + '\nmysHybridPlan(plan, avatars, weapons);',
    {MYS:{takumi:'https://api-takumi.mihoyo.com'},plan,avatars,weapons});
}
test('前瞻角色与武器均缺席官方目录时转向 Nanoka', () => {
  const result=resolve({characterId:'10000199',weaponId:'15517',config},[],[]);
  assert.equal(result.fallback.character,true);
  assert.equal(result.fallback.weapon,true);
  assert.equal(result.official.character,false);
  assert.equal(result.official.weapon,false);
});
test('角色已实装，前瞻武器仅使用 Nanoka，保留角色官方计算', () => {
  const result=resolve({characterId:'10000111',weaponId:'15517',config},
    [{id:10000111}],[]);
  assert.equal(result.official.character,true);
  assert.equal(result.fallback.weapon,true);
  assert.equal(result.officialPlan.weaponId,'');
});
test('官方武器与前瞻角色按独立部分处理', () => {
  const result=resolve({characterId:'10000199',weaponId:'15517',config},
    [{id:10000111}], [{id:15517}]);
  assert.equal(result.fallback.character,true);
  assert.equal(result.official.weapon,true);
  assert.equal(result.officialPlan.characterId,'');
});
test('仅有目标等级变化的对象参与计算', () => {
  const local={...config, charAsc:[0,0],talentA:[0,0]};
  const result=resolve({characterId:'10000199',weaponId:'15517',config:local},[],[{id:15517}]);
  assert.equal(result.fallback.character,false);
  assert.equal(result.official.weapon,true);
});
test('未设置养成目标不触发计算', () => {
  assert.throws(()=>resolve({characterId:'',weaponId:'',config},[],[]),/请先选择角色或武器/);
});
