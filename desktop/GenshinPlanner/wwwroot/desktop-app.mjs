import {CHAR_LEVEL_LABELS, cloneDefaultState, normalizeState, safeEval} from './core.mjs';
import {
  normalizeCharacterList, normalizeWeaponList, mergeSourceLists,
  parseCharacterDetail, parseWeaponDetail, readManifestVersions,
  detectMergeRules, itemIconUrl
} from './hakushin.mjs';
import {calculateMultiPlan, collectInventoryCatalog, planMaterialUsage, migrateLegacyInventory} from './multi-planner.mjs';
import {
  saveActivePlannerAccount, selectPlannerAccount, createPlannerAccount,
  renamePlannerAccount, deletePlannerAccount
} from './planner-accounts.mjs';

const elementDefs = [
  {id:'Pyro',label:'火',color:'#ed8b55',icon:'flame'},
  {id:'Hydro',label:'水',color:'#68a8dd',icon:'droplet'},
  {id:'Electro',label:'雷',color:'#af83e4',icon:'zap'},
  {id:'Cryo',label:'冰',color:'#75c2d8',icon:'snowflake'},
  {id:'Anemo',label:'风',color:'#69c3aa',icon:'wind'},
  {id:'Geo',label:'岩',color:'#d8b76b',icon:'gem'},
  {id:'Dendro',label:'草',color:'#87b955',icon:'leaf'}
];
const weaponDefs = [
  {id:'Sword',label:'单手剑',icon:'sword'},
  {id:'Claymore',label:'双手剑',icon:'claymore'},
  {id:'Polearm',label:'长柄武器',icon:'spear'},
  {id:'Bow',label:'弓',icon:'bow'},
  {id:'Catalyst',label:'法器',icon:'book'}
];
const weaponAliases = {
  WEAPON_SWORD_ONE_HAND:'Sword', WEAPON_CLAYMORE:'Claymore',
  WEAPON_POLE:'Polearm', WEAPON_BOW:'Bow', WEAPON_CATALYST:'Catalyst'
};
const iconPaths={
  flame:'<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 3-3 4-4 5 0-3-1-5-3-8 0 4-4 8-4 12 0 4 4 7 8 7Z"/><path d="M12 22c2 0 4-2 4-4 0-2-1-3-3-5 0 2-3 3-3 5 0 2 1 4 2 4Z"/>',
  droplet:'<path d="M12 2c-3 5-8 9-8 14a8 8 0 0 0 16 0c0-5-5-9-8-14Z"/>',
  zap:'<path d="m13 2-9 12h7l-1 8 10-13h-7l0-7Z"/>',
  snowflake:'<path d="M12 2v20M4 6l16 12M20 6 4 18M8 4l4 3 4-3M8 20l4-3 4 3M3 10l4 2-4 2M21 10l-4 2 4 2"/>',
  wind:'<path d="M3 8h12c4 0 4-6 0-6-2 0-3 1-3 3M2 12h18M4 16h10c4 0 4 6 0 6-2 0-3-1-3-3"/>',
  gem:'<path d="m12 2 8 7v7l-8 6-8-6V9l8-7Z"/><path d="m4 9 8 4 8-4M12 13v9"/>',
  leaf:'<path d="M20 4C11 4 4 7 4 15a5 5 0 0 0 5 5c8 0 11-7 11-16Z"/><path d="M4 20c3-5 6-8 12-11"/>',
  sword:'<path d="m15 4 5-2-2 5-10 10-3-3L15 4ZM6 15l3 3M3 19l2 2 4-4"/>',
  claymore:'<path d="m14 2 8 8-11 11-8-8L14 2ZM6 14l4 4M3 21l4-4"/>',
  spear:'<path d="m20 2-3 7-5-2 8-5ZM15 9 4 20M3 21l3-3"/>',
  bow:'<path d="M5 3c12 0 14 6 14 9s-2 9-14 9M4 3l16 18M5 12h15M16 10l4 2-4 2"/>',
  book:'<path d="M4 4c3-1 6 0 8 2 2-2 5-3 8-2v15c-3-1-6 0-8 2-2-2-5-3-8-2V4ZM12 6v15"/>',
  star:'<path d="m12 2 3 7 7 .5-5.5 5 1.5 7.5-6-4-6 4 1.5-7.5L2 9.5 9 9l3-7Z"/>'
};
function svg(name){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||iconPaths.star}</svg>`;}
const $=id=>document.getElementById(id);
const host=window.chrome?.webview;
let sequence=0;const pending=new Map();
if(host){host.addEventListener('message',ev=>{
  const d=ev.data;if(!d||!pending.has(d.id))return;
  const task=pending.get(d.id);pending.delete(d.id);
  if(d.ok)task.resolve(d.data);else task.reject(new Error(d.error||'操作失败'));
});}
async function bridge(type,params={}){
  if(host){const id=String(++sequence);return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});host.postMessage({id,type,params});
  });}
  if(type==='storage.load')return JSON.parse(localStorage.getItem('genshin-planner-desktop')||'null');
  if(type==='storage.save'){localStorage.setItem('genshin-planner-desktop',JSON.stringify(params.state));return true;}
  if(type==='data.fetch'){
    const response=await fetch('https://static.nanoka.cc'+params.path);
    if(!response.ok)throw new Error('HTTP '+response.status);
    return {data:await response.json(),source:'network'};
  }
  if(type==='storage.export'){
    const blob=new Blob([JSON.stringify(params.state,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='原神养成规划.json';a.click();URL.revokeObjectURL(url);return true;
  }
  throw new Error('请在 Windows 桌面程序内使用该功能。');
}

let state=normalizeState(cloneDefaultState());
let characterList=[],weaponList=[];
let profiles=new Map();
let listVersion={live:'',latest:''};
let profileLoadToken=0;
let filter={tab:'character',search:'',element:'',weapon:'',star:0};
let saveTimer=null,writeChain=Promise.resolve(),toastTimeout=null;
let currentModalResolve=null;

const activePlan=()=>state.plans.find(p=>p.id===state.activePlanId)||state.plans[0];
const activeEntry=()=>({plan:activePlan(),characterProfile:profiles.get(activePlan().id)?.characterProfile||null,
  weaponProfile:profiles.get(activePlan().id)?.weaponProfile||null});
const allEntries=()=>state.plans.map(plan=>({plan,characterProfile:profiles.get(plan.id)?.characterProfile||null,
  weaponProfile:profiles.get(plan.id)?.weaponProfile||null}));
const asWeapon=id=>weaponAliases[id]||id||'';
const element=code=>elementDefs.find(item=>item.id===code);
const weapon=code=>weaponDefs.find(item=>item.id===asWeapon(code));
const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const numberFormat=n=>Number(n||0).toLocaleString('zh-CN');
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);

function setStatus(message,tone=''){$('dataStatus').textContent=message;$('dataStatus').dataset.tone=tone;}
function toast(message){clearTimeout(toastTimeout);const t=$('toast');t.textContent=message;t.classList.add('show');toastTimeout=setTimeout(()=>t.classList.remove('show'),2700);}
function syncActive(){const p=activePlan();state.source=structuredClone(p.source);state.config=structuredClone(p.config);}
function snapshot(){syncActive();saveActivePlannerAccount(state);return structuredClone(state);}
function flushSave(){clearTimeout(saveTimer);const data=snapshot();writeChain=writeChain.then(()=>bridge('storage.save',{state:data})).catch(error=>setStatus('保存失败：'+error.message,'error'));return writeChain;}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,300);}

function renderAccounts(){
  const select=$('accountSelect');select.replaceChildren();
  for(const row of state.plannerAccounts)select.add(new Option(row.name,row.id));
  select.value=state.activeAccountId;
  $('deleteAccountButton').disabled=state.plannerAccounts.length<=1;
}
function renderPlans(){
  const list=$('planList');list.replaceChildren();$('planCounter').textContent=state.plans.length+' 项';
  state.plans.forEach((p,i)=>{
    const box=document.createElement('button');box.type='button';
    box.className='plan-item'+(p.id===state.activePlanId?' active':'');
    box.setAttribute('role','option');box.setAttribute('aria-selected',String(p.id===state.activePlanId));
    const src=p.source;const art=characterList.find(x=>x.id===src.selectedCharacterId)?.icon||
      weaponList.find(x=>x.id===src.selectedWeaponId)?.icon||'';
    const image=document.createElement('div');image.className='plan-art';
    if(art){const img=document.createElement('img');img.src=art;img.alt='';img.onerror=()=>img.remove();image.append(img);}else{image.textContent='◇';}
    const label=document.createElement('div');label.className='plan-description';
    const title=document.createElement('strong');title.textContent='培养项 '+(i+1);
    const sub=document.createElement('span');sub.textContent=[src.selectedCharacterName,src.selectedWeaponName].filter(Boolean).join(' + ')||'选择角色或武器';
    label.append(title,sub);box.append(image,label);
    box.addEventListener('click',()=>{if(p.id===state.activePlanId)return;state.activePlanId=p.id;renderAll();scheduleSave();});
    list.append(box);
  });
  $('addPlanButton').disabled=state.plans.length>=40;
  const p=activePlan(),i=state.plans.indexOf(p)+1;
  $('activePlanLabel').textContent='培养项 '+i;
  $('activePlanTitle').textContent=[p.source.selectedCharacterName,p.source.selectedWeaponName].filter(Boolean).join(' + ')||'选择培养对象';
}
function makeChip(label,iconName,selected,onClick,color=''){
  const btn=document.createElement('button');btn.type='button';btn.className='filter-chip'+(selected?' active':'');
  if(iconName){const slot=document.createElement('span');slot.className='filter-icon';slot.innerHTML=svg(iconName);if(color)slot.style.color=color;btn.append(slot);}
  const name=document.createElement('span');name.textContent=label;btn.append(name);btn.addEventListener('click',onClick);return btn;
}
function renderFilters(){
  const isChar=filter.tab==='character';
  $('searchInput').placeholder=isChar?'搜索角色名称':'搜索武器名称';
  $('searchInput').value=filter.search;
  const stars=$('starFilters');stars.replaceChildren();
  stars.append(makeChip('全部星级',null,filter.star===0,()=>{filter.star=0;renderFilters();renderRoster();}));
  for(const n of (isChar?[5,4]:[5,4,3,2,1]))stars.append(makeChip(n+'★','star',filter.star===n,()=>{filter.star=n;renderFilters();renderRoster();}));
  const elem=$('elementFilters');elem.hidden=!isChar;elem.replaceChildren();
  if(isChar){
    elem.append(makeChip('全部元素',null,!filter.element,()=>{filter.element='';renderFilters();renderRoster();}));
    for(const e of elementDefs)elem.append(makeChip(e.label,e.icon,filter.element===e.id,()=>{filter.element=e.id;renderFilters();renderRoster();},e.color));
  }
  const wp=$('weaponFilters');wp.replaceChildren();
  wp.append(makeChip('全部武器类型',null,!filter.weapon,()=>{filter.weapon='';renderFilters();renderRoster();}));
  for(const w of weaponDefs)wp.append(makeChip(w.label,w.icon,filter.weapon===w.id,()=>{filter.weapon=w.id;renderFilters();renderRoster();}));
  for(const tab of document.querySelectorAll('[data-tab]')){
    const active=tab.dataset.tab===filter.tab;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));
  }
}
function rosterItem(row){
  const card=document.createElement('button');card.type='button';card.className='avatar-card';
  card.dataset.rarity=String(row.rarity||'');
  const isChar=filter.tab==='character';
  const selected=isChar?row.id===activePlan().source.selectedCharacterId:row.id===activePlan().source.selectedWeaponId;
  card.classList.toggle('selected',selected);
  const box=document.createElement('div');box.className='avatar-portrait';
  const fallback=document.createElement('span');fallback.className='avatar-fallback';fallback.textContent=(row.name||'?')[0];box.append(fallback);
  if(row.icon){const img=document.createElement('img');img.loading='lazy';img.alt='';img.src=row.icon;img.onerror=()=>img.remove();box.append(img);}
  if(isChar){
    const e=element(row.element),w=weapon(row.weaponType);
    if(e){const badge=document.createElement('span');badge.className='card-badge element';badge.style.color=e.color;badge.title=e.label+'元素';badge.innerHTML=svg(e.icon);box.append(badge);}
    if(w){const badge=document.createElement('span');badge.className='card-badge weapon';badge.title=w.label;badge.innerHTML=svg(w.icon);box.append(badge);}
  }else{const w=weapon(row.weaponType);if(w){const badge=document.createElement('span');badge.className='card-badge weapon';badge.title=w.label;badge.innerHTML=svg(w.icon);box.append(badge);}}
  const title=document.createElement('span');title.className='avatar-name';title.textContent=row.name;title.title=row.name;
  const meta=document.createElement('span');meta.className='avatar-meta';meta.textContent='★'.repeat(Math.min(Number(row.rarity)||0,5));
  card.append(box,title,meta);
  if(row.sourceTag){const flag=document.createElement('span');flag.className='avatar-preview';flag.textContent=row.sourceTag;card.append(flag);}
  card.title=row.name+(isChar?` · ${element(row.element)?.label||'未知元素'} · ${weapon(row.weaponType)?.label||'未知武器'}`:'');
  card.addEventListener('click',()=>selectObject(row));
  return card;
}
function renderRoster(){
  const selectedTab=filter.tab;
  const rows=(selectedTab==='character'?characterList:weaponList).filter(row=>{
    if(filter.search&&!row.name.toLowerCase().includes(filter.search.toLowerCase()))return false;
    if(filter.star&&Number(row.rarity)!==filter.star)return false;
    if(filter.weapon&&asWeapon(row.weaponType)!==filter.weapon)return false;
    if(selectedTab==='character'&&filter.element&&row.element!==filter.element)return false;
    return true;
  });
  $('rosterCount').textContent='共 '+rows.length+' 项';
  const area=$('rosterGrid');area.replaceChildren();
  if(!rows.length){const empty=document.createElement('div');empty.className='empty-hint';empty.textContent=(selectedTab==='character'&&!characterList.length||selectedTab==='weapon'&&!weaponList.length)?'正在读取 Nanoka 数据…':'没有符合筛选条件的对象';area.append(empty);return;}
  const frag=document.createDocumentFragment();for(const row of rows)frag.append(rosterItem(row));area.append(frag);
}
function selectObject(row){
  const p=activePlan(),s=p.source;
  if(filter.tab==='character'){
    s.selectedCharacterId=row.id;s.selectedCharacterName=row.name;s.selectedCharacterVersion=row.version;s.selectedCharacterTag=row.sourceTag;
  }else{
    s.selectedWeaponId=row.id;s.selectedWeaponName=row.name;s.selectedWeaponVersion=row.version;s.selectedWeaponTag=row.sourceTag;
  }
  profiles.delete(p.id);
  renderAll();scheduleSave();void reloadAllProfiles();
}
function clearObject(){
  const p=activePlan();if(filter.tab==='character'){
    Object.assign(p.source,{selectedCharacterId:'',selectedCharacterName:'',selectedCharacterVersion:'',selectedCharacterTag:''});
  }else{
    Object.assign(p.source,{selectedWeaponId:'',selectedWeaponName:'',selectedWeaponVersion:'',selectedWeaponTag:''});
  }
  profiles.delete(p.id);renderAll();scheduleSave();void reloadAllProfiles();
}
function renderTargets(){
  const area=$('targetGroups');area.replaceChildren();const p=activePlan();
  const config=p.config;
  const definitions=[
    {key:'charAsc',label:'角色突破',group:'角色与天赋',limit:6,enabled:Boolean(p.source.selectedCharacterId)},
    {key:'talentA',label:'普通攻击',group:'角色与天赋',limit:9,enabled:Boolean(p.source.selectedCharacterId)},
    {key:'talentE',label:'元素战技',group:'角色与天赋',limit:9,enabled:Boolean(p.source.selectedCharacterId)},
    {key:'talentQ',label:'元素爆发',group:'角色与天赋',limit:9,enabled:Boolean(p.source.selectedCharacterId)},
    {key:'weapAsc',label:'武器突破',group:'武器',limit:6,enabled:Boolean(p.source.selectedWeaponId)}
  ].filter(item=>item.enabled);
  if(!definitions.length){area.innerHTML='<div class="empty-hint">请选择角色、武器或两者组合后设置培养目标。</div>';return;}
  const groups=new Map();
  for(const def of definitions){
    let g=groups.get(def.group);if(!g){g=document.createElement('div');g.className='target-group';const label=document.createElement('div');label.className='target-label';label.textContent=def.group;g.append(label);groups.set(def.group,g);area.append(g);}
    const row=document.createElement('div');row.className='level-row';
    const label=document.createElement('label');label.textContent=def.label;
    const first=makeLevelSelect(def,0);const second=makeLevelSelect(def,1);second.classList.add('target-level');
    const arrow=document.createElement('span');arrow.className='level-arrow';arrow.textContent='→';
    row.append(label,first,arrow,second);g.append(row);
  }
}
function makeLevelSelect(def,pos){
  const select=document.createElement('select');select.setAttribute('aria-label',def.label+(pos?'目标':'当前'));
  for(let i=0;i<=def.limit;i++){
    const text=def.limit===6?CHAR_LEVEL_LABELS[i]:(i+1)+' 级';
    select.add(new Option(text,String(i)));
  }
  select.value=String(activePlan().config[def.key]?.[pos]||0);
  select.addEventListener('change',()=>{
    const c=activePlan().config[def.key];c[pos]=Number(select.value);
    if(c[1]<c[0])c[1-pos]=c[pos];
    renderTargets();renderResults();scheduleSave();
  });
  return select;
}
function materialRow(item,shared){
  const row=document.createElement('div');row.className='material-row';
  const imageSlot=document.createElement('div');imageSlot.className='material-img';imageSlot.dataset.rank=String(item.rank);
  const img=document.createElement('img');img.loading='lazy';img.alt='';img.src=itemIconUrl(item.id);img.onerror=()=>img.remove();imageSlot.append(img);
  const title=document.createElement('div');title.className='material-item-copy';
  const name=document.createElement('div');name.className='material-name';name.textContent=item.name;name.title=item.name;title.append(name);
  if(shared){const label=document.createElement('div');label.className='material-share';label.textContent='共用 · '+shared;title.append(label);}
  const input=document.createElement('input');input.type='text';input.inputMode='numeric';input.value=state.materialInventory[item.id]||'';input.placeholder='0';
  input.setAttribute('aria-label',item.name+'背包数量');
  input.addEventListener('input',()=>{
    const value=input.value;
    if(value.trim())state.materialInventory[item.id]=value;else delete state.materialInventory[item.id];
    renderResults();scheduleSave();
  });
  row.append(imageSlot,title,input);return row;
}
function renderInventory(){
  const holder=$('inventoryGroups');holder.replaceChildren();
  const entry=activeEntry();
  if(!entry.plan.source.selectedCharacterId&&!entry.plan.source.selectedWeaponId){
    const empty=document.createElement('div');empty.className='empty-hint';
    empty.textContent='选择角色或武器后显示对应背包材料';holder.append(empty);return;
  }
  const catalogue=collectInventoryCatalog([entry]);
  const all=allEntries();const usage=planMaterialUsage(all);
  const categories=[
    ['basicInventory','基础与专属材料'],['cultInventory','角色培养素材'],
    ['talentInventory','天赋与角色突破'],['weaponInventory','武器突破材料']
  ];
  let shown=0;
  for(const [category,label] of categories){
    const entries=catalogue[category];if(!entries.length)continue;
    const section=document.createElement('section');section.className='material-group';
    const header=document.createElement('header');header.textContent=label;
    const rows=document.createElement('div');rows.className='material-rows';
    const unique=new Set();
    for(const group of entries)for(const item of group.rows){
      if(unique.has(item.id))continue;unique.add(item.id);shown++;
      let shared='';
      if((usage.get(item.id)||0)>1){
        const names=[];for(let i=0;i<all.length;i++)if(all[i].plan.id!==activePlan().id){
          const cats=collectInventoryCatalog([all[i]]);
          if(Object.values(cats).some(groups=>groups.some(g=>g.rows.some(row=>row.id===item.id))))names.push('培养项 '+(i+1));
        }
        shared=names.join('、');
      }
      rows.append(materialRow(item,shared));
    }
    section.append(header,rows);holder.append(section);
  }
  if(!shown){const empty=document.createElement('div');empty.className='empty-hint';empty.textContent=entry.plan.source.selectedCharacterId||entry.plan.source.selectedWeaponId?'正在读取当前培养项材料…':'选择角色或武器后显示对应背包材料';holder.append(empty);}
}
function renderResults(){
  const result=calculateMultiPlan(allEntries(),state.materialInventory);
  const holder=$('resultContent');holder.replaceChildren();
  const rows=result.groups.flatMap(g=>g.rows).filter(r=>r.lack>0);
  const summary=$('resultSummary');
  if(result.unavailable.length){summary.textContent=result.unavailable.length+' 项材料资料等待加载';}
  else if(!result.hasAnyTarget){summary.textContent='选择目标后查看合并需求';}
  else if(rows.length){summary.textContent='共 '+rows.length+' 种材料仍需补齐';}
  else {summary.textContent='当前培养目标已满足';}
  if(!rows.length&&!result.incomplete.length&&!result.unavailable.length){
    const empty=document.createElement('div');empty.className='empty-hint';empty.style.color='#c4d0de';empty.textContent=result.hasAnyTarget?'背包材料已覆盖所有培养项的目标需求':'设置培养目标后显示全部需求';holder.append(empty);return;
  }
  for(const group of result.groups){
    const lacking=group.rows.filter(r=>r.lack>0);if(!lacking.length)continue;
    const section=document.createElement('div');section.className='deficit-group';
    const title=document.createElement('h3');title.textContent=group.title;section.append(title);
    for(const row of lacking){const line=document.createElement('div');line.className='deficit-row';const name=document.createElement('span');name.textContent=row.name;
      const value=document.createElement('strong');value.textContent='缺 × '+numberFormat(row.lack);line.append(name,value);section.append(line);}
    holder.append(section);
  }
  for(const message of [...result.unavailable,...result.incomplete.map(m=>m.plan+' · '+m.title)]){
    const warning=document.createElement('div');warning.className='deficit-group';warning.textContent=message+' · 材料资料待补充';holder.append(warning);
  }
}
function renderAll(){renderAccounts();renderPlans();renderFilters();renderRoster();renderTargets();renderInventory();renderResults();}

async function loadLists(force=false){
  setStatus('正在读取 Nanoka 角色和武器资料…');
  try{
    const manifest=await bridge('data.fetch',{path:'/manifest.json',force,maxAge:21600000});
    listVersion=readManifestVersions(manifest.data);
    const sources=await Promise.all([
      ['character',listVersion.live],['character',listVersion.latest],
      ['weapon',listVersion.live],['weapon',listVersion.latest]
    ].map(async([kind,version])=>{
      const out=await bridge('data.fetch',{path:`/gi/${encodeURIComponent(version)}/${kind}.json`,force,maxAge:43200000});
      return {kind,version,data:out.data};
    }));
    const roleLive=normalizeCharacterList(sources[0].data).map(r=>({...r,version:listVersion.live}));
    const roleLatest=normalizeCharacterList(sources[1].data).map(r=>({...r,version:listVersion.latest}));
    const weaponLive=normalizeWeaponList(sources[2].data).map(r=>({...r,version:listVersion.live}));
    const weaponLatest=normalizeWeaponList(sources[3].data).map(r=>({...r,version:listVersion.latest}));
    characterList=mergeSourceLists(roleLive,roleLatest);
    weaponList=mergeSourceLists(weaponLive,weaponLatest);
    await reloadAllProfiles(force);
    setStatus('已载入 '+characterList.length+' 名角色、'+weaponList.length+' 件武器','success');
  }catch(error){setStatus('资料读取失败：'+error.message,'error');toast('可以检查网络后点击刷新资料');}
  renderAll();
}
async function loadProfile(plan,force=false){
  const source=plan.source;
  const selectedChar=characterList.find(r=>r.id===source.selectedCharacterId);
  const selectedWeapon=weaponList.find(r=>r.id===source.selectedWeaponId);
  const items=await Promise.allSettled([
    selectedChar?bridge('data.fetch',{path:`/gi/${encodeURIComponent(selectedChar.version)}/zh/character/${selectedChar.id}.json`,force,maxAge:86400000}).then(r=>parseCharacterDetail(r.data,selectedChar)):Promise.resolve(null),
    selectedWeapon?bridge('data.fetch',{path:`/gi/${encodeURIComponent(selectedWeapon.version)}/zh/weapon/${selectedWeapon.id}.json`,force,maxAge:86400000}).then(r=>parseWeaponDetail(r.data,selectedWeapon)):Promise.resolve(null)
  ]);
  const c=items[0].status==='fulfilled'?items[0].value:null;
  const w=items[1].status==='fulfilled'?items[1].value:null;
  if(c){source.selectedCharacterName=c.name;source.selectedCharacterVersion=c.version;source.selectedCharacterTag=c.sourceTag;}
  if(w){source.selectedWeaponName=w.name;source.selectedWeaponVersion=w.version;source.selectedWeaponTag=w.sourceTag;}
  source.mergeRules=detectMergeRules(c,w);
  return {characterProfile:c,weaponProfile:w};
}
async function reloadAllProfiles(force=false){
  const serial=++profileLoadToken;const account=state.activeAccountId;
  const plans=[...state.plans];
  const pairs=await Promise.all(plans.map(plan=>loadProfile(plan,force)));
  if(serial!==profileLoadToken||account!==state.activeAccountId)return;
  profiles=new Map(plans.map((plan,i)=>[plan.id,pairs[i]]));
  if(!state.materialInventoryMigrated){
    const first=plans[0],entry=profiles.get(first.id);
    const canMigrate=(!first.source.selectedCharacterId||entry.characterProfile)&&(!first.source.selectedWeaponId||entry.weaponProfile);
    if(canMigrate){const legacy=migrateLegacyInventory(state.inv,entry.characterProfile,entry.weaponProfile,first.source.mergeRules);
      state.materialInventory={...legacy,...state.materialInventory};state.materialInventoryMigrated=true;}
  }
  renderAll();scheduleSave();
}

function modal({title,description='',value='',confirm='确认',requiresText=true}){
  $('modalTitle').textContent=title;$('modalDescription').textContent=description;
  $('modalInput').hidden=!requiresText;$('modalInput').value=value;$('modalConfirm').textContent=confirm;
  $('modal').hidden=false;
  if(requiresText)$('modalInput').focus();else $('modalConfirm').focus();
  return new Promise(resolve=>{currentModalResolve=resolve;});
}
function closeModal(accept){if(!currentModalResolve)return;const done=currentModalResolve;currentModalResolve=null;
  const text=$('modalInput').value.trim();$('modal').hidden=true;done(accept?text:null);}
async function addAccount(){const name=await modal({title:'添加规划账号',description:'新账号会创建独立的培养项和背包数据。',value:''});if(name===null)return;
  try{const defaults=normalizeState(cloneDefaultState());createPlannerAccount(state,'account-'+uid(),name,defaults);
    profiles.clear();profileLoadToken++;filter={tab:'character',search:'',element:'',weapon:'',star:0};renderAll();scheduleSave();toast('已创建账号');}
  catch(error){toast(error.message);}}
async function renameAccount(){const record=state.plannerAccounts.find(x=>x.id===state.activeAccountId);
  const name=await modal({title:'重命名账号',value:record?.name||''});if(name===null)return;
  try{renamePlannerAccount(state,state.activeAccountId,name);renderAccounts();scheduleSave();}catch(e){toast(e.message);}}
async function removeAccount(){if(state.plannerAccounts.length<=1)return;
  const result=await modal({title:'删除规划账号',description:'将永久删除该账号的培养项与背包记录。',confirm:'删除账号',requiresText:false});
  if(result===null)return;
  try{deletePlannerAccount(state,state.activeAccountId);profiles.clear();profileLoadToken++;renderAll();scheduleSave();void reloadAllProfiles();}
  catch(e){toast(e.message);}}
function switchAccount(id){if(!id||id===state.activeAccountId)return;
  selectPlannerAccount(state,id);profiles.clear();profileLoadToken++;filter={tab:'character',search:'',element:'',weapon:'',star:0};
  renderAll();scheduleSave();void reloadAllProfiles();}
function addPlan(){if(state.plans.length>=40)return toast('最多可创建 40 个培养项');const defaults=cloneDefaultState();
  const plan={id:'item-'+uid(),source:defaults.source,config:defaults.config};state.plans.push(plan);state.activePlanId=plan.id;
  renderAll();scheduleSave();}
async function removePlan(){const p=activePlan();if(!p)return;
  if(state.plans.length===1){const def=cloneDefaultState();state.plans=def.plans;state.activePlanId=def.activePlanId;}
  else{const i=state.plans.findIndex(x=>x.id===p.id);state.plans.splice(i,1);state.activePlanId=state.plans[Math.min(i,state.plans.length-1)].id;}
  profiles.delete(p.id);renderAll();scheduleSave();}
async function exportAll(){try{const result=await bridge('storage.export',{state:{type:'material-planner-desktop-config',version:1,exportedAt:new Date().toISOString(),data:snapshot()}});
  if(result)toast('规划已导出');}catch(e){toast(e.message);}}
async function importAll(){try{const result=await bridge('storage.import');if(result===null)return;
  const raw=result?.data||result;const next=normalizeState(raw);
  const answer=await modal({title:'导入规划',description:'将替换当前所有账号、培养项与背包记录。',confirm:'导入',requiresText:false});
  if(answer===null)return;
  state=next;profiles.clear();profileLoadToken++;filter={tab:'character',search:'',element:'',weapon:'',star:0};
  renderAll();await flushSave();await reloadAllProfiles();toast('规划已导入');
}catch(e){toast('导入失败：'+e.message);}}

async function start(){
  $('modalCancel').addEventListener('click',()=>closeModal(false));
  $('modalConfirm').addEventListener('click',()=>closeModal(true));
  $('modalInput').addEventListener('keydown',e=>{if(e.key==='Enter')closeModal(true);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal(false);});
  $('accountSelect').addEventListener('change',e=>switchAccount(e.target.value));
  $('addAccountButton').addEventListener('click',addAccount);
  $('renameAccountButton').addEventListener('click',renameAccount);
  $('deleteAccountButton').addEventListener('click',removeAccount);
  $('addPlanButton').addEventListener('click',addPlan);
  $('removePlanButton').addEventListener('click',removePlan);
  $('clearSelectionButton').addEventListener('click',clearObject);
  $('refreshButton').addEventListener('click',()=>void loadLists(true));
  $('exportButton').addEventListener('click',exportAll);
  $('importButton').addEventListener('click',importAll);
  $('searchInput').addEventListener('input',e=>{filter.search=e.target.value;renderRoster();});
  document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    filter.tab=btn.dataset.tab;filter.search='';filter.element='';filter.weapon='';filter.star=0;renderFilters();renderRoster();
  }));
  try{const saved=await bridge('storage.load');if(saved)state=normalizeState(saved);}catch(e){toast('读取本地规划失败：'+e.message);}
  renderAll();await loadLists();
}
void start();
