import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneDefaultState,normalizeState} from '../core.mjs';

test('旧版单项配置转换为首个培养项并保留原始背包',()=>{
  const result=normalizeState({
    source:{
      selectedCharacterId:'10000111',selectedCharacterName:'角色A',
      selectedWeaponId:'15517',selectedWeaponName:'武器A'
    },
    config:{
      charAsc:[1,6],weapAsc:[0,6],talentA:[2,9],talentE:[0,9],talentQ:[0,0]
    },
    inv:{gold:'15660349',spec:'47',books:['38*2','0','11']}
  });
  assert.equal(result.schemaVersion,5);
  assert.equal(result.plans.length,1);
  assert.equal(result.plans[0].source.selectedCharacterId,'10000111');
  assert.equal(result.plans[0].source.selectedWeaponId,'15517');
  assert.deepEqual(result.plans[0].config.charAsc,[1,6]);
  assert.equal(result.inv.gold,'15660349');
  assert.equal(result.inv.books[0],'38*2');
  assert.equal(result.materialInventoryMigrated,false);
});

test('多个培养项各自保存角色武器等级，切换活动项恢复对应编辑值',()=>{
  const a=cloneDefaultState();
  a.plans[0].source.selectedCharacterId='10000111';
  a.plans[0].config.charAsc=[0,6];
  a.plans.push({
    id:'weapon-only',source:{...a.source,selectedWeaponId:'15517',selectedWeaponName:'银昼'},
    config:{...a.config,weapAsc:[1,5]}
  });
  a.activePlanId='weapon-only';
  a.materialInventory={'202':'15660349','110201':'47','110202':'36'};
  const result=normalizeState(a);
  assert.equal(result.plans.length,2);
  assert.equal(result.activePlanId,'weapon-only');
  assert.equal(result.source.selectedWeaponName,'银昼');
  assert.deepEqual(result.config.weapAsc,[1,5]);
  assert.equal(result.plans[0].source.selectedCharacterId,'10000111');
  assert.equal(result.materialInventory['202'],'15660349');
  assert.equal(result.materialInventory['110201'],'47');
});

test('重复 ID、非法库存键与越界等级在导入时规范化',()=>{
  const data=cloneDefaultState();
  data.plans=[
    {id:'same',source:data.source,config:{...data.config,charAsc:[0,99]}},
    {id:'same',source:data.source,config:{...data.config,talentA:[9,1]}}
  ];
  data.materialInventory={'abc':'20','202':'0','110201':'38*2'};
  const result=normalizeState(data);
  assert.equal(new Set(result.plans.map(p=>p.id)).size,2);
  assert.deepEqual(result.plans[0].config.charAsc,[0,6]);
  assert.deepEqual(result.plans[1].config.talentA,[9,9]);
  assert.equal(result.materialInventory.abc,undefined);
  assert.equal(result.materialInventory['202'],'0');
});
