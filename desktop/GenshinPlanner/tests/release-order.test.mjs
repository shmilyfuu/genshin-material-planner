import test from 'node:test';
import assert from 'node:assert/strict';
import {indexBannerReleases,mergeBannerReleases,indexReleaseRows,attachReleaseDates,compareRosterRelease} from '../wwwroot/release-order.mjs';
import {visibleRoster} from '../wwwroot/planner-model.mjs';

const row=(id,name,rarity,releaseDate='',sourceTag='')=>({id:String(id),name,en:name,rarity,releaseDate,sourceTag});
const state={plans:[],ownedCharacters:{},weaponInstances:[]};
test('角色及武器采用推出时间优先于星级和内部 ID 的排序',()=>{
 const rows=[row(10000150,'奥黛塔',5,'2026-08-11'),row(10000148,'阿罗夏',4,'2026-08-11'),row(10000143,'薇斯纳',5,'2026-09-22'),row(10000140,'沃雅妮莎',5,'2026-09-22'),row(10000137,'瓦列里',4,'2026-11-03'),row(10000136,'米提亚',5,'2026-11-03')];
 assert.deepEqual(visibleRoster(state,'character',rows,[],compareRosterRelease).map(r=>r.name),['米提亚','瓦列里','薇斯纳','沃雅妮莎','奥黛塔','阿罗夏']);
 const weapons=[row(15599,'旧五星',5,'2024-01-01'),row(11401,'新四星',4,'2026-11-03'),row(13501,'同日五星',5,'2026-11-03')];
 assert.deepEqual(visibleRoster(state,'weapon',[],weapons,compareRosterRelease).map(r=>r.name),['同日五星','新四星','旧五星']);
});
test('培养及拥有状态保持优先，前瞻优先于正式推出时间',()=>{
 const owned=row(1,'已有',4,'2020-09-27'),preview=row(2,'前瞻',4,'','前瞻'),newest=row(3,'新角色',5,'2026-11-03');
 const s={...state,ownedCharacters:{'1':{level:90}}};
 assert.deepEqual(visibleRoster(s,'character',[newest,preview,owned],[],compareRosterRelease).map(r=>r.id),['1','2','3']);
});
test('历史卡池取最早记录，正式发布时间优先于较晚的首次 UP',()=>{
 const index=indexBannerReleases([
  {Type:302,From:'2026-11-04T06:00:00+08:00',UpOrangeList:[11513],UpPurpleList:[11427]},
  {Type:302,From:'2024-01-02T06:00:00+08:00',UpOrangeList:[11513],UpPurpleList:[]},
  {Type:301,From:'2026-11-04T06:00:00+08:00',UpOrangeList:[10000136],UpPurpleList:[10000137]},
  {Type:500,From:'2020-01-01T00:00:00Z',UpOrangeList:[10000136]}
 ]);
 const merged=mergeBannerReleases(index,{weapon:{11513:'2025-01-01'}});
 assert.equal(merged.weapon['11513'],'2024-01-01');
 assert.equal(merged.character['10000137'],'2026-11-03');
 const dates=indexReleaseRows([{name:'The Catch',date:'2021-08-31'},{name:'Invalid',date:'2026-02-31'}]);
 const result=attachReleaseDates([row(13415,'"The Catch"',4),row(11513,'Sword',5),row(999,'Unknown',4)],'weapon',dates,merged);
 assert.deepEqual(result.map(r=>r.releaseDate),['2021-08-31','2024-01-01','']);
});
test('资料版本号不参与推出时间排序',()=>{
 const a={...row(10,'旧角色',5,'2020-09-27'),version:'7.3'},b={...row(1,'新角色',4,'2026-11-03'),version:'7.2'};
 assert.equal([a,b].sort(compareRosterRelease)[0].id,'1');
});
