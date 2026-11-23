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

test('头像卡片只显示名字，角标使用统一定位区域并携带本地素材',()=>{
  const base=new URL('../wwwroot/',import.meta.url);
  const js=readFileSync(new URL('desktop-app.mjs',base),'utf8');
  const css=readFileSync(new URL('desktop.css',base),'utf8');
  assert.match(js,/training\.className='card-badge training'/);
  assert.match(js,/card\.append\(artwork,title\)/);
  assert.doesNotMatch(js,/className='avatar-meta'/);
  assert.match(js,/artwork\.append\(preview\)/);
  assert.match(css,/--badge-inset:6px;--badge-size:23px/);
  assert.match(css,/\.card-badge\.training\{bottom:var\(--badge-inset\);left:var\(--badge-inset\)\}/);
  assert.match(css,/\.avatar-add-copy\{position:absolute;bottom:4px;right:4px/);
  for(const path of [
    'icons/development.webp',
    'icons/rarity/rarity-1.png','icons/rarity/rarity-2.png',
    'icons/rarity/rarity-3.png','icons/rarity/rarity-4.webp',
    'icons/rarity/rarity-5.webp'
  ])assert.ok(existsSync(new URL(path,base)),path);
});
