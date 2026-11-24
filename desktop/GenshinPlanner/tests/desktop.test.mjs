import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloneDefaultState,normalizeState} from '../wwwroot/core.mjs';
import {calculateMultiPlan,collectInventoryCatalog,planMaterialUsage} from '../wwwroot/multi-planner.mjs';
import {selectPlannerAccount,createPlannerAccount,saveActivePlannerAccount} from '../wwwroot/planner-accounts.mjs';
import {normalizeCharacterList,mergeSourceLists} from '../wwwroot/hakushin.mjs';

const path=new URL('../wwwroot/',import.meta.url);
const html=readFileSync(new URL('index.html',path),'utf8');
const js=readFileSync(new URL('desktop-app.mjs',path),'utf8');
const css=readFileSync(new URL('desktop.css',path),'utf8');

test('桌面窗口使用可调整三栏、顶部培养区、日历和常驻缺口',()=>{
  for(const id of ['rosterGrid','starFilters','elementFilters','weaponFilters','accountSelect','inventoryGroups','workbench','resultContent']){
    assert.ok(html.includes(`id="${id}"`),id);
  }
  assert.ok(html.includes('class="deficit-rail"'));
  assert.equal((html.match(/class="column-resizer"/g)||[]).length,2);
  assert.ok(css.includes('minmax(82px,1fr)'));
  assert.ok(css.includes('--strip-height:29px'));
  assert.ok(css.includes('16px;height:16px'));
  assert.ok(js.includes("bridge('ui.layout.load')"));
  assert.ok(js.includes("bridge('ui.layout.save'"));
  assert.ok(js.includes("className='deficit-name'"));
  assert.ok(js.includes("className='material-arrows'"));
  assert.ok(html.includes('id="goalModal"'));
  assert.ok(html.includes('id="activeGoals"'));
  assert.ok(html.includes('id="calendarDays"'));
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


test('Nanoka 角色列表的武器类型用于角色头像角标及筛选',()=>{
  const rows=normalizeCharacterList({'100001':{zh:'角色A',element:'Hydro',type:'Sword',rank:5},'100002':{zh:'角色B',element:'Pyro',weapon:'Polearm',rank:4}});
  assert.equal(rows.find(r=>r.id==='100001').weaponType,'Sword');
  assert.equal(rows.find(r=>r.id==='100002').weaponType,'Polearm');
});

test('关闭的培养项不参与汇总，原有账号的培养项默认启用',()=>{
  const p=plan(1), q=plan(2);
  p.enabled=false;q.enabled=true;
  const one=calculateMultiPlan([{plan:p,characterProfile:character(1)},{plan:q,characterProfile:character(2)}],{});
  const mora=one.groups.flatMap(g=>g.rows).find(r=>r.id==='301');
  assert.equal(mora.count,18);
  p.enabled=true;
  const two=calculateMultiPlan([{plan:p,characterProfile:character(1)},{plan:q,characterProfile:character(2)}],{});
  assert.equal(two.groups.flatMap(g=>g.rows).find(r=>r.id==='301').count,36);
  const old=cloneDefaultState();delete old.plans[0].enabled;
  assert.equal(normalizeState(old).plans[0].enabled,true);
  old.plans[0].enabled=false;
  assert.equal(normalizeState(old).plans[0].enabled,false);
});

test('武器秘境材料和怪物素材使用固定分类',()=>{
  const weapon={materials:{
    weapGems:[{id:9001,rank:1,name:'秘境突破材料'}],
    matA:[{id:9002,rank:2,name:'精英怪物'}],
    matB:[{id:9003,rank:1,name:'普通怪物'}]
  }};
  const catalog=collectInventoryCatalog([{weaponProfile:weapon}]);
  assert.deepEqual(catalog.weaponInventory.flatMap(g=>g.rows.map(r=>r.id)),['9001']);
  assert.deepEqual(catalog.cultInventory.flatMap(g=>g.rows.map(r=>r.id)),['9002','9003']);
});

test('角色武器列表默认新到旧，前瞻内容排在前面',()=>{
  const list=mergeSourceLists(
    [{id:'1001',name:'甲',version:'6.3'},{id:'1003',name:'乙',version:'6.3'}],
    [{id:'1001',name:'甲',version:'6.4'},{id:'1003',name:'乙',version:'6.4'},
      {id:'1005',name:'前瞻',version:'6.4'}]
  );
  assert.deepEqual(list.map(r=>r.id),['1005','1003','1001']);
});

test('窗口布局有尺寸保存和列宽读写',()=>{
  const source=readFileSync(new URL('../MainWindow.xaml.cs',import.meta.url),'utf8');
  const xaml=readFileSync(new URL('../MainWindow.xaml',import.meta.url),'utf8');
  assert.ok(xaml.includes('Width="1600" Height="900"'));
  for(const name of ['RestoreWindowLayout','SaveColumns','OnClosing','desktop-layout.json',
    'ui.layout.load','ui.layout.save'])assert.ok(source.includes(name));
});

test('三栏布局的前后端保存协议一致',()=>{
  const source=readFileSync(new URL('../MainWindow.xaml.cs',import.meta.url),'utf8');
  const defaults=JSON.parse(js.match(/const DEFAULT_COLUMNS=(\[[^\]]+\])/)[1]);
  const minimums=JSON.parse(js.match(/const COLUMN_MIN=(\[[^\]]+\])/)[1]);
  const backend=Number(source.match(/const int columnCount = (\d+);/)[1]);
  const readCount=Number(js.match(/saved\.columns\.length===(\d+)/)[1]);
  assert.equal(defaults.length,3);
  assert.equal(minimums.length,defaults.length);
  assert.equal(readCount,defaults.length);
  assert.equal(backend,defaults.length);
  assert.equal((html.match(/class="column-resizer"/g)||[]).length,backend-1);
  assert.ok(source.includes('values.Count != columnCount'));
  assert.ok(source.includes('new double[columnCount]'));
  assert.ok(source.includes('index < columns.Length'));
});
