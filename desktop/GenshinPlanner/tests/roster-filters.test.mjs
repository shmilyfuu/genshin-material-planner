import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRosterFilter,toggleRosterFilter,matchesRosterFilter} from '../wwwroot/roster-filters.mjs';

const roster=[
  {id:'1',name:'火剑',rarity:5,element:'Pyro',weaponType:'Sword'},
  {id:'2',name:'水剑',rarity:4,element:'Hydro',weaponType:'Sword'},
  {id:'3',name:'雷弓',rarity:5,element:'Electro',weaponType:'Bow'},
  {id:'4',name:'火弓',rarity:4,element:'Pyro',weaponType:'Bow'}
];
const selectRows=filter=>roster.filter(item=>matchesRosterFilter(item,filter));

test('星级、元素和武器同组支持多个条件，组间条件取交集',()=>{
  const filter=createRosterFilter();
  toggleRosterFilter(filter,'star',5);
  toggleRosterFilter(filter,'star',4);
  toggleRosterFilter(filter,'element','Pyro');
  toggleRosterFilter(filter,'element','Hydro');
  toggleRosterFilter(filter,'weapon','Sword');
  assert.deepEqual(selectRows(filter).map(x=>x.id),['1','2']);
  toggleRosterFilter(filter,'element','Hydro');
  assert.deepEqual(selectRows(filter).map(x=>x.id),['1']);
  toggleRosterFilter(filter,'element','Pyro');
  assert.deepEqual(selectRows(filter).map(x=>x.id),['1','2']);
});

test('重复点击同一条件取消筛选，点击全部恢复该组全部结果',()=>{
  const filter=createRosterFilter('weapon');
  toggleRosterFilter(filter,'weapon','Sword');
  assert.deepEqual(selectRows(filter).map(x=>x.id),['1','2']);
  toggleRosterFilter(filter,'weapon','Sword');
  assert.deepEqual(selectRows(filter).map(x=>x.id),['1','2','3','4']);
  toggleRosterFilter(filter,'star',5);
  filter.star=[];
  assert.equal(selectRows(filter).length,4);
  filter.search='水';
  assert.deepEqual(selectRows(filter).map(x=>x.id),['2']);
});

test('卡片角标和武器加减按钮使用一致的定位规则',()=>{
  const base=new URL('../wwwroot/',import.meta.url);
  const js=readFileSync(new URL('desktop-app.mjs',base),'utf8');
  const css=readFileSync(new URL('desktop.css',base),'utf8');
  assert.ok(js.includes("training.className='card-badge training'"));
  assert.ok(js.includes('card.append(artwork,title)'));
  assert.ok(!js.includes("className='avatar-meta'"));
  assert.ok(css.includes('--badge-inset:4px;--badge-size:23px'));
  assert.ok(css.includes('.avatar-instance{position:absolute;top:4px;left:4px'));
  assert.ok(css.includes('.avatar-weapon-action svg{display:block;width:14px;height:14px'));
  assert.ok(css.includes('.avatar-add-copy{top:4px}'));
  assert.ok(css.includes('.avatar-remove-copy{bottom:4px}'));
  assert.ok(js.includes("createAction('增加一把'+row.name,'plus','avatar-add-copy'"));
  assert.ok(js.includes("createAction('移除'+row.name+' #'+ordinal,'minus','avatar-remove-copy'"));
  assert.ok(js.includes('if(row.instance&&sameName.length>1)'));
  assert.ok(js.includes("await modal({title:'移除武器实例'"));
  assert.ok(js.includes("removeWeaponInstance(state,row.instance.id)"));
  const card=js.slice(js.indexOf('function rosterCard('),js.indexOf('function renderRoster('));
  assert.ok(card.includes("if(kind==='character')"));
  assert.ok(!card.includes("}else{\n    badge(weaponDefs"));
  for(const path of ['icons/development.webp','icons/rarity/rarity-1.png',
    'icons/rarity/rarity-2.png','icons/rarity/rarity-3.png',
    'icons/rarity/rarity-4.webp','icons/rarity/rarity-5.webp']){
    assert.ok(existsSync(new URL(path,base)),path);
  }
});

test('等级选择器直接参与四列网格，修改当前或目标等级时双向同步',()=>{
  const base=new URL('../wwwroot/',import.meta.url);
  const js=readFileSync(new URL('desktop-app.mjs',base),'utf8');
  const css=readFileSync(new URL('desktop.css',base),'utf8');
  const body=js.slice(js.indexOf('function levelRows('),js.indexOf('function updateLinkedWeaponField('));
  assert.match(body,/const current=makeSelect\\(pair\\[0\\],'current'\\),target=makeSelect\\(pair\\[1\\],'target'\\)/);
  assert.match(body,/row\\.append\\(caption,current,arrow,target\\)/);
  assert.doesNotMatch(body,/editorSelect\\(/);
  assert.match(body,/target\\.value=String\\(pair\\[1\\]\\)/);
  assert.match(body,/current\\.value=String\\(pair\\[0\\]\\)/);
  assert.match(css,/\\.goal-level-field\\{display:grid;grid-template-columns:96px minmax\\(0,1fr\\) 20px minmax\\(0,1fr\\)/);
});
