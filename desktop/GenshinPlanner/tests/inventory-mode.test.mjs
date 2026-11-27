import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneDefaultState,normalizeState} from '../wwwroot/core.mjs';
import {createPlannerAccount,saveActivePlannerAccount,selectPlannerAccount} from '../wwwroot/planner-accounts.mjs';
import {activeMaterialInventory,selectInventoryMode,setManualMaterial,previewManualAddition,applySyncedInventory,compareInventoryMaterial,summarizeInventoryApplication,applyInventoryToManual} from '../wwwroot/inventory-mode.mjs';
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

test('应用全部准确库存（含零），保留未知和下限，独立同步快照不变',()=>{
 const s=fresh();s.materialInventory={'1':'100+25','2':'7','3':'88','4':'9','6':'5','7':'15'};
 applySyncedInventory(s,{uid,replace:true,materials:[{id:1,num:130},{id:2,num:0},{id:3,num:10,minimum:true},{id:5,num:12},{id:6,num:5},{id:8,num:100,minimum:true}]});
 selectInventoryMode(s,'synced');
 const snapshot=structuredClone(s.syncedMaterialInventory),flags=structuredClone(s.syncedInventoryMinimum);
 assert.deepEqual(compareInventoryMaterial(s,'1'),{manual:125,synced:130,status:'exact',delta:5});
 assert.deepEqual(compareInventoryMaterial(s,'2'),{manual:7,synced:0,status:'exact',delta:-7});
 assert.deepEqual(compareInventoryMaterial(s,'3'),{manual:88,synced:10,status:'minimum',delta:null});
 assert.deepEqual(compareInventoryMaterial(s,'4'),{manual:9,synced:null,status:'unknown',delta:null});
 assert.deepEqual(compareInventoryMaterial(s,'5'),{manual:null,synced:12,status:'exact',delta:null});
 assert.deepEqual(summarizeInventoryApplication(s),{exact:4,changed:2,added:1,minimum:2,unknown:2});
 applyInventoryToManual(s);
 assert.equal(s.inventoryMode,'manual');
 assert.deepEqual(s.materialInventory,{'1':'130','2':'0','3':'88','4':'9','5':'12','6':'5','7':'15'});
 assert.deepEqual(s.syncedMaterialInventory,snapshot);assert.deepEqual(s.syncedInventoryMinimum,flags);
 setManualMaterial(s,'1','131');assert.equal(s.syncedMaterialInventory['1'],'130');
 applySyncedInventory(s,{uid,replace:true,materials:[{id:1,num:135}]});
 assert.equal(s.materialInventory['1'],'131');assert.equal(compareInventoryMaterial(s,'1').delta,4);
});
test('只有下限时禁止应用，其他规划账号不受影响',()=>{
 const s=fresh();s.materialInventory={'1':'9'};
 applySyncedInventory(s,{uid,materials:[{id:1,num:2,minimum:true}]});
 assert.throws(()=>applyInventoryToManual(s),/暂无/);assert.equal(s.materialInventory['1'],'9');
 createPlannerAccount(s,'other','Other',fresh());
 applySyncedInventory(s,{uid:'987654321',materials:[{id:1,num:7}]});applyInventoryToManual(s);
 selectPlannerAccount(s,'account-1');assert.equal(s.materialInventory['1'],'9');assert.equal(s.syncedMaterialInventory['1'],'2');
});

test('追加数量沿用表达式库存计算，接受正整数并拒绝溢出',()=>{
 const s=fresh();setManualMaterial(s,'202','30+6');setManualMaterial(s,'1','5');
 applySyncedInventory(s,{uid,materials:[{id:202,num:50}]});
 assert.deepEqual(previewManualAddition(s.materialInventory['202'],'12'),{current:36,total:48});
 assert.deepEqual(previewManualAddition(undefined,'8'),{current:0,total:8});
 assert.deepEqual(previewManualAddition('3',' 001 '),{current:3,total:4});
 for(const invalid of ['', '0','-1','1.5','1e3','2+3','NaN','9007199254740992'])assert.equal(previewManualAddition('36',invalid).total,null,invalid);
 assert.equal(previewManualAddition(String(Number.MAX_SAFE_INTEGER),'1').total,null);
 assert.equal(previewManualAddition('1',String(Number.MAX_SAFE_INTEGER-1)).total,Number.MAX_SAFE_INTEGER);
 const total=previewManualAddition(s.materialInventory['202'],'12').total;
 setManualMaterial(s,'202',String(total));
 assert.deepEqual(s.materialInventory,{'202':'48','1':'5'});
 assert.deepEqual(s.syncedMaterialInventory,{'202':'50'});
 selectInventoryMode(s,'synced');assert.equal(setManualMaterial(s,'202','100'),false);
});
test('追加浮层采用原生表单确认、独立定位及手动库存范围',()=>{
 const read=name=>readFileSync(new URL('../wwwroot/'+name,import.meta.url),'utf8');
 const html=read('index.html'),js=read('desktop-app.mjs'),css=read('desktop.css');
 assert.match(html,/<form id="materialAddPopover"[\s\S]*?<button id="materialAddConfirm" type="submit"[\s\S]*?<\/form>/);
 assert.ok(js.includes("panel.addEventListener('submit'"));
 assert.ok(js.includes("state.activeAccountId===context.accountId"));
 assert.ok(js.includes("&&state.inventoryMode==='manual'&&!waitState.locked&&!closing"));
 assert.ok(js.includes("controls.append(arrows,add)"));
 assert.ok(js.includes("context.input.value=String(total);updateMaterialCount"));
 assert.ok(js.includes("function renderInventory(){\n  closeMaterialAdd();"));
 assert.ok(js.includes("if(locked)closeMaterialAdd();"));
 assert.ok(js.includes("event.key==='Escape'&&materialAddContext"));
 assert.ok(css.includes(".material-row.manual-material-row{grid-template-columns:30px minmax(0,1fr) 116px}"));
 assert.ok(css.includes(".material-add-popover{position:fixed"));
});
