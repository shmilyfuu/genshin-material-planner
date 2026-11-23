import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateMultiPlan,migrateLegacyInventory} from '../multi-planner.mjs';

const defaults=()=>({charAsc:[0,6],weapAsc:[0,6],talentA:[0,0],talentE:[0,0],talentQ:[0,0]});
const character=(id,spec,books=[301,302,303])=>({
  id,name:'角色'+id,materials:{
    spec:{id:spec,name:'特产'+spec},boss:{id:910},weekly:{id:911},crown:{id:912},
    books:books.map((id,i)=>({id,name:'书'+id,rank:i+2})),
    cult:[110201,110202,110203].map((id,i)=>({id,name:'怪物'+id,rank:i+1})),
    charGems:[1001,1002,1003,1004].map((id,i)=>({id,name:'突破石'+id,rank:i+2}))
  }
});
const weapon=(id,materials=[110201,110202,110203])=>({
  id,name:'武器'+id,materials:{
    weapGems:[114001,114002,114003,114004].map((id,i)=>({id,name:'秘境'+id,rank:i+2})),
    matA:materials.map((id,i)=>({id,name:'普通'+id,rank:i+2})),
    matB:[110301,110302,110303].map((id,i)=>({id,name:'掉落'+id,rank:i+1}))
  }
});
const plan=(char='',wp='',config=defaults())=>({source:{
  selectedCharacterId:String(char),selectedWeaponId:String(wp),
  selectedCharacterName:char?'角色'+char:'',selectedWeaponName:wp?'武器'+wp:''
},config});
const items=(result,id)=>result.groups.flatMap(g=>g.rows).find(r=>r.id===String(id));
test('两个角色同一种天赋书汇总需求，一份库存只扣除一次',()=>{
  const a={plan:plan(1),characterProfile:character(1,501),weaponProfile:null};
  const b={plan:plan(2),characterProfile:character(2,502),weaponProfile:null};
  a.plan.config.talentA=[0,9];b.plan.config.talentA=[0,9];
  const result=calculateMultiPlan([a,b],{'301':'6','302':'42','303':'1'});
  assert.equal(items(result,301).count,6);
  assert.equal(items(result,302).count,42);
  assert.equal(items(result,303).count,76);
  assert.equal(items(result,303).lack,75);
  assert.equal(result.groups.flatMap(g=>g.rows).filter(r=>r.id==='301').length,1);
  assert.equal(items(result,501).count,168);
  assert.equal(items(result,502).count,168);
});
test('角色加武器、角色独立、武器独立同时规划，同 ID 需求合并',()=>{
  const a={plan:plan(1,15),characterProfile:character(1,501),weaponProfile:weapon(15)};
  const b={plan:plan(2),characterProfile:character(2,502),weaponProfile:null};
  const c={plan:plan('',16),characterProfile:null,weaponProfile:weapon(16)};
  const result=calculateMultiPlan([a,b,c],{'110201':'47','110202':'36','110203':'11'});
  assert.equal(items(result,202).count,420000*2+255000*2);
  assert.equal(items(result,110201).count,18*2+23*2);
  assert.equal(items(result,110202).count,30*2+27*2);
  assert.equal(items(result,110203).count,36*2+41*2);
  assert.equal(result.groups.flatMap(g=>g.rows).filter(r=>r.id==='110201').length,1);
});
test('两个培养项使用不同武器材料时分开结算，不共享库存位置',()=>{
  const result=calculateMultiPlan([
    {plan:plan('',15),weaponProfile:weapon(15),characterProfile:null},
    {plan:plan('',16),weaponProfile:weapon(16,[110401,110402,110403]),characterProfile:null}
  ],{'110201':'30','110401':'5'});
  assert.equal(items(result,110201).stock,30);
  assert.equal(items(result,110401).stock,5);
  assert.equal(items(result,110401).count,23);
});
test('同一种武器材料跨组复用按同 ID 合并并统一合成',()=>{
  const result=calculateMultiPlan([{
    plan:plan(1,15),characterProfile:character(1,501),weaponProfile:weapon(15)
  }],{'110201':'1000','110202':'1000','110203':'1000'});
  assert.equal(result.groups.filter(g=>g.rows.some(r=>r.id==='110201')).length,1);
  assert.equal(items(result,110201).lack,0);
  assert.equal(items(result,110203).lack,0);
});
test('从旧单项背包迁移时保留公式和已填写的零',()=>{
  const existing={gold:'15660349',spec:'47',books:['38*2','12','0'],
    cult:['47','36','11','0'],matA:['99','88','77']};
  const record=migrateLegacyInventory(existing,character(1,501),weapon(15),{
    matAIntoCult:true,matBIntoCult:false
  });
  assert.equal(record['202'],'15660349');
  assert.equal(record['501'],'47');
  assert.equal(record['301'],'38*2');
  assert.equal(record['303'],'0');
  assert.equal(record['110201'],'47');
  assert.equal(record['110203'],'11');
});
test('所有培养项未选择时没有需求',()=>{
  const result=calculateMultiPlan([{plan:plan()}],{});
  assert.equal(result.hasAnyTarget,false);
  assert.equal(result.groups.length,0);
});
