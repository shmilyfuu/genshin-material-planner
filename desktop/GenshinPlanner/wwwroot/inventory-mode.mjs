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
