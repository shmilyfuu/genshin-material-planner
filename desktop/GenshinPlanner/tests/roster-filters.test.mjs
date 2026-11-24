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

test('卡片独立设置入口、选中状态及弹窗层级',()=>{
  const base=new URL('../wwwroot/',import.meta.url);
  const js=readFileSync(new URL('desktop-app.mjs',base),'utf8');
  const css=readFileSync(new URL('desktop.css',base),'utf8');
  assert.ok(js.includes('artwork.append(editButton(onEdit))'));
  assert.ok(js.includes('refreshSelection();'));
  assert.ok(!js.includes("addEventListener('dblclick'"));
  assert.ok(js.includes('fallback.hidden=Boolean(icon)'));
  assert.ok(js.includes("removeWeaponInstance(state,instance.id)"));
  assert.ok(js.includes("icon.className='calendar-material';icon.dataset.rank"));
  assert.ok(css.includes('#modal{z-index:60}'));
  assert.ok(css.includes('.avatar-card.selected::after'));
  assert.ok(css.includes('border-radius:4px 4px 17px 0'));
  assert.ok(css.includes('.weapon-picker-grid'));
  assert.ok(!css.includes('.calendar-material.needed'));
  for(const path of ['icons/rarity/rarity-1.png','icons/rarity/rarity-2.png','icons/rarity/rarity-3.png','icons/rarity/rarity-4.webp','icons/rarity/rarity-5.webp'])assert.ok(existsSync(new URL(path,base)));
});
test('等级选择器直接使用四列布局并同步当前和目标等级',()=>{
 const base=new URL('../wwwroot/',import.meta.url);
 const js=readFileSync(new URL('desktop-app.mjs',base),'utf8');
 const css=readFileSync(new URL('desktop.css',base),'utf8');
 const body=js.slice(js.indexOf('function levelRows('),js.indexOf('function weaponPicker('));
 assert.ok(body.includes('row.append(caption,current,arrow,target)'));
 assert.ok(body.includes('target.value=String(pair[1])'));
 assert.ok(body.includes('current.value=String(pair[0])'));
 assert.ok(css.includes('grid-template-columns:96px minmax(0,1fr) 20px minmax(0,1fr)'));
 assert.ok(css.includes('grid-template-columns:96px minmax(0,1fr)'));
});
