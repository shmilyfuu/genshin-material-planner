import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneDefaultState,normalizeState,WEAPON_ASC_4STAR_DATA,weaponAscensionTable} from '../wwwroot/core.mjs';
import {buildNanokaDemand} from '../wwwroot/hybrid-calculator.mjs';
import {parseWeaponDetail} from '../wwwroot/hakushin.mjs';
import {initializePlanner,makeGoal,makeWeaponInstance,visibleRoster,setLink,activeGoals,characterGoal} from '../wwwroot/planner-model.mjs';
import {importGOOD} from '../wwwroot/good-import.mjs';
import {saveActivePlannerAccount} from '../wwwroot/planner-accounts.mjs';
import {calculateMultiPlan,materialContributions} from '../wwwroot/multi-planner.mjs';
const char=(id,name,en)=>({id:String(id),name,en,goodKey:en,rarity:5,version:'6.3'});
const weapon=(id,name,en,rarity=4)=>({id:String(id),name,en,goodKey:en,rarity,version:'6.3'});
const character=char(100001,'芙宁娜','Furina');
const sword=weapon(11401,'西风剑','Favonius Sword');
function empty(){return initializePlanner(normalizeState(cloneDefaultState()));}
function fakeWeaponProfile(id='11401'){
  return {id,rarity:4,materials:{
    weapGems:[2101,2102,2103,2104].map((id,i)=>({id,name:'塔'+i,rank:i+2})),
    matA:[2201,2202,2203].map((id,i)=>({id,name:'号角'+i,rank:i+1})),
    matB:[2301,2302,2303].map((id,i)=>({id,name:'箭簇'+i,rank:i+1}))
  }};
}
test('v0.2.x 角色＋武器转换为两个独立目标，只有一份武器实例',()=>{
 const old=cloneDefaultState();delete old.plannerSchema;
 Object.assign(old.plans[0].source,{selectedCharacterId:character.id,selectedCharacterName:'芙宁娜',selectedWeaponId:sword.id,selectedWeaponName:'西风剑'});
 old.plans[0].config.charAsc=[1,6];old.plans[0].config.weapAsc=[2,6];
 const state=initializePlanner(normalizeState(old));
 assert.equal(state.plans.length,2);assert.equal(state.weaponInstances.length,1);
 const c=state.plans.find(g=>g.kind==='character'),w=state.plans.find(g=>g.kind==='weapon');
 assert.equal(c.linkedWeaponInstanceId,w.weaponInstanceId);
 assert.equal(w.config.weapAsc[0],2);assert.equal(c.config.charAsc[0],1);
 saveActivePlannerAccount(state);const revived=normalizeState(state);assert.equal(revived.plans.length,2);
});
test('独立武器实例可解除关联，同一实例由多角色引用时需求只计算一份',()=>{
 const state=empty();const i=makeWeaponInstance(sword);state.weaponInstances.push(i);
 const w=makeGoal('weapon',sword,{instanceId:i.id}),a=makeGoal('character',character),b=makeGoal('character',char(100002,'琴','Jean'));
 state.plans.push(w,a,b);setLink(state,a.id,i.id);setLink(state,b.id,i.id);
 assert.equal(a.linkedWeaponInstanceId,i.id);setLink(state,a.id,'');assert.equal(a.linkedWeaponInstanceId,'');
 const profile=fakeWeaponProfile(),res=calculateMultiPlan([{plan:w,weaponProfile:profile}],{});
 assert.equal(res.groups.flatMap(g=>g.rows).find(r=>r.id==='2101').count,3);
});
test('四星武器突破累计总量与四星材料配方正确',()=>{
 assert.deepEqual(WEAPON_ASC_4STAR_DATA[6],[150000,3,9,9,4,15,18,27,10,15,18]);
 assert.equal(weaponAscensionTable(4)[6][0],150000);
 const profile=fakeWeaponProfile();
 const config=makeGoal('weapon',sword).config;
 const required=buildNanokaDemand({config,weaponProfile:profile,parts:{character:false,weapon:true}});
 const rows=required.groups.flatMap(g=>g.rows);
 for(const [id,count] of [[2101,3],[2102,9],[2103,9],[2104,4],[2201,15],[2202,18],[2203,27],[2301,10],[2302,15],[2303,18]])assert.equal(rows.find(r=>r.id===id).count,count);
 assert.equal(rows.find(r=>r.id===202).count,150000);
});
test('西风剑 Nanoka 四星素材可识别',()=>{
 const detail={name:'西风剑',rank:4,materials:{ascensions:[{mats:[
  ...[3,9,9,4].map((count,i)=>({id:3101+i,name:'塔',rank:i+2,count})),
  ...[15,18,27].map((count,i)=>({id:3201+i,name:'号角',rank:i+1,count})),
  ...[10,15,18].map((count,i)=>({id:3301+i,name:'箭簇',rank:i+1,count}))
 ]}]}};
 const profile=parseWeaponDetail(detail,sword);
 assert.deepEqual(profile.materials.weapGems.map(x=>Number(x.id)),[3101,3102,3103,3104]);
 assert.deepEqual(profile.materials.matA.map(x=>Number(x.id)),[3201,3202,3203]);
 assert.deepEqual(profile.materials.matB.map(x=>Number(x.id)),[3301,3302,3303]);
});
test('GOOD 同名武器分别导入，不丢失实例且不在重复导入时增殖',()=>{
 const state=empty();const good={format:'GOOD',version:3,source:'GGScanner',characters:[{
  key:'Furina',level:80,ascension:5,constellation:0,talent:{auto:6,skill:9,burst:8}
 }],weapons:[
  {key:'FavoniusSword',level:90,ascension:6,refinement:5,location:'Furina'},
  {key:'FavoniusSword',level:40,ascension:2,refinement:1,location:''}
 ]};
 const lists={characters:[character],weapons:[sword]};
 const first=importGOOD(state,good,lists);
 assert.equal(first.characters,1);assert.equal(first.newWeapons,2);assert.equal(state.weaponInstances.length,2);
 assert.equal(state.ownedCharacters[character.id].talent.skill,9);
 const second=importGOOD(state,good,lists);
 assert.equal(second.newWeapons,0);assert.equal(state.weaponInstances.length,2);
 assert.equal(second.updatedWeapons,2);
});
test('重复武器无法唯一匹配时保留原实例和培养目标',()=>{
 const state=empty();const first=makeWeaponInstance(sword,{level:90,ascension:6,refinement:5,scanned:true});
 const second=makeWeaponInstance(sword,{level:90,ascension:6,refinement:5,scanned:true});
 state.weaponInstances.push(first,second);const goal=makeGoal('weapon',sword,{instanceId:first.id,current:first});state.plans.push(goal);
 const json={format:'GOOD',version:3,weapons:[{key:'FavoniusSword',level:90,ascension:6,refinement:5,location:''}]};
 const data=importGOOD(state,json,{characters:[],weapons:[sword]});
 assert.equal(data.ambiguous.length,1);assert.equal(data.newWeapons,0);
 assert.equal(weaponGoalId(),first.id);
 function weaponGoalId(){return state.plans[0].weaponInstanceId;}
});
test('角色图鉴按培养中、已有角色、其他角色排列',()=>{
 const state=empty();const a=char(1,'角色A','A'),b=char(2,'角色B','B'),c=char(3,'角色C','C');
 state.ownedCharacters[b.id]={level:80};state.plans.push(makeGoal('character',a));
 const results=visibleRoster(state,'character',[b,c,a],[],(x,y)=>Number(y.id)-Number(x.id));
 assert.deepEqual(results.map(r=>r.id),['1','2','3']);
});
test('全局材料贡献按目标拆分，完成目标不计入结果',()=>{
 const state=empty();const a=makeGoal('weapon',sword,{instanceId:'w-1'}),b=makeGoal('weapon',sword,{instanceId:'w-2'});
 state.plans.push(a,b);const wp=fakeWeaponProfile();const sources=[a,b].map(plan=>({plan,weaponProfile:wp}));
 const usage=materialContributions(sources);assert.equal(usage.get('2101').length,2);
 assert.equal(calculateMultiPlan(sources,{}).groups.flatMap(g=>g.rows).find(r=>r.id==='2101').count,6);
 b.completed=true;assert.equal(materialContributions(sources).get('2101').length,1);
 assert.equal(calculateMultiPlan(sources,{}).groups.flatMap(g=>g.rows).find(r=>r.id==='2101').count,3);
});

test('单项可满足时仍显示全局共享材料缺口',()=>{
 const makeChar=id=>({id,materials:{spec:{id:9001,name:'共同区域特产',rank:0},
   boss:{id:9002,name:'BOSS'},weekly:{id:9003,name:'周本'},crown:{id:9004,name:'冠'},
   charGems:[9401,9402,9403,9404].map((id,i)=>({id,rank:i+2})),
   cult:[9301,9302,9303].map((id,i)=>({id,rank:i+1})),
   books:[9201,9202,9203].map((id,i)=>({id,rank:i+2}))}});
 const a=makeGoal('character',char(1,'甲','A')),b=makeGoal('character',char(2,'乙','B'));
 const all=[{plan:a,characterProfile:makeChar('1')},{plan:b,characterProfile:makeChar('2')}];
 const inv={'9001':'168'};
 const own=calculateMultiPlan([all[0]],inv);
 const global=calculateMultiPlan(all,inv);
 assert.equal(own.groups.flatMap(g=>g.rows).find(r=>r.id==='9001').lack,0);
 assert.equal(global.groups.flatMap(g=>g.rows).find(r=>r.id==='9001').lack,168);
});
test('GGScanner 装备位置可关联已有培养角色，保留用户原有关联',()=>{
 const state=empty(),goal=makeGoal('character',character);state.plans.push(goal);
 const good={format:'GOOD',version:3,characters:[{key:'Furina',level:80,ascension:5,talent:{auto:6,skill:6,burst:6}}],
   weapons:[{key:'FavoniusSword',level:90,ascension:6,refinement:5,location:'Furina'}]};
 importGOOD(state,good,{characters:[character],weapons:[sword]});
 assert.equal(goal.linkedWeaponInstanceId,state.weaponInstances[0].id);
 const custom=makeWeaponInstance(sword);state.weaponInstances.push(custom);
 setLink(state,goal.id,custom.id);
 importGOOD(state,good,{characters:[character],weapons:[sword]});
 assert.equal(goal.linkedWeaponInstanceId,custom.id);
});
