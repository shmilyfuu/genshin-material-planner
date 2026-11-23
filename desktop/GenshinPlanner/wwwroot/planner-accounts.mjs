const ACCOUNT_FIELDS = [
  'plans', 'activePlanId', 'source', 'config', 'materialInventory',
  'materialInventoryMigrated', 'inv', 'inventoryUid', 'hybridInventory',
  'verifiedInventory', 'manualInventoryImportUid', 'ownedCharacters',
  'weaponInstances', 'plannerSchema'
];

export function plannerSnapshot(state) {
  return Object.fromEntries(ACCOUNT_FIELDS.map(key => [key, structuredClone(state[key])]));
}

export function applyPlannerSnapshot(state, data) {
  for (const key of ACCOUNT_FIELDS) state[key] = structuredClone(data[key]);
  return state;
}

export function saveActivePlannerAccount(state) {
  const current = state.plannerAccounts.find(account => account.id === state.activeAccountId);
  if (!current) throw new Error('当前规划账号不存在。');
  current.data = plannerSnapshot(state);
  return current;
}

export function selectPlannerAccount(state, id) {
  const target = state.plannerAccounts.find(account => account.id === id);
  if (!target) throw new Error('所选规划账号不存在。');
  if (state.activeAccountId === id) return target;
  saveActivePlannerAccount(state);
  applyPlannerSnapshot(state, target.data);
  state.activeAccountId = id;
  return target;
}

export function createPlannerAccount(state, id, name, defaults) {
  if (state.plannerAccounts.length >= 20) throw new Error('最多添加 20 个账号。');
  const label = String(name || '').trim().slice(0, 32);
  if (!label) throw new Error('请输入账号名称。');
  if (state.plannerAccounts.some(account => account.name === label)) throw new Error('账号名称已存在。');
  if (state.plannerAccounts.some(account => account.id === id)) throw new Error('账号编号重复。');
  saveActivePlannerAccount(state);
  state.plannerAccounts.push({id, name:label, data:plannerSnapshot(defaults)});
  applyPlannerSnapshot(state, defaults);
  state.activeAccountId=id;
}

export function renamePlannerAccount(state, id, name) {
  const account=state.plannerAccounts.find(row=>row.id===id);
  if(!account)throw new Error('账号不存在。');
  const label=String(name || '').trim().slice(0,32);
  if(!label)throw new Error('请输入账号名称。');
  if(state.plannerAccounts.some(row=>row.id!==id && row.name===label))throw new Error('账号名称已存在。');
  account.name=label;
}

export function deletePlannerAccount(state, id) {
  if(state.plannerAccounts.length<2) throw new Error('至少保留一个账号。');
  const index=state.plannerAccounts.findIndex(account=>account.id===id);
  if(index<0)throw new Error('账号不存在。');
  if(state.activeAccountId!==id)saveActivePlannerAccount(state);
  state.plannerAccounts.splice(index,1);
  if(state.activeAccountId===id){
    const fallback=state.plannerAccounts[Math.min(index,state.plannerAccounts.length-1)];
    applyPlannerSnapshot(state,fallback.data);
    state.activeAccountId=fallback.id;
  }
}
