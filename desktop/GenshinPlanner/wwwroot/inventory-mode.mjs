import {safeEval} from './core.mjs';
export function activeMaterialInventory(state){
  return state.inventoryMode==='synced' ? state.syncedMaterialInventory : state.materialInventory;
}
export function selectInventoryMode(state,mode){
  if(mode!=='manual'&&mode!=='synced')throw Error('库存模式无效。');
  state.inventoryMode=mode;
}
export function setManualMaterial(state,id,value){
  if(state.inventoryMode!=='manual')return false;
  if(String(value).trim())state.materialInventory[id]=String(value);
  else delete state.materialInventory[id];
  return true;
}
export function applySyncedInventory(state,result){
  const uid=String(result?.uid||'');
  if(!/^\d{6,12}$/.test(uid)||!Array.isArray(result.materials))throw Error('同步库存格式错误。');
  if(state.inventoryUid&&state.inventoryUid!==uid)throw Error('该 UID 与当前规划账号不同。');
  const inventory=result.replace?{}:{...state.syncedMaterialInventory},minimum=result.replace?{}:{...state.syncedInventoryMinimum};
  for(const row of result.materials){
    const id=String(row.id),num=row.num;
    if(!/^\d{1,12}$/.test(id)||!Number.isSafeInteger(num)||num<0)throw Error('同步材料数量无效。');
    inventory[id]=String(num);
    if(row.minimum===true)minimum[id]=true;else delete minimum[id];
  }
  state.inventoryUid=uid;
  state.syncedMaterialInventory=inventory;
  state.syncedInventoryMinimum=minimum;
}

export function compareInventoryMaterial(state,id){
  const raw=state.materialInventory[id],manual=raw===undefined||String(raw).trim()===''?null:safeEval(raw);
  if(!Object.hasOwn(state.syncedMaterialInventory,id))return {manual,synced:null,status:'unknown',delta:null};
  const synced=Number(state.syncedMaterialInventory[id]);
  if(!Number.isSafeInteger(synced)||synced<0)return {manual,synced:null,status:'unknown',delta:null};
  const status=state.syncedInventoryMinimum[id]===true?'minimum':'exact';
  return {manual,synced,status,delta:status==='exact'&&manual!==null?synced-manual:null};
}
export function summarizeInventoryApplication(state){
  const summary={exact:0,changed:0,added:0,minimum:0,unknown:0};
  const ids=new Set([...Object.keys(state.materialInventory),...Object.keys(state.syncedMaterialInventory)]);
  for(const id of ids){
    const row=compareInventoryMaterial(state,id);
    if(row.status==='exact'){
      summary.exact++;
      if(row.manual===null)summary.added++;
      else if(row.delta!==0)summary.changed++;
    }else if(row.status==='minimum')summary.minimum++;
    else if(row.manual!==null)summary.unknown++;
  }
  return summary;
}
export function applyInventoryToManual(state){
  const summary=summarizeInventoryApplication(state);
  if(!summary.exact)throw Error('暂无已确认数量的同步材料。');
  const manual={...state.materialInventory};
  for(const id of Object.keys(state.syncedMaterialInventory)){
    const row=compareInventoryMaterial(state,id);
    if(row.status==='exact')manual[id]=String(row.synced);
  }
  state.materialInventory=manual;
  selectInventoryMode(state,'manual');
  return summary;
}
