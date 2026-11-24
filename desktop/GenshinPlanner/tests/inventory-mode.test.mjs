import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneDefaultState,normalizeState} from '../wwwroot/core.mjs';
import {createPlannerAccount,saveActivePlannerAccount,selectPlannerAccount} from '../wwwroot/planner-accounts.mjs';
import {activeMaterialInventory,selectInventoryMode,setManualMaterial,applySyncedInventory} from '../wwwroot/inventory-mode.mjs';
import {readFileSync} from 'node:fs';
const fresh=()=>normalizeState(cloneDefaultState());
const uid='123456789';
test('手动库存与同步库存隔离，同步不会切换当前模式',()=>{
 const s=fresh();setManualMaterial(s,'202','100+25');setManualMaterial(s,'1','7');
 applySyncedInventory(s,{uid,materials:[{id:202,num:50,minimum:true}]});
 assert.deepEqual(activeMaterialInventory(s),{'202':'100+25','1':'7'});
 selectInventoryMode(s,'synced');
 assert.deepEqual(activeMaterialInventory(s),{'202':'50'});
 assert.equal(setManualMaterial(s,'202','99'),false);
 assert.deepEqual(s.syncedInventoryMinimum,{'202':true});
 selectInventoryMode(s,'manual');setManualMaterial(s,'202','8');
 applySyncedInventory(s,{uid,materials:[{id:202,num:10,minimum:false},{id:2,num:0}]});
 assert.deepEqual(s.materialInventory,{'202':'8','1':'7'});
 assert.deepEqual(s.syncedMaterialInventory,{'202':'10','2':'0'});
 assert.deepEqual(s.syncedInventoryMinimum,{});
});
test('模式和两套库存随规划账号保存，导出再导入后保留',()=>{
 const s=fresh();setManualMaterial(s,'202','100');applySyncedInventory(s,{uid,materials:[{id:202,num:25,minimum:true}]});selectInventoryMode(s,'synced');
 createPlannerAccount(s,'account-b','账号 B',fresh());
 assert.equal(s.inventoryMode,'manual');assert.deepEqual(s.syncedMaterialInventory,{});setManualMaterial(s,'202','2');
 selectPlannerAccount(s,'account-1');assert.equal(s.inventoryMode,'synced');assert.equal(activeMaterialInventory(s)['202'],'25');
 saveActivePlannerAccount(s);const restored=normalizeState(JSON.parse(JSON.stringify(s)));
 assert.equal(restored.inventoryMode,'synced');assert.equal(restored.syncedMaterialInventory['202'],'25');assert.equal(restored.materialInventory['202'],'100');
 assert.equal(restored.syncedInventoryMinimum['202'],true);
 selectPlannerAccount(restored,'account-b');assert.equal(restored.inventoryMode,'manual');assert.deepEqual(restored.syncedMaterialInventory,{});assert.equal(restored.materialInventory['202'],'2');
});
test('旧版混合库存保留为手动数据，不推断同步来源',()=>{
 const old=cloneDefaultState();old.materialInventory={'202':'100'};old.inventoryMinimum={'202':true};
 delete old.inventoryMode;delete old.syncedMaterialInventory;delete old.syncedInventoryMinimum;
 const s=normalizeState(old);assert.deepEqual(s.materialInventory,{'202':'100'});assert.deepEqual(s.syncedMaterialInventory,{});assert.equal(s.inventoryMode,'manual');
});
test('同步缺少的材料只保留同步历史记录，错误 UID 不写入',()=>{
 const s=fresh();applySyncedInventory(s,{uid,materials:[{id:202,num:5,minimum:true},{id:1,num:2}]});
 applySyncedInventory(s,{uid,materials:[{id:1,num:3}]});
 assert.equal(s.syncedMaterialInventory['202'],'5');
 assert.throws(()=>applySyncedInventory(s,{uid:'987654321',materials:[{id:202,num:10}]}),/UID/);
 assert.equal(s.syncedMaterialInventory['202'],'5');
});
test('材料缺口及日历统一读取当前库存模式',()=>{
 const source=readFileSync(new URL('../wwwroot/desktop-app.mjs',import.meta.url),'utf8');
 assert.equal((source.match(/calculateMultiPlan\([^\n]+activeMaterialInventory\(state\)\)/g)||[]).length,3);
 assert.ok(source.includes('applySyncedInventory(state,result)'));
});
