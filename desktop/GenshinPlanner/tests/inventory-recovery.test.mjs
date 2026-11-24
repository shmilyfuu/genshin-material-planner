import test from 'node:test';
import assert from 'node:assert/strict';
import {readInventoryObservation,recoverMaterialFamily,recoverInventory,buildRecoveryCatalog,buildFamilyProbe} from '../wwwroot/inventory-recovery.mjs';
const ids=[114093,114094,114095,114096];
const obs=(d,l,r)=>readInventoryObservation({data:{has_user_info:true,overall_consume:d.flatMap((num,i)=>num?[{id:ids[i],num,lack_num:l[i]}]:[]),available_material:r.flatMap((num,i)=>num?[{id:ids[i],num}]:[])}});
const a=obs([3,9,9,4],[0,0,0,0],[44,27,2,0]);
const b=obs([6,18,18,8],[0,0,0,7],[41,18,0,0]);
const c=obs([14,41,41,18],[0,0,28,18],[33,0,0,0]);
const stages=[
 obs([50,0,0,0],[3,0,0,0],[0,0,0,0]),
 obs([0,56,0,0],[0,5,0,0],[47,0,0,0]),
 obs([0,0,42,0],[0,0,14,0],[47,36,0,0]),
 obs([0,0,0,12],[0,0,0,3],[47,36,11,0])
];
test('真实诊断四档高需求准确恢复 47/36/11/0',()=>{
 for(const observations of [stages,[a,b,c,...stages],[stages[3]],[a,b,c]]){
   const r=recoverMaterialFamily(ids,observations);
   assert.equal(r.complete,true);assert.deepEqual(r.rows.map(x=>x.num),[47,36,11,0]);
   assert.ok(r.rows.every(x=>!x.minimum));
 }
});
test('不能把合成抵扣数量当原始库存；缺少证据时保留可证明下限',()=>{
 const r=recoverMaterialFamily(ids,[obs([3,9,9,4],[0,0,0,0],[0,0,0,0])]);
 assert.equal(r.complete,false);
 assert.deepEqual(r.rows,[{id:ids[0],num:3,minimum:true}]);
 const high=recoverMaterialFamily(ids,[stages[0],stages[1]]);
 assert.deepEqual(high.rows,[{id:ids[0],num:47,minimum:false},{id:ids[1],num:36,minimum:false}]);
});
test('重复不一致的库存证据不写入错误值',()=>{
 const r=recoverMaterialFamily(ids,[a,obs([3,9,9,4],[0,0,0,0],[45,27,2,0])]);
 assert.equal(r.contradiction,true);assert.deepEqual(r.rows,[]);
});
test('三档怪物诊断样本恢复 114/32/8',()=>{
 const mob=[112158,112159,112160];
 const o=readInventoryObservation({data:{has_user_info:true,overall_consume:[{id:mob[2],num:54,lack_num:23}],available_material:[{id:mob[0],num:114},{id:mob[1],num:32}]}});
 assert.deepEqual(recoverMaterialFamily(mob,[o]).rows.map(r=>r.num),[114,32,8]);
});
test('直接材料探测不使用其他材料的合成贡献',()=>{
 const o=readInventoryObservation({data:{has_user_info:true,overall_consume:[{id:202,num:100,lack_num:15},{id:999,num:5,lack_num:0}],available_material:[]}});
 const r=recoverInventory({families:[],direct:new Set([202])},[o]);
 assert.deepEqual(r.materials,[{id:202,num:85,minimum:false}]);assert.deepEqual(r.unresolved,[999]);
});
test('武器系列识别和集中请求使用独立角色载体及对应等级区间',()=>{
 const weapon={id:14525,weapon_cat_id:10,max_level:90};
 const avatars=Array.from({length:35},(_,i)=>({id:10000020+i,weapon_cat_id:10}));
 const profile={materials:{weapGems:ids.map((id,i)=>({id,rank:i+2,total:[5,14,14,6][i]}))}};
 const catalog=buildRecoveryCatalog(avatars,[weapon],new Map([['weapon:14525',profile]]));
 assert.equal(catalog.families.length,1);
 const probe=buildFamilyProbe(catalog.families[0],3,avatars);
 assert.equal(probe.length,30);assert.equal(new Set(probe.map(x=>x.avatar_id)).size,30);
 assert.ok(probe.every(x=>x.weapon.id===14525&&x.weapon.level_current===71&&x.weapon.level_target===90));
});
