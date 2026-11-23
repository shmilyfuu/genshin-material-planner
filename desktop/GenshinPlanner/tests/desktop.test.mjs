import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloneDefaultState,normalizeState} from '../wwwroot/core.mjs';
import {calculateMultiPlan,collectInventoryCatalog,planMaterialUsage} from '../wwwroot/multi-planner.mjs';
import {selectPlannerAccount,createPlannerAccount,saveActivePlannerAccount} from '../wwwroot/planner-accounts.mjs';

const path=new URL('../wwwroot/',import.meta.url);
const html=readFileSync(new URL('index.html',path),'utf8');
const js=readFileSync(new URL('desktop-app.mjs',path),'utf8');
const css=readFileSync(new URL('desktop.css',path),'utf8');

test('桌面窗口有角色头像和三种筛选栏，以及全局缺口抽屉',()=>{
  for(const id of ['rosterGrid','starFilters','elementFilters','weaponFilters','accountSelect','inventoryGroups','deficitDrawer']){
    assert.ok(html.includes(`id="${id}"`),id);
  }
  assert.ok(css.includes('minmax(108px,1fr)'));
  assert.ok(css.includes('92px'));
  for(const name of ['flame','droplet','snowflake','sword','claymore','spear','bow','book'])assert.ok(js.includes(name));
});

test('两个账号分别保存库存和培养项',()=>{
  const state=normalizeState(cloneDefaultState());
  state.materialInventory={'202':'15660349'};
  const empty=normalizeState(cloneDefaultState());
  createPlannerAccount(state,'account-b','测试账号',empty);
  assert.deepEqual(state.materialInventory,{});
  state.materialInventory={'202':'28'};
  saveActivePlannerAccount(state);
  selectPlannerAccount(state,'account-1');
  assert.equal(state.materialInventory['202'],'15660349');
  selectPlannerAccount(state,'account-b');
  assert.equal(state.materialInventory['202'],'28');
});

const character=(id)=>({id,materials:{spec:{id:101},boss:{id:102},weekly:{id:103},crown:{id:104},
  charGems:[201,202,203,204].map((id,i)=>({id,rank:i+1})),
  cult:[301,302,303].map((id,i)=>({id,rank:i+1})),
  books:[401,402,403].map((id,i)=>({id,rank:i+1}))}});
const plan=(id)=>({source:{selectedCharacterId:String(id),selectedWeaponId:''},config:{
  charAsc:[0,6],weapAsc:[0,0],talentA:[0,0],talentE:[0,0],talentQ:[0,0]
}});

test('同账号共用材料只扣一次并能在培养项间共享',()=>{
  const entries=[{plan:plan(1),characterProfile:character(1),weaponProfile:null},
                 {plan:plan(2),characterProfile:character(2),weaponProfile:null}];
  const usage=planMaterialUsage(entries);
  assert.equal(usage.get('301'),2);
  const rows=collectInventoryCatalog([entries[0]]);
  assert.ok(rows.cultInventory.some(g=>g.rows.some(r=>r.id==='301')));
  const total=calculateMultiPlan(entries,{'301':'20'});
  const material=total.groups.flatMap(g=>g.rows).find(r=>r.id==='301');
  assert.equal(material.count,36);
  assert.equal(material.stock,20);
  assert.equal(material.lack,16);
});
