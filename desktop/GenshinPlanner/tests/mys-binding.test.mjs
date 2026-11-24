import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneDefaultState,normalizeState} from '../wwwroot/core.mjs';
import {createPlannerAccount,selectPlannerAccount,saveActivePlannerAccount} from '../wwwroot/planner-accounts.mjs';
import {bindMysAccount,unbindMysAccount,normalizeMysBinding,sameMysBinding,plannerBindingOwner} from '../wwwroot/mys-binding.mjs';
import {readFileSync} from 'node:fs';
const fresh=()=>normalizeState(cloneDefaultState());
const a={accountId:'123',uid:'100000001',region:'cn_gf01',nickname:'A'},b={accountId:'123',uid:'100000002',region:'cn_qd01',nickname:'B'};
test('已有 UID 绑定保留两套库存，账号绑定随规划账号切换及导出恢复',()=>{
 const s=fresh();s.inventoryUid=a.uid;s.materialInventory={'1':'8'};s.syncedMaterialInventory={'1':'7'};
 bindMysAccount(s,a);s.mysSyncedAt=123;
 createPlannerAccount(s,'b','B',fresh());bindMysAccount(s,b);
 assert.equal(s.inventoryUid,b.uid);assert.deepEqual(s.syncedMaterialInventory,{});
 selectPlannerAccount(s,'account-1');assert.ok(sameMysBinding(s.mysBinding,a));
 assert.equal(s.syncedMaterialInventory['1'],'7');assert.equal(s.materialInventory['1'],'8');assert.equal(s.mysSyncedAt,123);
 saveActivePlannerAccount(s);const restored=normalizeState(JSON.parse(JSON.stringify(s)));
 assert.ok(sameMysBinding(restored.mysBinding,a));selectPlannerAccount(restored,'b');assert.ok(sameMysBinding(restored.mysBinding,b));
});
test('拒绝相同 UID 绑定到其他规划账号',()=>{
 const s=fresh();bindMysAccount(s,a);createPlannerAccount(s,'b','B',fresh());
 assert.equal(plannerBindingOwner(s,a.uid,'b').id,'account-1');assert.throws(()=>bindMysAccount(s,a),/已属于/);
});
test('更换 UID 必须明确确认并清空旧同步库存，手动库存保持独立',()=>{
 const s=fresh();bindMysAccount(s,a);s.materialInventory={'1':'8'};s.syncedMaterialInventory={'1':'7'};s.syncedInventoryMinimum={'1':true};s.mysSyncedAt=123;
 assert.throws(()=>bindMysAccount(s,b),/确认/);bindMysAccount(s,b,{replaceUid:true});
 assert.deepEqual(s.syncedMaterialInventory,{});assert.deepEqual(s.syncedInventoryMinimum,{});assert.equal(s.mysSyncedAt,0);assert.equal(s.materialInventory['1'],'8');
 unbindMysAccount(s);assert.equal(s.mysBinding,null);assert.equal(s.inventoryUid,b.uid);
});
test('旧规划 UID 不会自动绑定其他账号，绑定仅保存必要的标识',()=>{
 const old=fresh();old.inventoryUid=a.uid;saveActivePlannerAccount(old);
 assert.equal(normalizeState(old).mysBinding,null);
 assert.deepEqual(normalizeMysBinding({...a,extra:'example'}),{...a,regionName:''});
 assert.equal(normalizeMysBinding({...a,uid:'bad'}),null);
});
test('正式同步显式传入绑定账号 ID 与 UID',()=>{
 const client=readFileSync(new URL('../wwwroot/mys-client.mjs',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../wwwroot/mys-panel.mjs',import.meta.url),'utf8');
 assert.ok(client.includes('async function syncInventory(accountId,uid,region,progress,loadProfile)'));
 assert.ok(client.includes('id=accountId,account=accounts.entries[id]'));
 assert.ok(panel.includes('api.syncInventory(binding.accountId,binding.uid,binding.region'));
 assert.ok(panel.includes('sameMysBinding(binding,options.getBinding())'));
});
