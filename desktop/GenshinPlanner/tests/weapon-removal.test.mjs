import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneDefaultState,normalizeState} from '../wwwroot/core.mjs';
import {initializePlanner,makeWeaponInstance,makeGoal,removeWeaponInstance,weaponInstance,weaponGoal} from '../wwwroot/planner-model.mjs';

const sword={id:'111',name:'测试单手剑',weaponType:'Sword',rarity:4};
const character={id:'901',name:'测试角色',weaponType:'Sword',rarity:5};
const makeState=()=>initializePlanner(normalizeState(cloneDefaultState()));

test('仅同名多把时允许移除一把，移除目标并解除所有角色关联',()=>{
  const state=makeState();
  const first=makeWeaponInstance(sword),second=makeWeaponInstance(sword),other=makeWeaponInstance({id:'222',name:'测试弓'});
  state.weaponInstances.push(first,second,other);
  const current=makeGoal('weapon',sword,{instanceId:first.id}),remaining=makeGoal('weapon',sword,{instanceId:second.id});
  const char=makeGoal('character',character);char.linkedWeaponInstanceId=first.id;
  state.plans.push(current,remaining,char);state.activePlanId=current.id;
  const removed=removeWeaponInstance(state,first.id);
  assert.deepEqual(removed.removedGoalIds,[current.id]);
  assert.equal(weaponInstance(state,first.id),undefined);
  assert.equal(weaponGoal(state,first.id),undefined);
  assert.equal(weaponGoal(state,second.id)?.id,remaining.id);
  assert.equal(char.linkedWeaponInstanceId,'');
  assert.equal(state.activePlanId,remaining.id);
  assert.equal(state.weaponInstances.length,2);
  assert.equal(state.weaponInstances.some(x=>x.id===other.id),true);
});

test('最后一把同名武器与不存在的武器都拒绝移除',()=>{
  const state=makeState(),instance=makeWeaponInstance(sword);
  state.weaponInstances.push(instance);
  assert.throws(()=>removeWeaponInstance(state,instance.id),/至少保留一把/);
  assert.throws(()=>removeWeaponInstance(state,'missing'),/不存在/);
  assert.equal(state.weaponInstances.length,1);
  assert.equal(state.plans.length,0);
});
