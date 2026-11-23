import test from 'node:test';
import assert from 'node:assert/strict';
import {collectInventoryCatalog,planMaterialUsage,calculateMultiPlan} from '../multi-planner.mjs';
const item=(id,rank=2)=>({id,name:`材料${id}`,rank});
const character=(spec,book)=>({name:'角色',materials:{spec:item(spec),books:[item(book),item(book+1,3),item(book+2,4)],cult:[item(300),item(301),item(302)]}});
const weapon=(material)=>({name:'武器',materials:{matA:[item(material),item(material+1,3),item(material+2,4)],weapGems:[item(400),item(401),item(402),item(403)]}});

test('切换培养项只显示该项材料，武器始终属于武器区域',()=>{
  const plans=[{characterProfile:character(100,200),weaponProfile:weapon(500)},
    {characterProfile:character(101,210),weaponProfile:null}];
  const catalog=collectInventoryCatalog([plans[0]]);
  const charIds=Object.values(catalog).flatMap(x=>x.flatMap(y=>y.rows.map(r=>r.id)));
  assert.ok(charIds.includes('100'));
  assert.ok(!charIds.includes('101'));
  assert.ok(catalog.weaponInventory.some(group=>group.rows.some(row=>row.id==='500')));
  const other=collectInventoryCatalog([plans[1]]);
  assert.equal(other.weaponInventory.length,0);
  assert.ok(other.basicInventory.some(g=>g.rows.some(r=>r.id==='101')));
});

test('跨项共享材料只标记真正共用的 ID，重复引用一次按一项计算',()=>{
  const entries=[
    {characterProfile:character(100,200),weaponProfile:weapon(300)},
    {characterProfile:character(101,200),weaponProfile:null},
    {characterProfile:null,weaponProfile:weapon(500)}
  ];
  const usage=planMaterialUsage(entries);
  assert.equal(usage.get('200'),2);
  assert.equal(usage.get('300'),2);
  assert.equal(usage.get('400'),2);
  assert.equal(usage.get('100'),1);
  assert.equal(usage.get('202'),3); // 摩拉
});

test('共用库存修改后，两项合并计算只扣除一次',()=>{
  const c=character(100,200);
  const p=(id)=>({source:{selectedCharacterId:id,selectedWeaponId:''},config:{charAsc:[0,6],weapAsc:[0,0],talentA:[0,0],talentE:[0,0],talentQ:[0,0]}});
  const plans=[{plan:p('1'),characterProfile:c,weaponProfile:null},{plan:p('2'),characterProfile:c,weaponProfile:null}];
  const one=calculateMultiPlan(plans,{'100':'47'});
  const two=calculateMultiPlan(plans,{'100':'100'});
  const find=(r)=>r.groups.flatMap(g=>g.rows).find(x=>x.id==='100');
  assert.equal(find(one).count,336);
  assert.equal(find(one).lack,289);
  assert.equal(find(two).lack,236);
});
