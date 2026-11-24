import {CHAR_LEVEL_LABELS, cloneDefaultState, normalizeState, safeEval} from './core.mjs';
import {
  normalizeCharacterList, normalizeWeaponList, mergeSourceLists,
  parseCharacterDetail, parseWeaponDetail, readManifestVersions,
  detectMergeRules, itemIconUrl
} from './hakushin.mjs';
import {calculateMultiPlan, collectInventoryCatalog, planMaterialUsage, migrateLegacyInventory, materialContributions} from './multi-planner.mjs';
import {initializePlanner,makeGoal,makeWeaponInstance,characterGoal,weaponGoal,weaponInstance,goalKind,goalObjectId,activeGoals,visibleRoster,setLink,removeWeaponInstance,newId} from './planner-model.mjs';
import {importGOOD,validateGOOD} from './good-import.mjs';
import {calendarForEntries} from './calendar-days.mjs';
import {createRosterFilter,toggleRosterFilter,matchesRosterFilter} from './roster-filters.mjs';
import {installMiyoushePanel} from './mys-panel.mjs';
import {activeMaterialInventory,selectInventoryMode,setManualMaterial,applySyncedInventory} from './inventory-mode.mjs';
import {indexBannerReleases,mergeBannerReleases,parseReleaseTable,attachReleaseDates,compareRosterRelease} from './release-order.mjs';
import {
  saveActivePlannerAccount, selectPlannerAccount, createPlannerAccount,
  renamePlannerAccount, deletePlannerAccount
} from './planner-accounts.mjs';

const elementDefs = [
  {id:'Pyro',label:'火',color:'#ed8b55',icon:'flame',asset:'pyro.webp'},
  {id:'Hydro',label:'水',color:'#68a8dd',icon:'droplet',asset:'hydro.webp'},
  {id:'Electro',label:'雷',color:'#af83e4',icon:'zap',asset:'electro.webp'},
  {id:'Cryo',label:'冰',color:'#75c2d8',icon:'snowflake',asset:'cryo.webp'},
  {id:'Anemo',label:'风',color:'#69c3aa',icon:'wind',asset:'anemo.webp'},
  {id:'Geo',label:'岩',color:'#d8b76b',icon:'gem',asset:'geo.webp'},
  {id:'Dendro',label:'草',color:'#87b955',icon:'leaf',asset:'dendro.webp'}
];
const weaponDefs = [
  {id:'Sword',label:'单手剑',icon:'sword',asset:'sword.webp'},
  {id:'Claymore',label:'双手剑',icon:'claymore',asset:'claymore.png'},
  {id:'Polearm',label:'长柄武器',icon:'spear',asset:'polearm.png'},
  {id:'Bow',label:'弓',icon:'bow',asset:'bow.png'},
  {id:'Catalyst',label:'法器',icon:'book',asset:'catalyst.webp'}
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
  'all-elements':'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
  'all-weapons':'<path d="M4 4l16 16M20 4L4 20M3 8l5-5M16 21l5-5M16 3l5 5M3 16l5 5"/>',
  pause:'<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
  play:'<path d="M7 4.5 19 12 7 19.5Z" fill="currentColor" stroke="none"/>',
  settings:'<path d="M10 2h4l.6 3 2 .9 2.6-1.5 2.4 2.4-1.5 2.6.9 2 3 .6v4l-3 .6-.9 2 1.5 2.6-2.4 2.4-2.6-1.5-2 .9-.6 3h-4l-.6-3-2-.9-2.6 1.5-2.4-2.4 1.5-2.6-.9-2L0 16v-4l3-.6.9-2L2.4 6.8l2.4-2.4 2.6 1.5 2-.9Z" transform="translate(2 0) scale(.83)" fill="currentColor" stroke="none"/><circle cx="12" cy="11.6" r="3.4" fill="#263240" stroke="none"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
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
  if(type==='ui.layout.load')return JSON.parse(localStorage.getItem('genshin-planner-desktop-layout')||'null');
  if(type==='ui.layout.save'){localStorage.setItem('genshin-planner-desktop-layout',JSON.stringify(params.layout));return true;}
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
let filter=createRosterFilter();
let selectedGoalId=null,inventoryGoalId=null,selectedRosterKey=null,goalEditor=null;
let saveTimer=null,writeChain=Promise.resolve(),toastTimeout=null;
let currentModalResolve=null;

const COLUMN_MIN=[460,250,290];
const DEFAULT_COLUMNS=[860,310,412];
const RESIZER_WIDTH=6;
let columnWidths=[...DEFAULT_COLUMNS],layoutSaveTimer=null,layoutSaveChain=Promise.resolve();
function fittedColumns(proposed,total){
  const result=proposed.map((v,i)=>Number.isFinite(v)?Math.max(COLUMN_MIN[i],Math.round(v)):DEFAULT_COLUMNS[i]);
  const target=Math.max(COLUMN_MIN.reduce((a,b)=>a+b,0),Math.round(total)-RESIZER_WIDTH*2);
  let delta=target-result.reduce((a,b)=>a+b,0);
  if(delta>=0){result[1]+=delta;return result;}
  for(const index of [0,2,1]){
    const removable=Math.min(-delta,Math.max(0,result[index]-COLUMN_MIN[index]));
    result[index]-=removable;delta+=removable;
    if(delta>=0)break;
  }
  return result;
}
function displayColumns(){
  const root=$('workbench');
  columnWidths=fittedColumns(columnWidths,root.clientWidth);
  root.style.gridTemplateColumns=columnWidths.map((v,i)=>i<2?`${v}px ${RESIZER_WIDTH}px`:`${v}px`).join(' ');
  for(const handle of root.querySelectorAll('.column-resizer')){
    const index=Number(handle.dataset.divider);
    handle.setAttribute('aria-valuenow',String(columnWidths.slice(0,index+1).reduce((a,b)=>a+b,0)));
  }
}
function saveColumns(){
  clearTimeout(layoutSaveTimer);
  const layout={columns:[...columnWidths]};
  layoutSaveChain=layoutSaveChain.then(()=>bridge('ui.layout.save',{layout})).catch(e=>setStatus('保存列宽失败：'+e.message,'error'));
}
function deferSaveColumns(){
  clearTimeout(layoutSaveTimer);
  layoutSaveTimer=setTimeout(saveColumns,350);
}
async function initializeColumns(){
  const root=$('workbench');
  try{
    const saved=await bridge('ui.layout.load');
    if(Array.isArray(saved?.columns)&&saved.columns.length===3&&saved.columns.every(v=>Number.isFinite(v)&&v>0)){
      columnWidths=saved.columns.map(Number);
    }
  }catch(e){setStatus('读取列宽失败：'+e.message,'error');}
  displayColumns();
  const observer=new ResizeObserver(()=>{displayColumns();deferSaveColumns();});
  observer.observe(root);
  for(const handle of root.querySelectorAll('.column-resizer')){
    const index=Number(handle.dataset.divider);
    handle.addEventListener('pointerdown',ev=>{
      if(ev.button!==0)return;
      const starting=[...columnWidths],startX=ev.clientX;
      handle.setPointerCapture(ev.pointerId);
      handle.classList.add('dragging');document.body.classList.add('resizing-columns');
      const drag=move=>{
        const delta=Math.round(move.clientX-startX);
        const bounded=Math.max(COLUMN_MIN[index]-starting[index],
          Math.min(starting[index+1]-COLUMN_MIN[index+1],delta));
        columnWidths=[...starting];columnWidths[index]+=bounded;columnWidths[index+1]-=bounded;
        displayColumns();
      };
      const finish=()=>{
        handle.removeEventListener('pointermove',drag);
        handle.removeEventListener('pointerup',finish);
        handle.removeEventListener('pointercancel',finish);
        handle.classList.remove('dragging');document.body.classList.remove('resizing-columns');
        saveColumns();
      };
      handle.addEventListener('pointermove',drag);
      handle.addEventListener('pointerup',finish);
      handle.addEventListener('pointercancel',finish);
    });
    handle.addEventListener('keydown',ev=>{
      if(ev.key!=='ArrowLeft'&&ev.key!=='ArrowRight')return;
      ev.preventDefault();
      const delta=ev.key==='ArrowRight'?12:-12;
      const bounded=Math.max(COLUMN_MIN[index]-columnWidths[index],
        Math.min(columnWidths[index+1]-COLUMN_MIN[index+1],delta));
      columnWidths[index]+=bounded;columnWidths[index+1]-=bounded;
      displayColumns();saveColumns();
    });
  }
}


function setStatus(text,tone=''){const node=$('dataStatus');node.textContent=text;node.dataset.tone=tone;}
function toast(message){clearTimeout(toastTimeout);const t=$('toast');t.textContent=message;t.classList.add('show');toastTimeout=setTimeout(()=>t.classList.remove('show'),3500);}
function snapshot(){
  const active=state.plans.find(g=>g.id===state.activePlanId)||state.plans[0];
  if(active){state.source=structuredClone(active.source);state.config=structuredClone(active.config);}
  saveActivePlannerAccount(state);return structuredClone(state);
}
function flushSave(){clearTimeout(saveTimer);const data=snapshot();writeChain=writeChain.then(()=>bridge('storage.save',{state:data})).catch(e=>setStatus('保存失败：'+e.message,'error'));return writeChain;}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,300);}

const goalById=id=>state.plans.find(g=>g.id===id)||null;
const selectedGoal=()=>goalById(selectedGoalId);
const profileFor=goal=>profiles.get(goal?.id)||{};
const entries=()=>state.plans.map(plan=>({plan,characterProfile:profileFor(plan).characterProfile||null,
  weaponProfile:profileFor(plan).weaponProfile||null}));
const sourceFor=(row,kind)=>({name:row.name,id:String(row.id),version:row.version||'',tag:row.sourceTag||'',kind});
const tierColor=rank=>Number(rank)===5?'gold':Number(rank)===4?'purple':'blue';
const displayNum=n=>Number(n||0).toLocaleString('zh-CN');
const objName=goal=>{
  const name=goal?.source?.[goalKind(goal)==='character'?'selectedCharacterName':'selectedWeaponName']||'未知对象';
  if(goalKind(goal)!=='weapon')return name;
  const all=state.weaponInstances.filter(w=>w.weaponId===goalObjectId(goal));
  if(all.length<=1)return name;
  const index=all.findIndex(w=>w.id===goal.weaponInstanceId);
  return index>=0?`${name} #${index+1}`:name;
};
const charRow=id=>characterList.find(x=>x.id===String(id));
const weaponRow=id=>weaponList.find(x=>x.id===String(id));
function save(){saveActivePlannerAccount(state);scheduleSave();}
function renderAccounts(){const select=$('accountSelect');select.replaceChildren();
  for(const a of state.plannerAccounts)select.add(new Option(a.name,a.id));
  select.value=state.activeAccountId;$('deleteAccountButton').disabled=state.plannerAccounts.length<=1;
}
function thumb(icon,name,css=''){
  const holder=document.createElement('span');holder.className=css;
  const fallback=document.createElement('span');fallback.textContent=String(name||'?')[0];fallback.className='thumb-fallback';
  fallback.hidden=Boolean(icon);holder.append(fallback);
  if(icon){const img=document.createElement('img');img.alt='';
    img.onerror=()=>{img.remove();fallback.hidden=false;};img.src=icon;holder.append(img);
  }
  return holder;
}
function editButton(onEdit,css='card-settings'){
  const button=document.createElement('button');button.type='button';button.className=css;
  button.title='设置培养目标';button.setAttribute('aria-label',button.title);
  const icon=document.createElement('img');icon.src='icons/settings.png';icon.alt='';icon.onerror=()=>{button.innerHTML=svg('settings');};button.append(icon);button.onclick=ev=>{ev.stopPropagation();onEdit();};return button;
}
function bindCard(node,onSelect,onEdit){
  node.addEventListener('click',ev=>{if(!ev.target.closest('button,input,select'))onSelect();});
  node.addEventListener('keydown',ev=>{
    if(ev.target!==node)return;
    if(ev.key==='Enter'){ev.preventDefault();onEdit();}
    else if(ev.key===' '){ev.preventDefault();onSelect();}
  });
}
function refreshSelection(){
  for(const node of document.querySelectorAll('[data-goal-id],[data-roster-key]')){
    const selected=node.dataset.goalId?node.dataset.goalId===selectedGoalId:
      Boolean(node.dataset.rosterKey&&node.dataset.rosterKey===selectedRosterKey);
    node.classList.toggle('selected',selected);node.setAttribute('aria-pressed',String(selected));
  }
  renderInventory();renderResults();
}
function selectGoal(id){
  selectedRosterKey=null;
  if(id===selectedGoalId)selectedGoalId=null;
  else {selectedGoalId=id;inventoryGoalId=id;}
  refreshSelection();
}
function renderGoals(){
  const root=$('activeGoals');root.replaceChildren();
  const pending=state.plans.filter(g=>!g.completed&&goalObjectId(g));
  $('activeGoalCount').textContent=`${pending.filter(g=>g.enabled!==false).length} 项培养中`;
  if(!pending.length){root.innerHTML='<span class="empty-strip">点击角色或武器卡片的设置按钮，添加培养目标。</span>';return;}
  for(const goal of pending){
    const kind=goalKind(goal),row=kind==='character'?charRow(goalObjectId(goal)):weaponRow(goalObjectId(goal));
    const card=document.createElement('div');card.className='goal-card'+(selectedGoalId===goal.id?' selected':'')+(goal.enabled===false?' paused':'');
    card.tabIndex=0;card.dataset.goalId=goal.id;card.setAttribute('role','button');card.setAttribute('aria-label',objName(goal)+'，单击选择');
    const artwork=thumb(row?.icon,objName(goal),'goal-art');
    if(goal.enabled===false){
      const badge=document.createElement('span');badge.className='goal-paused';badge.textContent='暂停';
      artwork.append(badge);
    }
    card.append(artwork);
    const description=document.createElement('span');description.className='goal-description';
    const title=document.createElement('strong');title.textContent=objName(goal);
    const info=document.createElement('small');
    const obj=weaponInstance(state,goal.weaponInstanceId);
    info.textContent=kind==='weapon'?(obj?`Lv.${obj.level} · R${obj.refinement}${obj.location?' · '+obj.location:''}`:'武器培养目标'):'角色培养目标';
    description.append(title,info);card.append(description);
    const toggle=document.createElement('button');toggle.type='button';toggle.className='goal-toggle';
    toggle.innerHTML=svg(goal.enabled===false?'play':'pause');
    toggle.title=goal.enabled===false?'恢复计算':'暂停计算';toggle.setAttribute('aria-label',toggle.title);
    toggle.onclick=e=>{e.stopPropagation();goal.enabled=goal.enabled===false;renderAll();save();};card.append(toggle);
    card.append(editButton(()=>openEditor(goal),'goal-toggle goal-settings'));
    bindCard(card,()=>selectGoal(goal.id),()=>openEditor(goal));root.append(card);
  }
}
function typeIcon(def,kind){
  const holder=document.createElement('span');holder.className='filter-icon'+(kind==='weapons'?' weapon-type':'');
  const img=document.createElement('img');img.alt='';img.src=`icons/${kind}/${def.asset}`;
  img.addEventListener('error',()=>{img.remove();holder.innerHTML=svg(def.icon);});
  holder.append(img);return holder;
}
function makeChip(label,iconDef,selected,onClick,iconOnly=false){
  const btn=document.createElement('button');btn.type='button';
  btn.className='filter-chip'+(selected?' active':'')+(iconOnly?' icon-only':'');
  btn.title=label;btn.setAttribute('aria-label',label);btn.setAttribute('aria-pressed',String(selected));
  if(iconDef){btn.append(typeof iconDef==='object'
    ?typeIcon(iconDef,elementDefs.includes(iconDef)?'elements':'weapons')
    :Object.assign(document.createElement('span'),{innerHTML:svg(iconDef),className:'filter-icon'}));}
  if(!iconOnly){const name=document.createElement('span');name.textContent=label;btn.append(name);}
  btn.onclick=onClick;return btn;
}
function badgeIcon(container,def,kind){const img=document.createElement('img');img.alt='';img.src=`icons/${kind}/${def.asset}`;
  img.onerror=()=>{img.remove();container.innerHTML=svg(def.icon);};container.append(img);}
function renderFilters(){
  const isChar=filter.tab==='character';
  $('searchInput').placeholder=isChar?'搜索角色名称':'搜索武器名称';
  $('searchInput').value=filter.search;
  const redraw=(key,value)=>{
    toggleRosterFilter(filter,key,value);
    renderFilters();renderRoster();
  };
  const reset=key=>{filter[key]=[];renderFilters();renderRoster();};
  const stars=$('starFilters');stars.replaceChildren();
  stars.append(makeChip('全部',null,filter.star.length===0,()=>reset('star')));
  for(const n of (isChar?[5,4]:[5,4,3,2,1])){
    stars.append(makeChip(n+'★','star',filter.star.includes(n),()=>redraw('star',n)));
  }
  const elems=$('elementFilters');elems.replaceChildren();elems.hidden=!isChar;
  if(isChar){
    elems.append(makeChip('全部',null,filter.element.length===0,()=>reset('element')));
    for(const el of elementDefs){
      elems.append(makeChip(el.label,el,filter.element.includes(el.id),()=>redraw('element',el.id),true));
    }
  }
  const weapons=$('weaponFilters');weapons.replaceChildren();
  weapons.append(makeChip('全部',null,filter.weapon.length===0,()=>reset('weapon')));
  for(const weapon of weaponDefs){
    weapons.append(makeChip(weapon.label,weapon,filter.weapon.includes(weapon.id),()=>redraw('weapon',weapon.id),true));
  }
  for(const tab of document.querySelectorAll('[data-tab]')){
    const yes=tab.dataset.tab===filter.tab;
    tab.classList.toggle('active',yes);
    tab.setAttribute('aria-selected',String(yes));
  }
}
function rosterCard(row){
  const kind=filter.tab,goal=row.goal||null;
  const selectionKey=kind==='weapon'&&row.instance?`weapon:${row.instance.id}`:`${kind}:${row.id}`;
  const card=document.createElement('div');card.className='avatar-card';card.tabIndex=0;
  card.setAttribute('role','button');card.setAttribute('aria-label',row.name+'，单击选择');
  card.dataset.rosterKey=selectionKey;if(goal)card.dataset.goalId=goal.id;
  card.dataset.rarity=String(row.rarity||'');
  card.classList.toggle('selected',Boolean(goal&&selectedGoalId===goal.id)||(!goal&&selectedRosterKey===selectionKey));
  card.classList.toggle('planned',Boolean(goal&&!goal.completed));
  card.classList.toggle('completed',Boolean(goal?.completed));
  card.classList.toggle('owned',Boolean(row.owned));
  const artwork=thumb(row.icon,row.name,'avatar-portrait');
  const badge=(definition,kind,position)=>{
    if(!definition)return;
    const holder=document.createElement('span');
    holder.className='card-badge '+position;holder.title=definition.label;
    badgeIcon(holder,definition,kind);artwork.append(holder);
  };
  if(kind==='character'){
    badge(elementDefs.find(x=>x.id===row.element),'elements','element');
  }
  if(goal&&!goal.completed){
    const training=document.createElement('span');training.className='card-badge training';
    training.title=goal.enabled===false?'培养目标已暂停':'正在培养';
    const symbol=document.createElement('img');symbol.src='icons/development.webp';symbol.alt='';
    training.append(symbol);artwork.append(training);
  }else if(goal?.completed){
    const done=document.createElement('span');done.className='avatar-status done';done.textContent='✓';
    done.title='养成结束';artwork.append(done);
  }
  if(row.instance){
    const ordinal=state.weaponInstances.filter(w=>w.weaponId===row.id).findIndex(w=>w.id===row.instance.id)+1;
    const marker=document.createElement('span');marker.className='avatar-instance';
    marker.textContent='#'+String(ordinal);artwork.append(marker);
  }
  if(row.sourceTag){
    const preview=document.createElement('span');preview.className='avatar-preview';
    preview.textContent=row.sourceTag;artwork.append(preview);
  }
  const title=document.createElement('span');title.className='avatar-name';
  title.textContent=row.name;title.title=row.name;
  card.append(artwork,title);
  const onEdit=()=>openEditor(goal,{kind,row,instance:row.instance||null});
  artwork.append(editButton(onEdit));
  bindCard(card,()=>{
    if(goal){selectGoal(goal.id);return;}
    selectedRosterKey=selectedRosterKey===selectionKey?null:selectionKey;
    selectedGoalId=null;inventoryGoalId=null;refreshSelection();
  },onEdit);
  return card;
}
function renderRoster(){
  let rows=visibleRoster(state,filter.tab,characterList,weaponList,compareRosterRelease);
  rows=rows.filter(row=>matchesRosterFilter(row,filter,weaponAliases));
  $('rosterCount').textContent=rows.length+' 项';
  const area=$('rosterGrid');area.replaceChildren();
  if(!rows.length){area.innerHTML='<div class="empty-hint">暂无符合条件的对象，或正在加载资料。</div>';return;}
  const frag=document.createDocumentFragment();for(const row of rows)frag.append(rosterCard(row));area.append(frag);
}
function addGoalFromRow(kind,row,instance){
  if(kind==='character'){
    const old=characterGoal(state,row.id);if(old)return old;
    const goal=makeGoal('character',row,{current:state.ownedCharacters[row.id]});state.plans.push(goal);return goal;
  }
  const target=instance||makeWeaponInstance(row);
  if(!instance)state.weaponInstances.push(target);
  const old=weaponGoal(state,target.id);if(old)return old;
  const goal=makeGoal('weapon',row,{instanceId:target.id,current:target});state.plans.push(goal);return goal;
}
function editorSelect(label,choices,value,callback){
  const row=document.createElement('label');row.className='goal-field';
  const name=document.createElement('span');name.textContent=label;
  const select=document.createElement('select');
  for(const [v,text] of choices)select.add(new Option(text,String(v)));
  select.value=String(value??'');select.onchange=()=>callback(select.value);
  row.append(name,select);return row;
}
function levelRows(kind,goal,body){
  const defs=kind==='character'?[['charAsc','角色突破',6],['talentA','普通攻击',9],['talentE','元素战技',9],['talentQ','元素爆发',9]]:[['weapAsc','武器突破',6]];
  for(const [key,label,max] of defs){
    const row=document.createElement('div');row.className='goal-level-field';
    const caption=document.createElement('span');caption.textContent=label;
    const pair=goal.config[key];
    const options=Array.from({length:max+1},(_,i)=>[String(i),max===9?`${i+1} 级`:CHAR_LEVEL_LABELS[i]]);
    const makeSelect=(value,side)=>{
      const select=document.createElement('select');
      select.setAttribute('aria-label',label+(side==='current'?'当前等级':'目标等级'));
      for(const [id,text] of options)select.add(new Option(text,id));
      select.value=String(value);
      return select;
    };
    const current=makeSelect(pair[0],'current'),target=makeSelect(pair[1],'target');
    current.onchange=()=>{
      pair[0]=Number(current.value);
      if(pair[1]<pair[0]){pair[1]=pair[0];target.value=String(pair[1]);}
    };
    target.onchange=()=>{
      pair[1]=Number(target.value);
      if(pair[0]>pair[1]){pair[0]=pair[1];current.value=String(pair[0]);}
    };
    const arrow=document.createElement('span');arrow.className='goal-level-arrow';arrow.textContent='→';
    row.append(caption,current,arrow,target);
    body.append(row);
  }
}
function weaponPicker(label,items,value,onChange){
  const field=document.createElement('div');field.className='goal-field weapon-picker-field';
  const caption=document.createElement('span');caption.textContent=label;
  const control=document.createElement('div');control.className='weapon-picker';
  const trigger=document.createElement('button');trigger.type='button';trigger.className='weapon-picker-trigger';
  trigger.setAttribute('aria-label',label);trigger.setAttribute('aria-expanded','false');
  const grid=document.createElement('div');grid.className='weapon-picker-grid';grid.hidden=true;
  let selected=value;
  const draw=()=>{
    trigger.replaceChildren();
    const item=items.find(x=>x.id===selected);
    if(item?.row){
      const image=thumb(item.row.icon,item.row.name,'weapon-picker-icon');image.dataset.rank=String(item.row.rarity);trigger.append(image);
      if(item.ordinal){const number=document.createElement('small');number.textContent='#'+item.ordinal;trigger.append(number);}
    }else{const text=document.createElement('span');text.textContent=item?.label||'请选择武器';trigger.append(text);}
    const arrow=document.createElement('span');arrow.className='picker-arrow';arrow.textContent='⌄';trigger.append(arrow);
    for(const button of grid.children)button.classList.toggle('selected',button.dataset.value===selected);
  };
  for(const item of items){
    const button=document.createElement('button');button.type='button';button.dataset.value=item.id;button.title=item.label;button.setAttribute('aria-label',item.label);
    if(item.row){button.className='weapon-picker-option';const image=thumb(item.row.icon,item.row.name,'weapon-picker-icon');image.dataset.rank=String(item.row.rarity);button.append(image);
      if(item.ordinal){const badge=document.createElement('small');badge.className='picker-instance';badge.textContent='#'+item.ordinal;button.append(badge);}
    }else{button.className='weapon-picker-command';button.textContent=item.label;}
    button.onclick=()=>{selected=item.id;grid.hidden=true;trigger.setAttribute('aria-expanded','false');draw();onChange(selected);};
    grid.append(button);
  }
  trigger.onclick=()=>{grid.hidden=!grid.hidden;trigger.setAttribute('aria-expanded',String(!grid.hidden));};
  control.append(trigger,grid);field.append(caption,control);draw();return field;
}
function updateLinkedWeaponField(goal,body){
  const characterType=charRow(goalObjectId(goal))?.weaponType;
  const available=w=>!characterType||(weaponAliases[w.weaponType]||w.weaponType)===(weaponAliases[characterType]||characterType);
  const items=[{id:'',label:'暂不关联武器'}];
  for(const instance of state.weaponInstances){
    const row=weaponRow(instance.weaponId);if(!row||!available(row))continue;
    const ordinal=state.weaponInstances.filter(w=>w.weaponId===instance.weaponId).findIndex(w=>w.id===instance.id)+1;
    items.push({id:instance.id,row,ordinal,label:row.name+' #'+ordinal+' · Lv.'+instance.level+' R'+instance.refinement});
  }
  items.push({id:'__new__',label:'新建并关联武器实例'});
  const choices=weaponList.filter(available).map(row=>({id:String(row.id),row,label:row.name}));
  let selection=goal.linkedWeaponInstanceId||'',newWeaponId=choices[0]?.id||'';
  if(!items.some(x=>x.id===selection))selection='';
  const newRow=weaponPicker('新建武器',choices,newWeaponId,v=>{newWeaponId=v;});
  newRow.hidden=selection!=='__new__';
  body.append(weaponPicker('关联武器',items,selection,v=>{selection=v;newRow.hidden=v!=='__new__';}),newRow);
  return ()=>({selection,newWeaponId});
}
function openEditor(goal=null,{kind,row,instance=null}={}){
  if(!goal&&!row)return;
  const mode=goal?goalKind(goal):kind;
  if(mode==='weapon'&&goal&&!instance)instance=weaponInstance(state,goal.weaponInstanceId);
  const targetRow=row||(mode==='character'?charRow(goalObjectId(goal)):weaponRow(goalObjectId(goal)));
  if(!targetRow)return toast('尚未加载该培养对象的资料');
  const draft=goal?structuredClone(goal):makeGoal(mode,targetRow,{instanceId:instance?.id||'',current:mode==='character'?state.ownedCharacters[targetRow.id]:instance});
  const body=$('goalModalBody');body.replaceChildren();
  $('goalModalTitle').textContent=`${targetRow.name} · 培养目标`;
  const description=document.createElement('p');description.className='goal-editor-caption';
  description.textContent=mode==='weapon'&&instance?`现有武器 Lv.${instance.level} · 精炼 ${instance.refinement}`:
    mode==='character'&&state.ownedCharacters[targetRow.id]?`已有角色 Lv.${state.ownedCharacters[targetRow.id].level}`:'设置当前等级及目标等级';
  body.append(description);levelRows(mode,draft,body);
  const getLink=mode==='character'?updateLinkedWeaponField(draft,body):null;
  const completed=document.createElement('label');completed.className='goal-check';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=draft.completed===true;
  completed.append(checkbox,document.createTextNode('养成结束'));body.append(completed);
  const paused=document.createElement('label');paused.className='goal-check';
  const pausedInput=document.createElement('input');pausedInput.type='checkbox';pausedInput.checked=draft.enabled===false;
  paused.append(pausedInput,document.createTextNode('暂时暂停计算'));body.append(paused);
  $('goalDelete').hidden=!goal;
  $('goalRemoveCopy').hidden=!(mode==='weapon'&&instance&&state.weaponInstances.filter(w=>w.weaponId===instance.weaponId).length>1);
  $('goalAddCopy').hidden=mode!=='weapon';
  goalEditor={goal,targetRow,mode,draft,instance,checkbox,pausedInput,getLink};
  $('goalModal').hidden=false;
}
async function saveEditor(){
  const editor=goalEditor;if(!editor)return;
  const {draft,mode,targetRow,instance}=editor;
  // Normalize targets before persisting, including changes made to the current-level selectors.
  for(const [key,range] of Object.entries(draft.config))if(Array.isArray(range)&&range[1]<range[0])range[1]=range[0];
  draft.completed=editor.checkbox.checked;draft.enabled=!editor.pausedInput.checked;
  let goal=editor.goal;
  if(!goal){goal=addGoalFromRow(mode,targetRow,instance);}
  if(mode==='character'&&editor.getLink){
    const {selection,newWeaponId}=editor.getLink();
    if(selection==='__new__'){
      const w=weaponRow(newWeaponId);if(w){const wGoal=addGoalFromRow('weapon',w);draft.linkedWeaponInstanceId=wGoal.weaponInstanceId;}
    }else{
      draft.linkedWeaponInstanceId=selection;
      if(selection){
        const linked=weaponInstance(state,selection),row=linked&&weaponRow(linked.weaponId);
        if(row)addGoalFromRow('weapon',row,linked);
      }
    }
  }
  const originalId=goal.id,originalInstanceId=goal.weaponInstanceId;
  Object.assign(goal,draft,{id:originalId,kind:mode,weaponInstanceId:originalInstanceId||draft.weaponInstanceId});
  if(mode==='weapon'&&!goal.weaponInstanceId){
    const w=weaponInstance(state,editor.instance?.id);if(w)goal.weaponInstanceId=w.id;
  }
  state.activePlanId=goal.id;selectedRosterKey=null;selectedGoalId=goal.completed?null:goal.id;inventoryGoalId=goal.id;
  $('goalModal').hidden=true;goalEditor=null;
  renderAll();save();await reloadAllProfiles();
}
async function deleteEditor(){
  const g=goalEditor?.goal;if(!g)return;
  const accepted=await modal({title:'删除培养目标',description:`删除 ${objName(g)} 的培养设置；已有角色和武器仍保留。`,requiresText:false,confirm:'删除'});
  if(accepted===null)return;
  state.plans=state.plans.filter(p=>p.id!==g.id);
  // Keep the physical weapon instance available for future planning and character links.
  if(selectedGoalId===g.id)selectedGoalId=null;if(inventoryGoalId===g.id)inventoryGoalId=null;
  $('goalModal').hidden=true;goalEditor=null;renderAll();save();
}
async function removeEditorWeapon(){
  const editor=goalEditor,instance=editor?.instance;if(!instance)return;
  const linked=state.plans.filter(g=>goalKind(g)==='character'&&g.linkedWeaponInstanceId===instance.id).length;
  const ordinal=state.weaponInstances.filter(w=>w.weaponId===instance.weaponId).findIndex(w=>w.id===instance.id)+1;
  const accepted=await modal({title:'移除武器实例',description:'确定移除 '+editor.targetRow.name+' #'+ordinal+'？该实例的培养目标将一同移除。'+(linked?'\n另有 '+linked+' 个角色目标将解除关联。':''),requiresText:false,confirm:'移除'});
  if(accepted===null)return;
  try{const result=removeWeaponInstance(state,instance.id);const removed=new Set(result.removedGoalIds);
    if(removed.has(selectedGoalId))selectedGoalId=null;if(removed.has(inventoryGoalId))inventoryGoalId=null;
    if(selectedRosterKey==='weapon:'+instance.id)selectedRosterKey=null;
    closeEditor();renderAll();save();void reloadAllProfiles();
  }catch(error){toast(error.message);}
}
function closeEditor(){$('goalModal').hidden=true;goalEditor=null;}
function updateMaterialCount(id,value){
  if(!setManualMaterial(state,id,value))return;
  renderResults();renderCalendar();save();
}
function materialRow(item,shared){
  const row=document.createElement('div');row.className='material-row';
  const image=document.createElement('span');image.className='material-img';image.dataset.rank=String(item.rank);
  const icon=document.createElement('img');icon.loading='lazy';icon.alt='';icon.src=itemIconUrl(item.id);icon.onerror=()=>icon.remove();image.append(icon);
  const copy=document.createElement('div');copy.className='material-item-copy';
  const name=document.createElement('div');name.className='material-name';name.textContent=item.name;copy.append(name);
  if(shared){const span=document.createElement('div');span.className='material-share';span.textContent='共用 · '+shared;copy.append(span);}
  const controls=document.createElement('span');controls.className='material-number';
  const arrows=document.createElement('div');arrows.className='material-arrows';
  const synced=state.inventoryMode==='synced',inventory=activeMaterialInventory(state);
  const input=document.createElement('input');input.type='text';input.inputMode='numeric';input.value=inventory[item.id]??'';input.placeholder=synced?'—':'0';
  input.setAttribute('aria-label',item.name+'背包数量');
  input.readOnly=synced;
  if(synced&&state.syncedInventoryMinimum?.[item.id]){input.title='米游社探测下限：实际库存可能更多';input.classList.add('inventory-minimum');}
  if(!synced){
    const step=delta=>{input.value=String(Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,safeEval(input.value)+delta)));updateMaterialCount(item.id,input.value);};
    for(const [delta,text] of [[1,'▲'],[-1,'▼']]){const button=document.createElement('button');button.type='button';button.textContent=text;
      button.title=delta>0?'增加 1':'减少 1';button.onclick=()=>step(delta);arrows.append(button);}
    input.oninput=()=>updateMaterialCount(item.id,input.value);
    controls.append(arrows);
  }
  controls.append(input);row.append(image,copy,controls);return row;
}
const categories=[['basicInventory','基础与专属材料'],['cultInventory','培养素材'],
  ['talentInventory','天赋与角色突破'],['weaponInventory','武器突破材料']];
function renderInventory(){
  const synced=state.inventoryMode==='synced';
  for(const button of document.querySelectorAll('[data-inventory-mode]')){
    const selected=button.dataset.inventoryMode===state.inventoryMode;
    button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
  }
  $('inventoryModeNote').textContent=synced
    ?(Object.keys(state.syncedMaterialInventory).length?'米游社库存 · 虚线表示下限，未知库存按 0 估算缺口。':'尚未同步材料，请通过米游社同步。')
    :'手动库存 · 输入框左侧可增加或减少 1。';
  const holder=$('inventoryGroups');holder.replaceChildren();
  const id=selectedGoalId||inventoryGoalId;const goal=goalById(id);
  const rosterName=selectedRosterKey?(selectedRosterKey.startsWith('weapon:')
    ?weaponRow(weaponInstance(state,selectedRosterKey.slice(7))?.weaponId||selectedRosterKey.slice(7))?.name
    :charRow(selectedRosterKey.slice(10))?.name):'';
  $('inventoryTarget').textContent=goal?objName(goal):rosterName||'选择培养目标';
  if(!goal){holder.innerHTML=selectedRosterKey
    ?'<div class="empty-hint">点击设置按钮配置培养目标。</div>'
    :'<div class="empty-hint">点击顶部培养卡片，可查看当前目标需要填写的背包材料。</div>';return;}
  const selected=entries().find(e=>e.plan.id===id);
  const catalog=collectInventoryCatalog(selected?[selected]:[]);
  const all=entries().filter(e=>e.plan.enabled!==false&&!e.plan.completed);
  const usage=planMaterialUsage(all);
  for(const [key,title] of categories){
    if(!catalog[key]?.length)continue;
    const section=document.createElement('section');section.className='material-group';
    const header=document.createElement('header');header.textContent=title;section.append(header);
    const body=document.createElement('div');body.className='material-rows';
    for(const group of catalog[key])for(const item of group.rows){
      const shared=(usage.get(item.id)||0)>1?(usage.get(item.id)+' 个培养目标'):'';
      body.append(materialRow(item,shared));
    }
    section.append(body);holder.append(section);
  }
  if(!holder.childElementCount)holder.innerHTML='<div class="empty-hint">材料正在载入，请稍后检查。</div>';
}
function renderResults(){
  const all=entries().filter(e=>e.plan.enabled!==false&&!e.plan.completed);
  const allResult=calculateMultiPlan(all,activeMaterialInventory(state));
  const focus=selectedGoal();
  const focusEntry=all.find(e=>e.plan.id===focus?.id);
  const partial=focusEntry?calculateMultiPlan([focusEntry],activeMaterialInventory(state)):null;
  const target=partial||allResult;
  $('resultTitle').textContent=partial?objName(focus)+' · 材料缺口':'全部培养目标 · 材料缺口';
  $('resultSummary').textContent=partial?'单项目标与全部需求对照':'共用背包统一扣除';
  const holder=$('resultContent');holder.replaceChildren();
  const allById=new Map(allResult.groups.flatMap(g=>g.rows).map(r=>[String(r.id),r]));
  const sourceMap=materialContributions(all);
  const catalog=collectInventoryCatalog(all);
  const categoryById=new Map();for(const [key] of categories)for(const group of catalog[key])for(const row of group.rows){
    if(!categoryById.has(row.id))categoryById.set(row.id,key);
  }
  let seen=0;
  for(const [key,title] of categories){
    const rows=target.groups.flatMap(g=>g.rows).filter(r=>(partial?r.count>0:r.lack>0)&&categoryById.get(String(r.id))===key);
    if(!rows.length)continue;
    const section=document.createElement('section');section.className='deficit-group';
    const heading=document.createElement('h3');heading.textContent=title;section.append(heading);
    for(const material of rows){seen++;
      const detail=document.createElement('details');detail.className='deficit-item';
      const summary=document.createElement('summary');summary.className='deficit-row';
      const icon=document.createElement('span');icon.className='material-img deficit-img';icon.dataset.rank=String(material.rank);
      const img=document.createElement('img');img.alt='';img.loading='lazy';img.src=itemIconUrl(material.id);img.onerror=()=>img.remove();icon.append(img);
      const title=document.createElement('span');title.className='deficit-name';title.textContent=material.name;
      const value=document.createElement('span');value.className='deficit-value';
      const primary=document.createElement('strong');primary.textContent=material.lack>0?'缺 × '+displayNum(material.lack):'已满足';value.append(primary);
      if(partial){const common=document.createElement('small');
        const global=allById.get(String(material.id));common.textContent='全部缺 '+displayNum(global?.lack||0);value.append(common);}
      summary.append(icon,title,value);detail.append(summary);
      const contributions=sourceMap.get(String(material.id))||[];
      if(contributions.length){const body=document.createElement('div');body.className='deficit-breakdown';
        const subtitle=document.createElement('div');subtitle.className='deficit-source-heading';subtitle.textContent='培养目标需求明细';body.append(subtitle);
        for(const src of contributions){const line=document.createElement('div');line.className='deficit-source-row';
          const title=document.createElement('span');title.textContent=src.name;
          const number=document.createElement('b');number.textContent='需 × '+displayNum(src.count);
          line.append(title,number);body.append(line);}
        const caption=document.createElement('p');caption.textContent='各项目显示原始需求；共用库存及材料合成在总缺口中统一计算。';body.append(caption);
        detail.append(body);}
      section.append(detail);
    }
    holder.append(section);
  }
  for(const issue of [...target.unavailable,...target.incomplete.map(x=>x.plan+' · '+x.title)]){
    const block=document.createElement('div');block.className='deficit-warning';block.textContent=issue+' · 材料资料待补充';holder.append(block);seen++;}
  if(!seen){const msg=document.createElement('div');msg.className='empty-hint';msg.textContent=partial?'该目标已经满足或尚未设置等级。':allResult.hasAnyTarget?'全部目标已满足':'点击设置按钮添加培养目标。';holder.append(msg);}
}
function renderCalendar(){
  const all=entries().filter(e=>e.plan.enabled!==false&&!e.plan.completed);
  const result=calculateMultiPlan(all,activeMaterialInventory(state));
  const plan=calendarForEntries(all,result);
  const box=$('calendarDays');box.replaceChildren();
  ['周一','周二','周三','周四','周五','周六','周日'].forEach((day,i)=>{
    const cell=document.createElement('div');cell.className='calendar-day';
    const label=document.createElement('strong');label.textContent=day;
    const tray=document.createElement('div');tray.className='calendar-materials';
    for(const material of plan.days[i]){
      const icon=document.createElement('span');icon.className='calendar-material';icon.dataset.rank=String(material.rank);
      icon.title=material.name+(material.highlight?' · 缺 '+displayNum(material.lack):' · 已满足');
      icon.setAttribute('role','img');icon.setAttribute('aria-label',icon.title);
      const img=document.createElement('img');img.alt='';img.loading='lazy';
      img.src=itemIconUrl(material.id);img.onerror=()=>img.remove();
      icon.append(img);tray.append(icon);
    }
    if(!tray.childElementCount){const empty=document.createElement('span');empty.className='calendar-empty';empty.textContent='—';tray.append(empty);}
    cell.append(label,tray);box.append(cell);
  });
  const note=$('calendarNote');
  note.textContent=plan.unknown.length?`${plan.unknown.length} 种材料的开放日待核对`:'按当前培养目标显示秘境材料';
  note.title=plan.unknown.map(item=>item.name||item.id).join('、');
}
function renderAll(){renderAccounts();renderGoals();renderFilters();renderRoster();renderInventory();renderResults();renderCalendar();}
async function loadReleaseMetadata(force){
  const [bundled,banners,characters,weapons]=await Promise.allSettled([
    fetch('./release-index.json').then(r=>{if(!r.ok)throw Error('release index');return r.json();}),
    bridge('release.fetch',{source:'banners',force}).then(r=>indexBannerReleases(JSON.parse(r.content))),
    bridge('release.fetch',{source:'characters',force}).then(r=>parseReleaseTable(r.content)),
    bridge('release.fetch',{source:'weapons',force}).then(r=>parseReleaseTable(r.content))
  ]);
  const value=r=>r.status==='fulfilled'?r.value:undefined;
  return {bannerIndex:mergeBannerReleases(value(bundled),value(banners)),characterDates:value(characters),weaponDates:value(weapons)};
}
async function loadLists(force=false){
  setStatus('正在读取 Nanoka 角色和武器资料…');
  try{
    const manifest=await bridge('data.fetch',{path:'/manifest.json',force,maxAge:21600000});
    const versions=readManifestVersions(manifest.data);
    const reqs=await Promise.all([
      ['character',versions.live],['character',versions.latest],['weapon',versions.live],['weapon',versions.latest]
    ].map(async([type,version])=>({version,data:(await bridge('data.fetch',{path:`/gi/${encodeURIComponent(version)}/${type}.json`,force,maxAge:43200000})).data})));
    characterList=mergeSourceLists(normalizeCharacterList(reqs[0].data).map(x=>({...x,version:versions.live})),normalizeCharacterList(reqs[1].data).map(x=>({...x,version:versions.latest})));
    weaponList=mergeSourceLists(normalizeWeaponList(reqs[2].data).map(x=>({...x,version:versions.live})),normalizeWeaponList(reqs[3].data).map(x=>({...x,version:versions.latest})));
    const release=await loadReleaseMetadata(force);
    characterList=attachReleaseDates(characterList,'character',release.characterDates,release.bannerIndex);
    weaponList=attachReleaseDates(weaponList,'weapon',release.weaponDates,release.bannerIndex);
    await reloadAllProfiles(force);
    setStatus(`已载入 ${characterList.length} 名角色、${weaponList.length} 类武器`,'success');
  }catch(e){setStatus('资料读取失败：'+e.message,'error');toast('检查网络后刷新资料');}
  renderAll();
}
async function loadGoalProfile(plan,force){
  const kind=goalKind(plan),src=plan.source;
  const char=kind==='character'?charRow(src.selectedCharacterId):null;
  const wp=kind==='weapon'?weaponRow(src.selectedWeaponId):null;
  const data=await Promise.allSettled([
    char?bridge('data.fetch',{path:`/gi/${encodeURIComponent(char.version)}/zh/character/${char.id}.json`,force,maxAge:86400000}).then(r=>parseCharacterDetail(r.data,char)):Promise.resolve(null),
    wp?bridge('data.fetch',{path:`/gi/${encodeURIComponent(wp.version)}/zh/weapon/${wp.id}.json`,force,maxAge:86400000}).then(r=>parseWeaponDetail(r.data,wp)):Promise.resolve(null)
  ]);
  return {characterProfile:data[0].status==='fulfilled'?data[0].value:null,
    weaponProfile:data[1].status==='fulfilled'?data[1].value:null};
}
async function reloadAllProfiles(force=false){
  const token=++profileLoadToken,account=state.activeAccountId;
  const plans=[...state.plans];const results=await Promise.all(plans.map(plan=>loadGoalProfile(plan,force)));
  if(token!==profileLoadToken||account!==state.activeAccountId)return;
  profiles=new Map(plans.map((p,i)=>[p.id,results[i]]));
  if(!state.materialInventoryMigrated&&plans.length){
    const first=plans[0],entry=profiles.get(first.id);
    const linked=first.linkedWeaponInstanceId?plans.find(g=>g.weaponInstanceId===first.linkedWeaponInstanceId):null;
    const weapon=linked?profiles.get(linked.id)?.weaponProfile:entry.weaponProfile;
    const legacy=migrateLegacyInventory(state.inv,entry.characterProfile,weapon,first.source.mergeRules);
    state.materialInventory={...legacy,...state.materialInventory};state.materialInventoryMigrated=true;
  }
  renderAll();save();
}
function modal({title,description='',confirm='确认',requiresText=true,value=''}){
  $('modalTitle').textContent=title;$('modalDescription').textContent=description;
  $('modalInput').hidden=!requiresText;$('modalInput').value=value;$('modalConfirm').textContent=confirm;
  $('modal').hidden=false;if(requiresText)$('modalInput').focus();else $('modalConfirm').focus();
  return new Promise(resolve=>currentModalResolve=resolve);
}
function closeModal(confirmed){if(!currentModalResolve)return;const done=currentModalResolve;currentModalResolve=null;
  const value=$('modalInput').value.trim();$('modal').hidden=true;done(confirmed?value:null);}
async function addAccount(){const name=await modal({title:'添加规划账号',description:'新账号将使用独立的培养记录、扫描数据及材料库存。'});
  if(name===null)return;try{
    const defaults=normalizeState(cloneDefaultState());initializePlanner(defaults);
    createPlannerAccount(state,'account-'+newId('local'),name,defaults);resetAccountView();save();toast('已创建账号');
  }catch(e){toast(e.message);}}
async function renameAccount(){const record=state.plannerAccounts.find(x=>x.id===state.activeAccountId);
  const name=await modal({title:'重命名账号',value:record?.name||''});if(name===null)return;
  try{renamePlannerAccount(state,state.activeAccountId,name);renderAccounts();save();}catch(e){toast(e.message);}}
async function removeAccount(){if(state.plannerAccounts.length<=1)return;
  const ok=await modal({title:'删除规划账号',description:'该账号所有培养项、扫描数据及材料记录将被删除。',requiresText:false,confirm:'删除'});
  if(ok===null)return;deletePlannerAccount(state,state.activeAccountId);resetAccountView();save();void reloadAllProfiles();}
function resetAccountView(){initializePlanner(state);selectedGoalId=null;inventoryGoalId=null;selectedRosterKey=null;profiles.clear();profileLoadToken++;
  filter=createRosterFilter();renderAll();}
function switchAccount(id){if(id===state.activeAccountId)return;selectPlannerAccount(state,id);resetAccountView();save();void reloadAllProfiles();}
async function exportAll(){try{const ok=await bridge('storage.export',{state:{type:'material-planner-desktop-config',version:2,exportedAt:new Date().toISOString(),data:snapshot()}});
  if(ok)toast('配置已导出');}catch(e){toast('导出失败：'+e.message);}}
async function importAll(){try{
  const result=await bridge('storage.import');if(result===null)return;
  const next=normalizeState(result?.data||result);initializePlanner(next);
  const ok=await modal({title:'导入规划配置',description:'将替换当前全部账号、培养目标与背包数据。',requiresText:false,confirm:'导入'});
  if(ok===null)return;state=next;resetAccountView();await flushSave();await reloadAllProfiles();toast('规划已导入');
}catch(e){toast('导入失败：'+e.message);}}
async function importScanner(){
  try{
    if(!characterList.length||!weaponList.length)return toast('请先载入 Nanoka 角色与武器资料');
    const raw=await bridge('storage.import');if(raw===null)return;
    const good=validateGOOD(raw);
    if(good.metadata?.uid&&state.inventoryUid&&String(good.metadata.uid)!==String(state.inventoryUid)){
      toast('GOOD 文件 UID 与当前规划账号不同，请先切换账号。');return;
    }
    const draft=structuredClone(state);
    const result=importGOOD(draft,good,{characters:characterList,weapons:weaponList});
    const question=[`角色 ${result.characters} 名；新武器 ${result.newWeapons} 把；更新武器 ${result.updatedWeapons} 把。`,
      result.unmatched.length?`未匹配 ${result.unmatched.length} 项，导入后可查看提示。`:'',
      result.ambiguous.length?`有 ${result.ambiguous.length} 把重复武器需要核对，此次保留现有记录。`:''
    ].filter(Boolean).join('\n');
    const ok=await modal({title:'导入 GGScanner',description:question,requiresText:false,confirm:'确认导入'});
    if(ok===null)return;
    state.ownedCharacters=draft.ownedCharacters;state.weaponInstances=draft.weaponInstances;
    for(let i=0;i<state.plans.length;i++){
      state.plans[i].config=draft.plans[i].config;
      state.plans[i].linkedWeaponInstanceId=draft.plans[i].linkedWeaponInstanceId;
    }
    if(good.metadata?.uid&&!state.inventoryUid)state.inventoryUid=String(good.metadata.uid);
    renderAll();save();toast(result.warnings[0]||'GOOD 角色与武器数据已导入');
  }catch(e){toast('GOOD 导入失败：'+e.message);}
}
async function start(){
  $('modalCancel').onclick=()=>closeModal(false);$('modalConfirm').onclick=()=>closeModal(true);
  $('modalInput').onkeydown=e=>{if(e.key==='Enter')closeModal(true);};
  $('goalCancel').onclick=closeEditor;$('goalSave').onclick=()=>void saveEditor();$('goalDelete').onclick=()=>void deleteEditor();$('goalRemoveCopy').onclick=()=>void removeEditorWeapon();
  $('goalAddCopy').onclick=()=>{
    const editor=goalEditor;if(!editor||editor.mode!=='weapon')return;
    const copy=makeWeaponInstance(editor.targetRow);
    const created=makeGoal('weapon',editor.targetRow,{instanceId:copy.id,current:copy});
    state.weaponInstances.push(copy);state.plans.push(created);closeEditor();openEditor(created);renderAll();save();void reloadAllProfiles();
  };
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('modal').hidden)closeModal(false);else if(!$('goalModal').hidden)closeEditor();}});
  $('accountSelect').onchange=e=>switchAccount(e.target.value);
  for(const button of document.querySelectorAll('[data-inventory-mode]'))button.onclick=()=>{
    selectInventoryMode(state,button.dataset.inventoryMode);renderInventory();renderResults();renderCalendar();save();
  };
  $('addAccountButton').onclick=()=>void addAccount();$('renameAccountButton').onclick=()=>void renameAccount();
  $('deleteAccountButton').onclick=()=>void removeAccount();
  $('refreshButton').onclick=()=>void loadLists(true);$('exportButton').onclick=()=>void exportAll();
  $('importButton').onclick=()=>void importAll();$('importGoodButton').onclick=()=>void importScanner();
  $('searchInput').oninput=e=>{filter.search=e.target.value;renderRoster();};
  for(const tab of document.querySelectorAll('[data-tab]'))tab.onclick=()=>{
    filter=createRosterFilter(tab.dataset.tab);renderFilters();renderRoster();};
  await initializeColumns();
  try{const record=await bridge('storage.load');if(record)state=normalizeState(record);}catch(e){toast('读取本地数据失败：'+e.message);}
  initializePlanner(state);renderAll();
  installMiyoushePanel(bridge,{getPlanningId:()=>state.activeAccountId,getInventoryUid:()=>state.inventoryUid,
    loadInventoryProfile:async(kind,entry)=>{
      const row=kind==='character'?charRow(entry.id):weaponRow(entry.id);
      if(!row)throw Error('Nanoka 目录未匹配');
      const response=await bridge('data.fetch',{path:`/gi/${encodeURIComponent(row.version)}/zh/${kind}/${row.id}.json`,force:false,maxAge:86400000});
      return kind==='character'?parseCharacterDetail(response.data,row):parseWeaponDetail(response.data,row);
    },
    loadDiagnosticWeapon:async weapon=>{
      const row=weaponRow(weapon.id);
      if(!row)throw Error('Nanoka 武器目录未匹配');
      const response=await bridge('data.fetch',{path:`/gi/${encodeURIComponent(row.version)}/zh/weapon/${row.id}.json`,force:false,maxAge:86400000});
      return parseWeaponDetail(response.data,row);
    },
    apply:result=>{applySyncedInventory(state,result);renderInventory();renderResults();renderCalendar();save();}});
  await loadLists();
}
void start();
