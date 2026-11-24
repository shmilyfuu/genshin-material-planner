export function normalizeMysBinding(value){
  if(!value||typeof value!=='object')return null;
  const accountId=String(value.accountId||''),uid=String(value.uid||''),region=String(value.region||'');
  if(!/^\d{1,24}$/.test(accountId)||!/^\d{6,12}$/.test(uid)||!/^cn_[a-z0-9_]{1,24}$/.test(region))return null;
  return {accountId,uid,region,nickname:String(value.nickname||'').slice(0,64),regionName:String(value.regionName||'').slice(0,64)};
}
export function sameMysBinding(a,b){return !!a&&!!b&&a.accountId===b.accountId&&a.uid===b.uid&&a.region===b.region;}
export function plannerBindingOwner(state,uid,exceptId=''){
  return state.plannerAccounts.find(a=>a.id!==exceptId&&(
    (a.id===state.activeAccountId?state.mysBinding:a.data?.mysBinding)?.uid===uid||
    (a.id===state.activeAccountId?state.inventoryUid:a.data?.inventoryUid)===uid
  ))||null;
}
export function bindMysAccount(state,raw,{replaceUid=false}={}){
  const binding=normalizeMysBinding(raw);
  if(!binding)throw Error('米游社绑定信息无效。');
  const owner=plannerBindingOwner(state,binding.uid,state.activeAccountId);
  if(owner)throw Error('该 UID 已属于规划账号「'+owner.name+'」。');
  const old=state.inventoryUid||state.mysBinding?.uid||'';
  if(old&&old!==binding.uid){
    if(!replaceUid)throw Error('该规划账号已有不同 UID，请确认更换绑定。');
    state.syncedMaterialInventory={};state.syncedInventoryMinimum={};state.mysSyncedAt=0;
  }
  state.inventoryUid=binding.uid;state.mysBinding=binding;
  return binding;
}
export function unbindMysAccount(state){state.mysBinding=null;}
