import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeState, cloneDefaultState} from '../core.mjs';
import {saveActivePlannerAccount, selectPlannerAccount, createPlannerAccount,
  renamePlannerAccount, deletePlannerAccount, plannerSnapshot} from '../planner-accounts.mjs';

test('旧版单账号养成规划完整迁移成默认可命名账号', () => {
  const state = normalizeState({
    source: {selectedCharacterId:'10000137',selectedCharacterName:'瓦列里'},
    config: {charAsc:[1,6],talentA:[0,9]},
    materialInventory:{'202':'15660349','110201':'47'},
    plans:[{id:'p1',source:{selectedCharacterId:'10000137',selectedCharacterName:'瓦列里'},config:{charAsc:[1,6]}}],
    activePlanId:'p1'
  });
  assert.equal(state.plannerAccounts.length,1);
  assert.equal(state.activeAccountId,'account-1');
  assert.equal(state.materialInventory['110201'],'47');
  assert.equal(state.plans[0].source.selectedCharacterId,'10000137');
  assert.equal(state.plannerAccounts[0].data.materialInventory['202'],'15660349');
});

test('创建空白账号后切回旧账号，保留两边不同培养项、材料和UID', () => {
  const s=normalizeState({});
  s.plans[0].source.selectedCharacterId='10000137';
  s.plans[0].source.selectedCharacterName='瓦列里';
  s.source={...s.plans[0].source};
  s.config={...s.plans[0].config};
  s.materialInventory={'202':'15660349','110201':'47'};
  s.inventoryUid='123456789';
  createPlannerAccount(s,'account-two','副账号',cloneDefaultState());
  assert.deepEqual(s.materialInventory,{});
  assert.equal(s.inventoryUid,'');
  assert.equal(s.plans[0].source.selectedCharacterId,'');
  s.plans[0].source.selectedCharacterId='10000138';
  s.plans[0].source.selectedCharacterName='角色B';
  s.source={...s.plans[0].source};
  s.materialInventory={'202':'7654321','110201':'6'};
  s.inventoryUid='987654321';
  selectPlannerAccount(s,'account-1');
  assert.equal(s.materialInventory['110201'],'47');
  assert.equal(s.plans[0].source.selectedCharacterName,'瓦列里');
  assert.equal(s.inventoryUid,'123456789');
  selectPlannerAccount(s,'account-two');
  assert.equal(s.materialInventory['110201'],'6');
  assert.equal(s.materialInventory['202'],'7654321');
  assert.equal(s.plans[0].source.selectedCharacterName,'角色B');
  assert.equal(s.inventoryUid,'987654321');
});

test('不同账号即使培养同一个角色，也独立计算缺口', async()=>{
  const {calculateMultiPlan}=await import('../multi-planner.mjs');
  const s=normalizeState({});
  const mat={id:900001,name:'测试特产'};
  const char={name:'角色',materials:{spec:mat}};
  const config=cloneDefaultState().config;
  config.charAsc=[0,6];
  const plan={source:{selectedCharacterId:'10000001',selectedCharacterName:'角色',selectedWeaponId:''},config};
  const calculate=()=>calculateMultiPlan([{plan,characterProfile:char,weaponProfile:null}],s.materialInventory)
    .groups.flatMap(g=>g.rows).find(x=>x.id==='900001').lack;
  s.materialInventory={'900001':'47'};
  assert.equal(calculate(),121);
  createPlannerAccount(s,'two','账号 B',cloneDefaultState());
  s.materialInventory={'900001':'80'};
  assert.equal(calculate(),88);
  selectPlannerAccount(s,'account-1');
  assert.equal(calculate(),121);
});

test('存档恢复后仍保留每个账号的完整计算数据',()=>{
  const s=normalizeState({});
  s.materialInventory={'202':'123456','110201':'38*2'};
  createPlannerAccount(s,'account-two','朋友账号',cloneDefaultState());
  s.materialInventory={'202':'5000','110201':'15'};
  saveActivePlannerAccount(s);
  const restored=normalizeState(structuredClone(s));
  assert.equal(restored.activeAccountId,'account-two');
  assert.equal(restored.materialInventory['110201'],'15');
  selectPlannerAccount(restored,'account-1');
  assert.equal(restored.materialInventory['110201'],'38*2');
});

test('重命名和删除账号保留其余账号数据',()=>{
  const s=normalizeState({});
  createPlannerAccount(s,'b','新账号',cloneDefaultState());
  s.materialInventory={'202':'999'};
  renamePlannerAccount(s,'b','游戏小号');
  assert.equal(s.plannerAccounts[1].name,'游戏小号');
  deletePlannerAccount(s,'account-1');
  assert.equal(s.plannerAccounts.length,1);
  assert.equal(s.materialInventory['202'],'999');
  assert.throws(()=>deletePlannerAccount(s,'b'),/至少保留一个/);
});

test('名称重复、空名称和跨账号 ID 错误不能破坏数据',()=>{
  const s=normalizeState({});
  assert.throws(()=>createPlannerAccount(s,'x',' ',cloneDefaultState()),/请输入账号/);
  assert.throws(()=>createPlannerAccount(s,'x','账号 1',cloneDefaultState()),/已存在/);
  assert.throws(()=>selectPlannerAccount(s,'missing'),/不存在/);
  assert.equal(s.plannerAccounts.length,1);
  assert.equal(s.activeAccountId,'account-1');
});

test('Normalize 账户结构必须使用各账户自己的来源数据',()=>{
  const legacy=normalizeState({});
  createPlannerAccount(legacy,'abc','第二账号',cloneDefaultState());
  legacy.materialInventory={'202':'1'};
  saveActivePlannerAccount(legacy);
  const persisted=normalizeState(legacy);
  assert.equal(persisted.materialInventory['202'],'1');
  selectPlannerAccount(persisted,'account-1');
  assert.deepEqual(persisted.materialInventory,{});
});
