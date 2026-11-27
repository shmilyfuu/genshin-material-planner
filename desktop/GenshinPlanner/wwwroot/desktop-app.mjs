import {createWaitTasks} from './wait-tasks.mjs';
import {CHAR_LEVEL_LABELS, weaponMaxAscension, cloneDefaultState, normalizeState, safeEval} from './core.mjs';
import {
  normalizeCharacterList, normalizeWeaponList, mergeSourceLists,
  parseCharacterDetail, parseWeaponDetail, readManifestVersions,
  detectMergeRules, itemIconUrl
} from './hakushin.mjs';
import {calculateMultiPlan, collectInventoryCatalog, planMaterialUsage, migrateLegacyInventory, materialContributions, singleGoalRows} from './multi-planner.mjs';
import {initializePlanner,makeGoal,makeWeaponInstance,characterGoal,weaponGoal,weaponInstance,goalKind,goalObjectId,activeGoals,visibleRoster,setLink,removeWeaponInstance,weaponOrdinal,newId} from './planner-model.mjs';
import {importGOOD,validateGOOD} from './good-import.mjs';
import {calendarForEntries} from './calendar-days.mjs';
import {createRosterFilter,toggleRosterFilter,matchesRosterFilter} from './roster-filters.mjs';
import {installMiyoushePanel} from './mys-panel.mjs';
import {bindMysAccount,unbindMysAccount,plannerBindingOwner,normalizeMysBinding} from './mys-binding.mjs';
import {activeMaterialInventory,selectInventoryMode,setManualMaterial,previewManualAddition,applySyncedInventory,compareInventoryMaterial,summarizeInventoryApplication,applyInventoryToManual} from './inventory-mode.mjs';
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
  const d=ev.data;if(d?.event==='update.progress'){renderUpdateProgress(d.progress);return;}if(d?.event==='app.closing'){void prepareClose();return;}if(!d||!pending.has(d.id))return;
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
    if(params.mode==='local')throw Error('本地缓存不可用');
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
let mysPanel=null;
let updateCandidate=null,updateChecking=false,updateInstalling=false;
let characterList=[],weaponList=[];
let profiles=new Map();
let listVersion={live:'',latest:''};
let catalogGeneration=0,lastUserInput=0,backgroundChecking=false;
let profileLoadToken=0;
let filter=createRosterFilter();
let selectedGoalId=null,inventoryGoalId=null,selectedRosterKey=null,goalEditor=null;
let saveTimer=null,writeChain=Promise.resolve(),toastTimeout=null,storageReady=false,closing=false;
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
  const operation=layoutSaveChain.catch(()=>{}).then(()=>bridge('ui.layout.save',{layout}));layoutSaveChain=operation;void operation.catch(e=>setStatus('保存列宽失败：'+e.message,'error'));return operation;
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


const statusTasks=new Map();
let waitState={locked:false,visible:false,text:''},waitFocus=null;
const waitTasks=createWaitTasks(next=>{
  if(next.locked&&!waitState.locked)waitFocus=document.activeElement;
  const wasLocked=waitState.locked;
  waitState=next;renderWaitState();renderStatus();
  if(wasLocked&&!next.locked&&!closing&&storageReady){
    const top=[...document.querySelectorAll('.modal-backdrop:not([hidden])')].at(-1);
    if(waitFocus?.isConnected&&waitFocus.getClientRects().length&&(!top||top.contains(waitFocus)))waitFocus.focus({preventScroll:true});
    waitFocus=null;
  }
});
function renderWaitState(){
  const locked=waitState.locked||closing;
  if(locked)closeMaterialAdd();
  document.querySelector('.app').inert=locked||!storageReady;
  for(const panel of document.querySelectorAll('.modal-backdrop'))panel.inert=locked;
  $('waitOverlay').hidden=!waitState.locked;
  $('waitToast').hidden=!waitState.visible;
  $('waitMessage').textContent=waitState.text;
}
function withWait(key,text,priority,fn){return waitTasks.run(key,text,priority,fn);}
for(const type of ['keydown','keyup','keypress','wheel','contextmenu']){
  document.addEventListener(type,event=>{if(waitState.locked||closing){event.preventDefault();event.stopImmediatePropagation();}},{capture:true,passive:false});
}
let lastStatus={text:'正在读取本地数据…',tone:'busy'};
function renderStatus(){
  const active=waitState.locked?{text:waitState.text,tone:'busy'}:[...statusTasks.values()].sort((a,b)=>b.priority-a.priority)[0]||(backgroundChecking?{text:'正在后台检查游戏资料…',tone:'busy'}:lastStatus);
  const node=$('dataStatus');node.textContent=active.text;node.title=active.text;node.dataset.tone=active.tone;
  $('statusIndicator').dataset.tone=active.tone;
}
function setStatus(text,tone=''){lastStatus={text,tone};renderStatus();}
function taskStatus(key,text,tone='busy'){
  const priorities={update:30,sync:20,lists:10};
  if(tone==='busy'){statusTasks.set(key,{text,tone,priority:priorities[key]||0});waitTasks.update(key,text);}
  else{statusTasks.delete(key);lastStatus={text,tone};}
  renderStatus();
}
function toast(message){clearTimeout(toastTimeout);const t=$('statusNotice');t.textContent=message;t.title=message;toastTimeout=setTimeout(()=>{t.textContent='';t.title='';},6500);}
function snapshot(){
  const active=state.plans.find(g=>g.id===state.activePlanId)||state.plans[0];
  if(active){state.source=structuredClone(active.source);state.config=structuredClone(active.config);}
  saveActivePlannerAccount(state);return structuredClone(state);
}
function flushSave(){clearTimeout(saveTimer);if(!storageReady)return Promise.reject(Error('本地规划尚未成功读取。'));const data=snapshot();const operation=writeChain.catch(()=>{}).then(()=>bridge('storage.save',{state:data}));writeChain=operation;return operation;}
function scheduleSave(){if(!storageReady||closing)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>void flushSave().catch(e=>setStatus('保存失败：'+e.message,'error')),300);}
async function prepareClose(){if(closing)return;closing=true;renderWaitState();try{if(storageReady)await flushSave();await saveColumns();await bridge('app.closeReady',{ok:true});}catch(e){try{const accepted=await bridge('app.closeReady',{ok:false,error:e.message});if(accepted)return;}catch(error){setStatus('退出失败：'+error.message,'error');}closing=false;renderWaitState();}}

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
  const ordinal=weaponOrdinal(state,goal.weaponInstanceId);
  return ordinal>0?`${name} #${ordinal}`:name;
};
const charRow=id=>characterList.find(x=>x.id===String(id));
const weaponRow=id=>weaponList.find(x=>x.id===String(id));
function save(){saveActivePlannerAccount(state);scheduleSave();}
function renderAccounts(){const select=$('accountSelect');select.replaceChildren();
  for(const a of state.plannerAccounts)select.add(new Option(a.name,a.id));
  select.value=state.activeAccountId;$('deleteAccountButton').disabled=state.plannerAccounts.length<=1;
  const binding=state.mysBinding,nickname=$('boundNickname'),uid=$('boundUid');
  nickname.textContent=binding?.nickname||'';nickname.hidden=!binding?.nickname;
  uid.textContent=binding?'UID '+binding.uid:'未绑定米游社';
  $('accountBinding').title=binding?[binding.nickname,'UID '+binding.uid,binding.regionName].filter(Boolean).join(' · '):'未绑定米游社';
  mysPanel?.update();
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
  button.title='配置培养目标';button.setAttribute('aria-label',button.title);
  const icon=document.createElement('img');icon.src='icons/training-guide.png';icon.alt='';icon.onerror=()=>{button.innerHTML=svg('settings');};button.append(icon);button.onclick=ev=>{ev.stopPropagation();onEdit();};return button;
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
  $('activeGoalsHeading').title=`${pending.filter(g=>g.enabled!==false).length} 项培养中 · 单击选择 · 提升按钮编辑 · 暂停后不计入缺口`;
  if(!pending.length){root.innerHTML='<span class="empty-strip">点击角色或武器卡片的提升按钮，添加培养目标。</span>';return;}
  for(const goal of pending){
    const kind=goalKind(goal),row=kind==='character'?charRow(goalObjectId(goal)):weaponRow(goalObjectId(goal));
    const card=document.createElement('div');card.className='goal-card'+(selectedGoalId===goal.id?' selected':'')+(goal.enabled===false?' paused':'');
    card.tabIndex=0;card.dataset.goalId=goal.id;card.setAttribute('role','button');card.setAttribute('aria-label',objName(goal)+'，单击选择');
    const artwork=thumb(row?.icon,objName(goal),'goal-art');
    if(row?.rarity)artwork.dataset.rank=String(row.rarity);
    const obj=weaponInstance(state,goal.weaponInstanceId);
    const detail=kind==='weapon'&&obj?`Lv.${obj.level} · R${obj.refinement}${obj.location?' · '+obj.location:''}`:'';
    card.title=[objName(goal),detail,goal.enabled===false?'已暂停':''].filter(Boolean).join(' · ');
    card.append(artwork);
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
    const chip=makeChip(n+'★',null,filter.star.includes(n),()=>redraw('star',n));
    chip.classList.add('star-chip');stars.append(chip);
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
    const symbol=document.createElement('img');symbol.src='icons/training-active.png';symbol.alt='';
    training.append(symbol);artwork.append(training);
  }else if(goal?.completed){
    const done=document.createElement('span');done.className='avatar-status done';done.textContent='✓';
    done.title='养成结束';artwork.append(done);
  }
  if(row.instance){
    const ordinal=weaponOrdinal(state,row.instance.id);
    const marker=document.createElement('span');marker.className='avatar-instance';
    marker.textContent=String(ordinal);marker.dataset.digits=String(Math.min(3,marker.textContent.length));marker.title='同名武器 '+ordinal;artwork.append(marker);
  }
  const title=document.createElement('span');title.className='avatar-name';
  const label=document.createElement('span');label.className='avatar-name-label';
  const name=document.createElement('span');name.className='avatar-name-text';name.textContent=row.name;
  label.append(name);
  title.title=row.name;
  if(row.sourceTag){
    title.classList.add('is-preview');
    const star=document.createElement('span');star.className='avatar-name-star';
    star.textContent='*';star.title=row.sourceTag;star.setAttribute('aria-label',row.sourceTag);
    label.append(star);
    title.title=row.name+'* · '+row.sourceTag;
    card.setAttribute('aria-label',row.name+'，'+row.sourceTag+'，单击选择');
  }
  title.append(label);
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
  const defs=kind==='character'?[['charAsc','角色突破',6],['talentA','普通攻击',9],['talentE','元素战技',9],['talentQ','元素爆发',9]]:[['weapAsc','武器突破',weaponMaxAscension(weaponRow(goalObjectId(goal))?.rarity)]];
  for(const [key,label,max] of defs){
    const row=document.createElement('div');row.className='goal-level-field';
    const caption=document.createElement('span');caption.textContent=label;
    const pair=goal.config[key];pair[0]=Math.min(max,pair[0]);pair[1]=Math.min(max,pair[1]);
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
    const ordinal=weaponOrdinal(state,instance.id);
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
  const ordinal=weaponOrdinal(state,instance.id);
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
let materialAddContext=null;
function closeMaterialAdd(restoreFocus=false){
  if(!materialAddContext)return;
  const {button}=materialAddContext;materialAddContext=null;
  button.setAttribute('aria-expanded','false');
  $('materialAddPopover').hidden=true;$('materialAddInput').value='';$('materialAddConfirm').disabled=true;
  if(restoreFocus&&button.isConnected&&!waitState.locked&&!closing)button.focus({preventScroll:true});
}
function currentMaterialAdd(){
  const context=materialAddContext;
  return context&&context.button.isConnected&&context.input.isConnected&&state.activeAccountId===context.accountId
    &&state.inventoryMode==='manual'&&!waitState.locked&&!closing?context:null;
}
function positionMaterialAdd(){
  const context=currentMaterialAdd();
  if(!context){closeMaterialAdd();return;}
  const panel=$('materialAddPopover'),anchor=context.button.getBoundingClientRect();
  const control=context.button.parentElement.getBoundingClientRect();
  const scroll=$('inventoryGroups').getBoundingClientRect();
  if(anchor.bottom<=scroll.top||anchor.top>=scroll.bottom||anchor.right<=scroll.left||anchor.left>=scroll.right){closeMaterialAdd();return;}
  const margin=8,gap=5,width=panel.offsetWidth,height=panel.offsetHeight;
  const left=Math.max(margin,Math.min(window.innerWidth-width-margin,control.right-width));
  const below=anchor.bottom+gap,above=anchor.top-height-gap;
  const top=below+height<=window.innerHeight-margin?below:above>=margin?above:Math.max(margin,window.innerHeight-height-margin);
  panel.style.left=left+'px';panel.style.top=top+'px';
}
function refreshMaterialAdd(){
  const context=currentMaterialAdd();
  if(!context){closeMaterialAdd();return null;}
  const {current,total}=previewManualAddition(state.materialInventory[context.id],$('materialAddInput').value);
  $('materialAddCurrent').textContent='当前 '+displayNum(current);
  $('materialAddResult').textContent=total===null?'—':displayNum(total);
  $('materialAddConfirm').disabled=total===null;
  positionMaterialAdd();
  return total;
}
function openMaterialAdd(item,button,input){
  if(materialAddContext?.button===button){closeMaterialAdd(true);return;}
  closeMaterialAdd();
  if(state.inventoryMode!=='manual'||waitState.locked||closing)return;
  materialAddContext={id:String(item.id),accountId:state.activeAccountId,button,input};
  button.setAttribute('aria-expanded','true');
  $('materialAddTitle').textContent=item.name;
  $('materialAddInput').value='';
  $('materialAddPopover').hidden=false;refreshMaterialAdd();
  if(materialAddContext)$('materialAddInput').focus({preventScroll:true});
}
function installMaterialAdd(){
  const panel=$('materialAddPopover'),entry=$('materialAddInput');
  entry.addEventListener('input',refreshMaterialAdd);
  panel.addEventListener('submit',event=>{
    event.preventDefault();
    const context=currentMaterialAdd();if(!context){closeMaterialAdd();return;}
    const total=refreshMaterialAdd();if(total===null||!currentMaterialAdd())return;
    closeMaterialAdd(true);
    context.input.value=String(total);updateMaterialCount(context.id,context.input.value);
  });
  document.addEventListener('pointerdown',event=>{
    if(materialAddContext&&!panel.contains(event.target)&&!materialAddContext.button.contains(event.target))closeMaterialAdd();
  },true);
  document.addEventListener('focusin',event=>{
    if(materialAddContext&&!panel.contains(event.target)&&!materialAddContext.button.contains(event.target))closeMaterialAdd();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&materialAddContext){event.preventDefault();event.stopImmediatePropagation();closeMaterialAdd(true);}
  },true);
  document.addEventListener('scroll',()=>{if(materialAddContext)positionMaterialAdd();},true);
  window.addEventListener('resize',()=>{if(materialAddContext)positionMaterialAdd();});
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
  if(synced){
    const comparison=compareInventoryMaterial(state,item.id);
    const {manual,status,delta,synced:quantity}=comparison;
    if(status!=='exact'||manual===null||delta!==0){
      const detail=document.createElement('div');detail.className='inventory-difference';
      const manualText=manual===null?'未记录':displayNum(manual);
      const reason=status==='minimum'?(manual!==null&&manual<quantity?' · 至少差 '+displayNum(quantity-manual):' · 下限待核对')
        :status==='unknown'?' · 未取得':delta===null?' · 新记录':' · 差值 '+(delta>0?'+':'')+displayNum(delta);
      detail.textContent='手动：'+manualText+reason;detail.title=detail.textContent;copy.append(detail);
    }
  }
  if(synced&&state.syncedInventoryMinimum?.[item.id]){input.title='米游社探测下限：实际库存可能更多';input.classList.add('inventory-minimum');}
  if(!synced){
    row.classList.add('manual-material-row');
    const step=delta=>{input.value=String(Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,safeEval(input.value)+delta)));updateMaterialCount(item.id,input.value);};
    for(const [delta,text] of [[1,'▲'],[-1,'▼']]){const button=document.createElement('button');button.type='button';button.textContent=text;
      button.title=delta>0?'增加 1':'减少 1';button.onclick=()=>step(delta);arrows.append(button);}
    input.oninput=()=>updateMaterialCount(item.id,input.value);
    const add=document.createElement('button');add.type='button';add.className='material-add-button';add.innerHTML=svg('plus');
    add.title='追加数量';add.setAttribute('aria-label',item.name+'追加数量');add.setAttribute('aria-controls','materialAddPopover');add.setAttribute('aria-expanded','false');
    add.onclick=()=>openMaterialAdd(item,add,input);
    controls.append(arrows,add);
  }
  controls.append(input);row.append(image,copy,controls);return row;
}
const categories=[['basicInventory','基础与专属材料'],['cultInventory','培养素材'],
  ['talentInventory','天赋与角色突破'],['weaponInventory','武器突破材料']];
function renderInventory(){
  closeMaterialAdd();
  const synced=state.inventoryMode==='synced';
  for(const button of document.querySelectorAll('[data-inventory-mode]')){
    const selected=button.dataset.inventoryMode===state.inventoryMode;
    button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
  }
  $('inventoryModeNote').textContent=synced
    ?(Object.keys(state.syncedMaterialInventory).length?'米游社库存 · 虚线表示下限，未知库存按 0 估算缺口。':'尚未同步材料，请通过米游社同步。')
    :'手动库存 · 上下箭头微调，+ 追加数量。';
  const apply=$('applyInventoryButton');apply.hidden=!synced;
  apply.disabled=!Object.keys(state.syncedMaterialInventory).some(id=>state.syncedInventoryMinimum[id]!==true);
  const holder=$('inventoryGroups');holder.replaceChildren();
  const id=selectedGoalId||inventoryGoalId;const goal=goalById(id);
  const rosterName=selectedRosterKey?(selectedRosterKey.startsWith('weapon:')
    ?weaponRow(weaponInstance(state,selectedRosterKey.slice(7))?.weaponId||selectedRosterKey.slice(7))?.name
    :charRow(selectedRosterKey.slice(10))?.name):'';
  $('inventoryTarget').textContent=goal?objName(goal):rosterName||'选择培养目标';
  if(!goal){holder.innerHTML=selectedRosterKey
    ?'<div class="empty-hint">点击提升按钮配置培养目标。</div>'
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
async function confirmInventoryApplication(){
  if(state.inventoryMode!=='synced'||mysPanel?.isBusy()){toast('请等待当前同步结束后再应用。');return;}
  const summary=summarizeInventoryApplication(state);
  if(!summary.exact){toast('暂无已确认数量的同步材料。');return;}
  const account=state.activeAccountId,source=state.syncedMaterialInventory,flags=state.syncedInventoryMinimum;
  const accepted=await modal({title:'应用到手动背包',description:`将应用全部 ${summary.exact} 种已确认材料（其中 ${summary.changed} 种数量不同、${summary.added} 种新增记录）。\n保留 ${summary.minimum} 种仅有下限的材料，以及 ${summary.unknown} 种未取得同步数量的手动记录。\n应用后自动切换到手动背包。`,requiresText:false,confirm:'确认应用'});
  if(accepted===null)return;
  if(state.activeAccountId!==account||state.syncedMaterialInventory!==source||state.syncedInventoryMinimum!==flags||mysPanel?.isBusy()){
    toast('同步库存已变化，请重新核对后应用。');return;
  }
  try{
    applyInventoryToManual(state);renderInventory();renderResults();renderCalendar();await flushSave();toast('已应用 '+summary.exact+' 种材料到手动背包');
  }catch(e){toast(e.message);}
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
  const sourceMap=materialContributions(all,state);
  const catalog=collectInventoryCatalog(all);
  const categoryById=new Map();for(const [key] of categories)for(const group of catalog[key])for(const row of group.rows){
    if(!categoryById.has(row.id))categoryById.set(row.id,key);
  }
  let seen=0;
  for(const [key,title] of categories){
    const rows=target.groups.flatMap(g=>partial?singleGoalRows(g):g.rows.filter(r=>r.lack>0)).filter(r=>categoryById.get(String(r.id))===key);
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
      const primary=document.createElement('strong');primary.textContent=material.lack>0?'缺 × '+displayNum(material.lack):material.status==='craftPending'?'补齐后可合成':'已满足';value.append(primary);
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
  const heading=$('calendarHeading');
  heading.title=plan.unknown.length?`${plan.unknown.length} 种材料的开放日待核对：${plan.unknown.map(item=>item.name||item.id).join('、')}`:'按当前培养目标显示秘境材料';
}
function renderAll(){renderAccounts();renderGoals();renderFilters();renderRoster();renderInventory();renderResults();renderCalendar();}
// Each refresh builds a separate catalog/profile snapshot before changing the displayed data.
function dataReader(mode,strict=false){
  const requests=new Map();
  return path=>{
    if(!requests.has(path))requests.set(path,bridge('data.fetch',{path,mode,maxAge:path==='/manifest.json'?21600000:path.endsWith('/character.json')||path.endsWith('/weapon.json')?43200000:86400000}).then(r=>{
      if(strict&&r.source==='stale-cache')throw Error('远程资料暂时无法校验');
      return r.data;
    }));
    return requests.get(path);
  };
}
async function loadReleaseMetadata(mode){
  const [bundled,banners,characters,weapons]=await Promise.allSettled([
    fetch('./release-index.json').then(r=>{if(!r.ok)throw Error('release index');return r.json();}),
    bridge('release.fetch',{source:'banners',mode}).then(r=>indexBannerReleases(JSON.parse(r.content))),
    bridge('release.fetch',{source:'characters',mode}).then(r=>parseReleaseTable(r.content)),
    bridge('release.fetch',{source:'weapons',mode}).then(r=>parseReleaseTable(r.content))
  ]);
  const value=r=>r.status==='fulfilled'?r.value:undefined;
  return {bannerIndex:mergeBannerReleases(value(bundled),value(banners)),characterDates:value(characters),weaponDates:value(weapons)};
}
function planSelection(){
  return {account:state.activeAccountId,token:profileLoadToken,plans:state.plans.map(plan=>({id:plan.id,kind:goalKind(plan),source:structuredClone(plan.source)}))};
}
function selectionCurrent(selection){
  return selection.account===state.activeAccountId&&selection.token===profileLoadToken
    &&JSON.stringify(selection.plans)===JSON.stringify(planSelection().plans);
}
async function loadCatalog(mode,strict=false){
  const read=dataReader(mode,strict);
  const versions=readManifestVersions(await read('/manifest.json'));
  // The same version may be both live and latest.
  versions.live=versions.live||versions.latest;
  const reqs=await Promise.all([
    ['character',versions.live],['character',versions.latest],['weapon',versions.live],['weapon',versions.latest]
  ].map(async([kind,version])=>({version,data:await read('/gi/'+encodeURIComponent(version)+'/'+kind+'.json')})));
  const chars=mergeSourceLists(normalizeCharacterList(reqs[0].data).map(x=>({...x,version:versions.live})),normalizeCharacterList(reqs[1].data).map(x=>({...x,version:versions.latest})));
  const weapons=mergeSourceLists(normalizeWeaponList(reqs[2].data).map(x=>({...x,version:versions.live})),normalizeWeaponList(reqs[3].data).map(x=>({...x,version:versions.latest})));
  if(!chars.length||!weapons.length)throw Error('游戏资料目录为空');
  const release=await loadReleaseMetadata(mode);
  return {versions,characters:attachReleaseDates(chars,'character',release.characterDates,release.bannerIndex),weapons:attachReleaseDates(weapons,'weapon',release.weaponDates,release.bannerIndex),read};
}
async function loadGoalProfile(plan,read,characters=characterList,weapons=weaponList,strict=false){
  const kind=plan.kind||goalKind(plan),src=plan.source;
  const char=kind==='character'?characters.find(x=>x.id===String(src.selectedCharacterId)):null;
  const wp=kind==='weapon'?weapons.find(x=>x.id===String(src.selectedWeaponId)):null;
  const data=await Promise.allSettled([
    char?read('/gi/'+encodeURIComponent(char.version)+'/zh/character/'+char.id+'.json').then(r=>parseCharacterDetail(r,char)):Promise.resolve(null),
    wp?read('/gi/'+encodeURIComponent(wp.version)+'/zh/weapon/'+wp.id+'.json').then(r=>parseWeaponDetail(r,wp)):Promise.resolve(null)
  ]);
  if(strict){const failed=data.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
  return {characterProfile:data[0].status==='fulfilled'?data[0].value:null,weaponProfile:data[1].status==='fulfilled'?data[1].value:null};
}
async function loadSnapshot(mode,strict=false){
  const catalog=await loadCatalog(mode,strict),selection=planSelection();
  const results=await Promise.all(selection.plans.map(plan=>loadGoalProfile(plan,catalog.read,catalog.characters,catalog.weapons,strict||mode==='local')));
  return {...catalog,selection,profiles:new Map(selection.plans.map((p,i)=>[p.id,results[i]]))};
}
function snapshotChanged(next){
  return JSON.stringify([listVersion,characterList,weaponList,[...profiles]])!==JSON.stringify([next.versions,next.characters,next.weapons,[...next.profiles]]);
}
async function commitProfiles(next,token,account){
  if(token!==profileLoadToken||account!==state.activeAccountId)return;
  profiles=next;
  const plans=state.plans;
  for(const plan of state.plans){if(goalKind(plan)!=='weapon')continue;const row=weaponRow(goalObjectId(plan));if(!row)continue;const max=weaponMaxAscension(row.rarity);plan.config.weapAsc=plan.config.weapAsc.map(n=>Math.min(max,n));}
  if(!state.materialInventoryMigrated&&plans.length){
    const first=plans[0],entry=profiles.get(first.id);
    const linked=first.linkedWeaponInstanceId?plans.find(g=>g.weaponInstanceId===first.linkedWeaponInstanceId):null;
    const weapon=linked?profiles.get(linked.id)?.weaponProfile:entry.weaponProfile;
    const missing=[];const legacy=migrateLegacyInventory(state.inv,entry.characterProfile,weapon,first.source.mergeRules,missing);
    if(!missing.length){state.materialInventory={...legacy,...state.materialInventory};state.materialInventoryMigrated=true;
      try{await flushSave();}catch(e){if(token===profileLoadToken&&account===state.activeAccountId)state.materialInventoryMigrated=false;setStatus('旧库存迁移保存失败：'+e.message,'error');}}
    else toast('旧库存尚有材料待识别，将在资料完整后继续迁移。');
    if(token!==profileLoadToken||account!==state.activeAccountId)return;
  }
  renderAll();save();
}
async function applyCatalog(snapshot){
  const token=++profileLoadToken,account=state.activeAccountId;
  listVersion=snapshot.versions;characterList=snapshot.characters;weaponList=snapshot.weapons;
  await commitProfiles(snapshot.profiles,token,account);
}
async function loadLists(force=false){
  const generation=++catalogGeneration;
  return withWait('lists',force?'正在更新游戏资料…':'正在加载游戏资料…',20,async()=>{
    taskStatus('lists','正在读取 Nanoka 角色和武器资料…');
    try{
      let snapshot;
      if(force)snapshot=await loadSnapshot('check',true);
      else{
        try{snapshot=await loadSnapshot('local',true);}
        catch{snapshot=await loadSnapshot('prefer');}
      }
      if(generation!==catalogGeneration||closing)return false;
      await applyCatalog(snapshot);
      taskStatus('lists','已载入 '+characterList.length+' 名角色、'+weaponList.length+' 类武器','success');
      return true;
    }catch(e){taskStatus('lists','资料读取失败：'+e.message,'error');toast('检查网络后刷新资料');return false;}
  });
}
function canApplyBackground(){
  const focus=document.activeElement;
  return !closing&&!waitTasks.isLocked()&&!mysPanel?.isBusy()&&!updateInstalling
    &&!materialAddContext&&!document.querySelector('.modal-backdrop:not([hidden])')
    &&$('settingsMenu').hidden&&!document.body.classList.contains('resizing-columns')
    &&!focus?.matches('input,textarea,select,[contenteditable="true"]')
    &&Date.now()-lastUserInput>=600;
}
async function checkCatalogInBackground(){
  if(!host||backgroundChecking||closing)return;
  const generation=catalogGeneration;
  backgroundChecking=true;renderStatus();
  try{
    let snapshot=await loadSnapshot('check',true);
    while(!closing&&generation===catalogGeneration){
      if(!selectionCurrent(snapshot.selection)){
        // A different account or goal may have been selected during the network request.
        const selection=planSelection(),read=dataReader('check',true);
        const results=await Promise.all(selection.plans.map(plan=>loadGoalProfile(plan,read,snapshot.characters,snapshot.weapons,true)));
        snapshot={...snapshot,selection,profiles:new Map(selection.plans.map((p,i)=>[p.id,results[i]]))};
        continue;
      }
      if(!snapshotChanged(snapshot)){setStatus('游戏资料已是最新','success');return;}
      if(!canApplyBackground()){await new Promise(resolve=>setTimeout(resolve,250));continue;}
      await withWait('lists','正在应用新游戏资料…',20,()=>applyCatalog(snapshot));
      setStatus('游戏资料已更新','success');return;
    }
  }catch(e){if(generation===catalogGeneration&&!closing)setStatus('资料校验暂未完成，继续使用本地缓存','');}
  finally{backgroundChecking=false;renderStatus();}
}
async function reloadAllProfiles(force=false){
  return withWait('profiles','正在加载培养资料…',10,async()=>{
    const token=++profileLoadToken,account=state.activeAccountId;
    const plans=[...state.plans],read=dataReader(force?'check':'normal');
    const results=await Promise.all(plans.map(plan=>loadGoalProfile(plan,read)));
    if(token!==profileLoadToken||account!==state.activeAccountId||closing)return;
    await commitProfiles(new Map(plans.map((p,i)=>[p.id,results[i]])),token,account);
  });
}
function modal({title,description='',confirm='确认',requiresText=true,value=''}){
  closeMaterialAdd();
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
  const next=await withWait('import','正在读取规划文件…',30,async()=>{const result=await bridge('storage.import');if(result===null)return null;const normalized=normalizeState(result?.data||result);initializePlanner(normalized);return normalized;});if(next===null)return;
  const ok=await modal({title:'导入规划配置',description:'将替换当前全部账号、培养目标与背包数据。',requiresText:false,confirm:'导入'});
  if(ok===null)return;await withWait('import','正在导入规划…',30,async()=>{state=next;resetAccountView();await flushSave();await reloadAllProfiles();toast('规划已导入');});
}catch(e){toast('导入失败：'+e.message);}}
async function importScanner(){
  try{
    if(!characterList.length||!weaponList.length)return toast('请先载入 Nanoka 角色与武器资料');
    const good=await withWait('import','正在读取 GGScanner 文件…',30,async()=>{const raw=await bridge('storage.import');return raw===null?null:validateGOOD(raw);});if(good===null)return;
    if(good.metadata?.uid&&state.inventoryUid&&String(good.metadata.uid)!==String(state.inventoryUid)){
      toast('GOOD 文件 UID 与当前规划账号不同，请先切换账号。');return;
    }
    const {draft,result}=await withWait('import','正在匹配角色与武器…',30,async()=>{const draft=structuredClone(state);const result=importGOOD(draft,good,{characters:characterList,weapons:weaponList});return {draft,result};});
    const question=[`角色 ${result.characters} 名；新武器 ${result.newWeapons} 把；更新武器 ${result.updatedWeapons} 把。`,
      result.unmatched.length?`未匹配 ${result.unmatched.length} 项，导入后可查看提示。`:'',
      result.ambiguous.length?`有 ${result.ambiguous.length} 把重复武器需要核对，此次保留现有记录。`:''
    ].filter(Boolean).join('\n');
    const ok=await modal({title:'导入 GGScanner',description:question,requiresText:false,confirm:'确认导入'});
    if(ok===null)return;
    await withWait('import','正在导入 GGScanner 数据…',30,async()=>{
    state.ownedCharacters=draft.ownedCharacters;state.weaponInstances=draft.weaponInstances;
    for(let i=0;i<state.plans.length;i++){
      state.plans[i].config=draft.plans[i].config;
      state.plans[i].linkedWeaponInstanceId=draft.plans[i].linkedWeaponInstanceId;
    }
    if(good.metadata?.uid&&!state.inventoryUid)state.inventoryUid=String(good.metadata.uid);
    renderAll();await flushSave();toast(result.warnings[0]||'GOOD 角色与武器数据已导入');
    });
  }catch(e){toast('GOOD 导入失败：'+e.message);}
}
function closeSettings(){const menu=$('settingsMenu');menu.hidden=true;$('settingsButton').setAttribute('aria-expanded','false');}
function installSettingsMenu(){
  $('settingsButton').onclick=()=>{const menu=$('settingsMenu');menu.hidden=!menu.hidden;$('settingsButton').setAttribute('aria-expanded',String(!menu.hidden));};
  $('settingsMenu').addEventListener('click',e=>{if(e.target.closest('button:not(:disabled)'))closeSettings();});
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#settingsWrap'))closeSettings();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('settingsMenu').hidden){closeSettings();$('settingsButton').focus();}});
}
async function checkUpdate(manual=false){
  if(!host||updateChecking||updateInstalling)return;
  updateChecking=true;$('checkUpdateButton').disabled=true;
  const waiting=manual?waitTasks.begin('update','正在检查更新…',30):null;
  try{
    taskStatus('update','正在检查更新…');
    const result=await bridge('update.check');
    $('appVersion').textContent='v'+result.current;
    if(!result.available){taskStatus('update','当前已是最新版本 · v'+result.current,'success');return;}
    updateCandidate=result;taskStatus('update','发现新版本 v'+result.latest,'success');
    if((!manual&&waitTasks.isLocked())||mysPanel?.isBusy()||document.querySelector('.modal-backdrop:not([hidden])')){
      if(manual)toast('发现新版本 v'+result.latest+'，请关闭当前窗口后检查更新');
      return;
    }
    closeMaterialAdd();closeSettings();$('updateVersions').textContent='v'+result.current+' → v'+result.latest;
    $('updateNotes').textContent=result.notes||'';
    $('updateNotes').hidden=!result.notes;
    $('updateProgress').hidden=true;$('updateTitle').textContent='发现新版本';
    $('updateStatus').textContent='更新完成后程序将自动重启，本地规划与账号数据将保留。';
    $('updateLater').disabled=false;$('updateInstall').disabled=false;$('updateModal').hidden=false;
  }catch(e){taskStatus('update','检查更新失败：'+e.message,'error');}
  finally{updateChecking=false;$('checkUpdateButton').disabled=false;waiting?.end();}
}
function renderUpdateProgress(progress){
  if(!updateInstalling||!progress)return;
  const {phase,completed=0,total=0,bytesPerSecond=0}=progress;
  const labels={prepare:'正在准备更新',download:'正在下载更新包',verify:'正在校验更新包',extract:'正在解压更新文件',handoff:'正在启动安装进程'};
  const label=labels[phase]||'正在更新';
  $('updateProgress').hidden=false;$('updateTitle').textContent='正在更新';
  $('updatePhase').textContent=label;
  const bar=$('updateBar'),known=Number.isFinite(total)&&total>0&&Number.isFinite(completed)&&completed>=0;
  const percent=known?Math.min(100,Math.max(0,Math.floor(completed/total*100))):null;
  if(known)bar.value=percent;else bar.removeAttribute('value');
  $('updatePercent').textContent=known?percent+'%':'';
  const mb=n=>(n/1048576).toFixed(1)+' MB';
  $('updateBytes').textContent=known?mb(completed)+' / '+mb(total):'';
  $('updateSpeed').textContent=phase==='download'&&bytesPerSecond>0?mb(bytesPerSecond)+'/s':'';
  $('updateStatus').textContent='更新完成后程序将自动重启，本地规划与账号数据将保留。';
  taskStatus('update',label+(known?' · '+percent+'%':''));
}
async function installUpdate(){
  if(updateInstalling||!updateCandidate||mysPanel?.isBusy())return;
  updateInstalling=true;$('updateLater').disabled=true;$('updateInstall').disabled=true;
  renderUpdateProgress({phase:'prepare'});
  try{
    await flushSave();
    await bridge('update.install',{version:updateCandidate.latest});
    renderUpdateProgress({phase:'handoff'});
  }catch(e){$('updateProgress').hidden=true;$('updateStatus').textContent='更新失败：'+e.message;taskStatus('update','更新失败：'+e.message,'error');$('updateLater').disabled=false;$('updateInstall').disabled=false;updateInstalling=false;}
}
function installCompactStripScroll(){
  for(const id of ['calendarDays','activeGoals']){
    const strip=$(id);
    strip.addEventListener('wheel',event=>{
      if(event.ctrlKey||event.shiftKey||event.deltaX||strip.scrollWidth<=strip.clientWidth||!event.deltaY)return;
      const step=event.deltaMode===1?29:event.deltaMode===2?strip.clientWidth:1;
      const next=Math.max(0,Math.min(strip.scrollWidth-strip.clientWidth,strip.scrollLeft+event.deltaY*step));
      if(next!==strip.scrollLeft){event.preventDefault();strip.scrollLeft=next;}
    },{passive:false});
  }
}
async function start(){
  installMaterialAdd();
  for(const type of ['pointerdown','keydown','input','wheel'])document.addEventListener(type,()=>{lastUserInput=Date.now();},{capture:true,passive:true});
  installCompactStripScroll();
  installSettingsMenu();
  $('checkUpdateButton').onclick=()=>void checkUpdate(true);
  $('updateLater').onclick=()=>{if(!updateInstalling)$('updateModal').hidden=true;};
  $('updateInstall').onclick=()=>void installUpdate();
  if(host){try{$('appVersion').textContent='v'+await bridge('app.version');}catch(e){toast('版本读取失败：'+e.message);}}
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
  $('applyInventoryButton').onclick=()=>void confirmInventoryApplication();
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
  try{const record=await bridge('storage.load');if(record!==null){if(!record||typeof record!=='object'||Array.isArray(record))throw Error('规划文件格式错误');state=normalizeState(record);}storageReady=true;}catch(e){setStatus('读取本地数据失败：'+e.message+'。原文件已保留，请关闭程序检查 data/planner.json。','error');return;}
  initializePlanner(state);renderAll();
  mysPanel=installMiyoushePanel(bridge,{getPlanningId:()=>state.activeAccountId,getInventoryUid:()=>state.inventoryUid,getBinding:()=>state.mysBinding,
    listPlanning:()=>state.plannerAccounts.map(a=>({id:a.id,name:a.name,uid:a.id===state.activeAccountId?state.inventoryUid:a.data?.inventoryUid||''})),
    setStatus:(text,tone)=>taskStatus('sync',text,tone||'busy'),toast,
    beginWait:(key,text,priority)=>waitTasks.begin(key,text,priority),isWaiting:()=>waitTasks.isLocked(),
    bind:async(target,raw,label)=>{
      const binding=normalizeMysBinding(raw);if(!binding)throw Error('绑定信息无效。');
      const owner=plannerBindingOwner(state,binding.uid,target);
      if(owner)throw Error('该 UID 已属于规划账号「'+owner.name+'」。');
      if(target==='@new'){
        const defaults=normalizeState(cloneDefaultState());initializePlanner(defaults);
        createPlannerAccount(state,'account-'+newId('local'),label,defaults);
      }else{
        const record=state.plannerAccounts.find(a=>a.id===target);
        if(!record)throw Error('所选规划账号不存在。');
        const old=target===state.activeAccountId?state.inventoryUid:record.data?.inventoryUid;
        if(old&&old!==binding.uid&&!window.confirm('将「'+record.name+'」的 UID 从 '+old+' 更换为 '+binding.uid+'？原同步库存将清空，手动库存和培养计划保留。'))return false;
        if(target!==state.activeAccountId)selectPlannerAccount(state,target);
      }
      bindMysAccount(state,binding,{replaceUid:true});resetAccountView();await flushSave();void reloadAllProfiles();return true;
    },
    unbind:async()=>{unbindMysAccount(state);renderAccounts();await flushSave();},
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
    apply:async result=>{applySyncedInventory(state,result);state.mysSyncedAt=Date.now();renderInventory();renderResults();renderCalendar();await flushSave();}});
  mysPanel.update();
  if(host)await bridge('app.ready');
  return await loadLists();
}
void withWait('startup','正在读取本地数据…',1,start).then(loaded=>{if(storageReady){void checkUpdate();if(loaded)void checkCatalogInBackground();}}).catch(e=>{setStatus('初始化失败：'+e.message,'error');});
