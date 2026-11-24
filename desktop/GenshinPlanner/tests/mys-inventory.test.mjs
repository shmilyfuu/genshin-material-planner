import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInventoryRequests,readInventoryRows,mergeInventoryRows} from '../wwwroot/mys-inventory.mjs';
test('每种武器均单独纳入，独立武器载体不产生角色需求',()=>{
 const avatars=[{id:1,weapon_cat_id:1,skill_list:[{group_id:100,max_level:10},{group_id:101,max_level:1}]},{id:2,weapon_cat_id:2,skill_list:[]},{id:10000005,weapon_cat_id:1}];
 const weapons=[{id:11,weapon_cat_id:1,max_level:90},{id:12,weapon_cat_id:1,max_level:90},{id:13,weapon_cat_id:2,max_level:70},{id:14,weapon_cat_id:1,max_level:20}];
 const p=buildInventoryRequests(avatars,weapons);
 assert.equal(p.characterCount,2);assert.equal(p.weaponCount,4);
 assert.deepEqual(p.batches[0][0].skill_list,[{id:100,level_current:1,level_target:10}]);
 const items=p.batches.slice(1).flat();
 assert.deepEqual(items.map(i=>i.weapon.id).sort((a,b)=>a-b),[11,12,13,14]);
 assert.ok(items.every(i=>i.avatar_level_current===1&&i.avatar_level_target===1&&!i.skill_list.length));
 assert.equal(items.find(i=>i.weapon.id===13).weapon.level_target,70);
 assert.ok(p.batches.every(b=>new Set(b.map(i=>i.avatar_id)).size===b.length));
});
test('未知武器类型不能静默跳过',()=>assert.throws(()=>buildInventoryRequests([{id:1,weapon_cat_id:1}],[{id:2,weapon_cat_id:2}]),/载体/));
test('库存反推取跨批最大值并保留达到请求上限的标记',()=>{
 const m=new Map();
 for(const list of [[{id:1,num:50,lack_num:0},{id:2,num:20,lack_num:10}],[{id:1,num:90,lack_num:20},{id:2,num:15,lack_num:0}]]){
  mergeInventoryRows(m,readInventoryRows({data:{has_user_info:true,overall_consume:list}}));
 }
 assert.deepEqual(m.get(1),{id:1,num:70,minimum:false});
 assert.deepEqual(m.get(2),{id:2,num:15,minimum:true});
 assert.throws(()=>readInventoryRows({data:{has_user_info:false,overall_consume:[]}}),/UID 库存/);
});
