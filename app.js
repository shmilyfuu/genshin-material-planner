import {
  CHAR_LEVEL_LABELS,
  cloneDefaultState,
  normalizeState,
  safeEval
} from './core.mjs';
import {
  detectMergeRules,
  normalizeCharacterList,
  normalizeWeaponList,
  parseCharacterDetail,
  parseWeaponDetail,
  readManifestVersions,
  requestHakushin,
  mergeSourceLists,
  itemIconUrl
} from './hakushin.mjs';
import {buildNanokaDemand, evaluateNanokaDemand, mapManualInventory} from './hybrid-calculator.mjs';
import {calculateMultiPlan,migrateLegacyInventory,collectInventoryCatalog} from './multi-planner.mjs';

const STORAGE_KEY = 'materialPlannerHakushinBetaState';
const EXPORT_TYPE = 'material-planner-hakushin-beta-config';
const OLD_EXPORT_TYPE = 'material-planner-sidepanel-config';


const ELEMENT_LABELS = {
  Pyro: '火', Hydro: '水', Cryo: '冰', Electro: '雷', Anemo: '风', Geo: '岩', Dendro: '草'
};
const WEAPON_TYPE_LABELS = {
  Sword: '单手剑', Bow: '弓', Catalyst: '法器', Polearm: '长柄武器', Claymore: '双手剑',
  WEAPON_SWORD_ONE_HAND: '单手剑', WEAPON_BOW: '弓', WEAPON_CATALYST: '法器', WEAPON_POLE: '长柄武器', WEAPON_CLAYMORE: '双手剑'
};

const selectorDefinitions = [
  { container: 'characterSelectors', key: 'charAsc', label: '角色等级', labels: CHAR_LEVEL_LABELS },
  { container: 'characterSelectors', key: 'talentA', label: '普攻（A）' },
  { container: 'characterSelectors', key: 'talentE', label: '战技（E）' },
  { container: 'characterSelectors', key: 'talentQ', label: '爆发（Q）' },
  { container: 'weaponSelectors', key: 'weapAsc', label: '武器等级', labels: CHAR_LEVEL_LABELS }
];



let state = cloneDefaultState();
let saveTimer = null;
let toastTimer = null;
let dialogPreviouslyFocused = null;
let characterList = [];
let weaponList = [];
let characterProfile = null;
let weaponProfile = null;
let planProfiles = new Map();
let profileLoadSerial = 0;
let nextPlanSerial = 0;
let syncInfo = { live: '', latest: '', listSource: 'none' };
let uiFilters = {
  characterSearch: '',
  characterElement: '',
  characterRarity: '',
  weaponSearch: '',
  weaponType: '',
  weaponRarity: ''
};

function applyImageSource(image, url, slot = null, materialName = '') {
  if (!url && !materialName) {
    if (slot) slot.classList.add('icon-fallback');
    return;
  }

  image.hidden = true;
  if (slot) slot.classList.add('icon-loading');
  let proxyRequested = false;
  let completed = false;

  const markFailed = (details = '') => {
    if (completed) return;
    completed = true;
    image.hidden = true;
    if (slot) {
      slot.classList.remove('icon-loading', 'icon-loaded');
      slot.classList.add('icon-fallback');
      const suffix = details ? ` · ${details}` : '';
      slot.title = materialName ? `${materialName}：图标加载失败${suffix}` : `图标加载失败${suffix}`;
    }
  };

  const markLoaded = (sourceLabel = 'Nanoka') => {
    if (completed) return;
    completed = true;
    image.hidden = false;
    if (slot) {
      slot.classList.remove('icon-loading', 'icon-fallback');
      slot.classList.add('icon-loaded');
      const source = image.currentSrc || image.src || url;
      slot.title = materialName
        ? `${materialName} · 图片来源：${sourceLabel} · ${source}`
        : `图片来源：${sourceLabel} · ${source}`;
    }
  };

  const requestProxy = () => {
    if (proxyRequested || completed) return;
    proxyRequested = true;
    if (!globalThis.chrome?.runtime?.sendMessage) {
      markFailed('扩展后台不可用');
      return;
    }
    chrome.runtime.sendMessage({ type: 'hakushin:image', url: url || '', materialName })
      .then((response) => {
        if (!response?.ok || !response.dataUrl) {
          markFailed(response?.error || '代理读取失败');
          return;
        }
        image.onload = () => {
          const sourceLabels = { lunaris: 'Lunaris', nanoka: 'Nanoka', 'memory-cache': '图片缓存' };
          markLoaded(sourceLabels[response.source] || 'Nanoka');
        };
        image.onerror = () => markFailed('代理图片无法解码');
        image.src = response.dataUrl;
      })
      .catch((error) => markFailed(String(error?.message || error)));
  };

  image.onload = () => markLoaded('Nanoka');
  image.onerror = requestProxy;

  if (url) {
    image.src = url;
  } else {
    requestProxy();
  }
}

const storage = {
  async get() {
    if (globalThis.chrome?.storage?.local) {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      return stored[STORAGE_KEY];
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  },
  async set(value) {
    if (globalThis.chrome?.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEY]: value });
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }
};

function formatElement(value) {
  return ELEMENT_LABELS[value] || value || '全部属性';
}

function formatWeaponType(value) {
  return WEAPON_TYPE_LABELS[value] || value || '全部类型';
}

function rarityText(value) {
  return value ? `${value}★` : '';
}

function activePlan() {
  return state.plans.find(plan => plan.id === state.activePlanId) || state.plans[0];
}

function commitActivePlan() {
  const plan = activePlan();
  if (plan) {
    plan.source = structuredClone(state.source);
    plan.config = structuredClone(state.config);
  }
}

function showActivePlan() {
  const plan = activePlan();
  if (!plan) return;
  state.source = structuredClone(plan.source);
  state.config = structuredClone(plan.config);
  const profiles = planProfiles.get(plan.id) || {};
  characterProfile = profiles.characterProfile || null;
  weaponProfile = profiles.weaponProfile || null;
  renderPlanItems();
  renderSourceControls();
  renderSelectors();
  renderInventory();
  renderResults();
}

function renderPlanItems() {
  const holder = document.getElementById('planItems');
  if (!holder) return;
  holder.replaceChildren();
  state.plans.forEach((plan,index) => {
    const source = plan.id === state.activePlanId ? state.source : plan.source;
    const names = [source.selectedCharacterName,source.selectedWeaponName].filter(Boolean);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'plan-item' + (plan.id === state.activePlanId ? ' active' : '');
    button.setAttribute('aria-pressed',String(plan.id === state.activePlanId));
    button.textContent = '培养项 ' + (index + 1) + (names.length ? ' · ' + names.join(' + ') : ' · 选择养成对象');
    button.addEventListener('click',() => {
      if (plan.id === state.activePlanId) return;
      commitActivePlan();
      state.activePlanId = plan.id;
      officialCalculation = null;
      showActivePlan();
      scheduleSave();
    });
    holder.append(button);
  });
  const remove = document.getElementById('removePlanButton');
  if (remove) remove.disabled = state.plans.length === 1
    && !state.source.selectedCharacterId && !state.source.selectedWeaponId;
}

function addPlan() {
  commitActivePlan();
  const defaults = cloneDefaultState();
  const id = 'item-' + Date.now().toString(36) + '-' + (++nextPlanSerial);
  state.plans.push({id,source:defaults.source,config:defaults.config});
  state.activePlanId = id;
  officialCalculation = null;
  showActivePlan();
  scheduleSave({immediate:true});
}

function removePlan() {
  commitActivePlan();
  const index=state.plans.findIndex(plan=>plan.id===state.activePlanId);
  if(index<0)return;
  const removed=state.plans[index];
  state.plans.splice(index,1);
  planProfiles.delete(removed.id);
  if (!state.plans.length) {
    const defaults=cloneDefaultState();
    state.plans=defaults.plans;
  }
  state.activePlanId=state.plans[Math.min(index,state.plans.length-1)].id;
  officialCalculation=null;
  showActivePlan();
  scheduleSave({immediate:true});
}

function currentMultiCalculation() {
  commitActivePlan();
  return calculateMultiPlan(
    state.plans.map(plan=>({
      plan,
      characterProfile:planProfiles.get(plan.id)?.characterProfile || null,
      weaponProfile:planProfiles.get(plan.id)?.weaponProfile || null
    })),
    state.materialInventory
  );
}

let officialCalculation = null;

function currentUid() {
  return state.inventoryUid;
}

export function getCalculationMode() {
  return state.calculationMode === 'official' ? 'official' : 'manual';
}

export function getCalculationPlan() {
  return {
    characterId: state.source.selectedCharacterId,
    weaponId: state.source.selectedWeaponId,
    config: structuredClone(state.config)
  };
}

function calculationSignature(uid, plan) {
  return JSON.stringify({uid, plan});
}

function currentCalculationSignature() {
  return calculationSignature(currentUid(), getCalculationPlan());
}

export function chooseInventoryUid(uid) {
  const value = /^\d{6,12}$/.test(String(uid || '')) ? String(uid) : '';
  if (value === state.inventoryUid) return;
  state.inventoryUid = value;
  officialCalculation = null;
  renderResults();
  scheduleSave();
}

function importSavedManualInventory(uid) {
  if (!uid || state.manualInventoryImportUid) return;
  const mapped = mapManualInventory({
    inventory: state.inv,
    characterProfile,
    weaponProfile,
    mergeRules: getMergeRules()
  });
  if (!Object.keys(mapped.values).length) return;
  state.verifiedInventory[uid] = {
    ...(state.verifiedInventory[uid] || {}),
    ...mapped.values
  };
  state.manualInventoryImportUid = uid;
  scheduleSave();
}

export function setOfficialCalculation(uid, plan, result) {
  if (getCalculationMode() !== 'official' || uid !== currentUid()
    || calculationSignature(uid, plan) !== currentCalculationSignature()) {
    throw new Error('账号或培养目标已变更，请重新计算。');
  }
  if (!Array.isArray(result?.materials) || !Array.isArray(result?.available)
    || !Array.isArray(result?.inventoryProbe)) {
    throw new Error('米游社计算结果格式错误。');
  }
  importSavedManualInventory(uid);
  const fallback = {
    character: result.fallback?.character === true,
    weapon: result.fallback?.weapon === true
  };
  const demand = fallback.character || fallback.weapon
    ? buildNanokaDemand({config: state.config, characterProfile, weaponProfile, parts: fallback})
    : null;
  officialCalculation = {
    signature: currentCalculationSignature(),
    materials: result.materials,
    available: result.available,
    inventoryProbe: result.inventoryProbe,
    probeCoverage: result.probeCoverage || {completed: 0, total: 0},
    demand,
    officialItemCount: Number.isSafeInteger(result.itemCount) ? result.itemCount : 0,
    manualRemaining: {},
    updatedAt: Date.now()
  };
  renderResults();
  return {
    officialMissing: result.materials.filter(material => material.lack > 0).length,
    fallbackCount: demand?.groups.reduce((sum, group) =>
      sum + group.rows.filter(row => row.count > 0).length, 0) || 0,
    inventoryCount: result.inventoryProbe.length,
    probeCoverage: result.probeCoverage || {completed: 0, total: 0},
    unresolved: demand?.unrecognized.length || 0
  };
}

function refreshCalculationMode() {
  const official = getCalculationMode() === 'official';
  const groups = document.getElementById('manualInventoryGroups');
  if (groups) groups.hidden = official;
  const auth = document.getElementById('mysAuthCard');
  if (auth) auth.hidden = !official;
  if (official) document.getElementById('miyousheOptions').open = true;
  const title = document.querySelector('.inventory-card .summary-title');
  if (title) title.textContent = official ? '米游社计算' : '我的背包';
  const hint = document.querySelector('.inventory-card .summary-hint');
  if (hint) hint.textContent = official ? '按当前目标计算材料缺口' : '支持 38*2、100+25 等算式';
  for (const button of document.querySelectorAll('[data-calc-mode]')) {
    button.setAttribute('aria-pressed', button.dataset.calcMode === getCalculationMode() ? 'true' : 'false');
  }
}

function chooseCalculationMode(mode) {
  const target = mode === 'official' ? 'official' : 'manual';
  if (state.calculationMode === target) return;
  state.calculationMode = target;
  officialCalculation = null;
  refreshCalculationMode();
  renderResults();
  scheduleSave();
}



function scheduleSave(options = {}) {
  const { immediate = false } = options;
  clearTimeout(saveTimer);
  setSaveStatus('正在保存…');
  if (immediate) {
    void persistState();
    return;
  }
  saveTimer = setTimeout(() => void persistState(), 250);
}

async function persistState() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    commitActivePlan();
    await storage.set(state);
    setSaveStatus('已自动保存');
  } catch (error) {
    console.error(error);
    setSaveStatus('保存失败');
    showToast('本地保存失败，请重新打开扩展后再试。', 'error');
  }
}

function setSaveStatus(message) {
  const element = document.getElementById('saveStatus');
  if (element) element.textContent = message;
}

function updateLevelRange(key, changedIndex, rawValue) {
  const max = key.startsWith('talent') ? 9 : 6;
  const value = Math.min(max, Math.max(0, Number.parseInt(rawValue, 10) || 0));
  const next = [...state.config[key]];
  next[changedIndex] = value;
  if (changedIndex === 0 && next[1] < next[0]) next[1] = next[0];
  if (changedIndex === 1 && next[1] < next[0]) next[0] = next[1];
  state.config[key] = next;
  commitActivePlan();
  renderSelectors();
  renderInventory();
  renderResults();
  scheduleSave({ immediate: true });
}

function createLevelSelector(definition) {
  const row = document.createElement('div');
  row.className = 'selector-row';

  const label = document.createElement('span');
  label.className = 'selector-label';
  label.textContent = definition.label;

  const controls = document.createElement('div');
  controls.className = 'selector-controls';

  const maxIndex = definition.labels ? definition.labels.length - 1 : 9;
  const createSelect = (selectedIndex, changedIndex) => {
    const select = document.createElement('select');
    select.setAttribute('aria-label', `${definition.label}${changedIndex === 0 ? '当前等级' : '目标等级'}`);
    for (let index = 0; index <= maxIndex; index += 1) {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = definition.labels ? definition.labels[index] : `Lv.${index + 1}`;
      option.selected = index === selectedIndex;
      select.append(option);
    }
    select.addEventListener('change', (event) => updateLevelRange(definition.key, changedIndex, event.target.value));
    return select;
  };

  controls.append(createSelect(state.config[definition.key][0], 0));
  const arrow = document.createElement('span');
  arrow.className = 'selector-arrow';
  arrow.textContent = '→';
  controls.append(arrow);
  const targetSelect = createSelect(state.config[definition.key][1], 1);
  targetSelect.classList.add('target-select');
  controls.append(targetSelect);

  row.append(label, controls);
  return row;
}

function renderSelectors() {
  const containerIds = [...new Set(selectorDefinitions.map((definition) => definition.container))];
  containerIds.forEach((id) => document.getElementById(id).replaceChildren());
  selectorDefinitions.forEach((definition) => {
    document.getElementById(definition.container).append(createLevelSelector(definition));
  });
}

function getMergeRules() {
  return state.source?.mergeRules || { matAIntoCult: false, matBIntoCult: false };
}

function materialAt(group, index) {
  if (group === 'spec' || group === 'boss' || group === 'weekly' || group === 'crown') {
    return characterProfile?.materials?.[group] || null;
  }
  if (group === 'books' || group === 'cult' || group === 'charGems') {
    const value = characterProfile?.materials?.[group];
    return Array.isArray(value) ? value[index] || null : null;
  }
  if (group === 'weapGems' || group === 'matA' || group === 'matB') {
    const value = weaponProfile?.materials?.[group];
    return Array.isArray(value) ? value[index] || null : null;
  }
  return null;
}

function getCultMaterial(index) {
  const base = characterProfile?.materials?.cult || [];
  const matA = weaponProfile?.materials?.matA || [];
  const rules = getMergeRules();
  if (index <= 2) return base[index] || null;
  if (index === 3 && rules.matAIntoCult) return matA[2] || null;
  return null;
}

function createMultiInventoryInput(material) {
  const id = String(material.id);
  const wrapper = document.createElement('label');
  const color = material.rank >= 5 ? 'gold' : material.rank === 4 ? 'purple'
    : material.rank === 3 ? 'blue' : material.rank === 2 ? 'green'
      : material.rank === 1 ? 'white' : 'base';
  wrapper.className = 'item-input color-' + color;
  const iconSlot = document.createElement('span');
  iconSlot.className = 'material-icon-slot inventory-icon-slot slot-' + color;
  const icon = document.createElement('img');
  icon.className = 'material-icon';
  icon.alt = '';
  iconSlot.append(icon);
  applyImageSource(icon,itemIconUrl(id),iconSlot,material.name);
  const labelText = document.createElement('span');
  labelText.className = 'item-label';
  labelText.textContent = material.name;
  const inputWrap = document.createElement('span');
  inputWrap.className = 'input-wrap';
  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = '0';
  input.value = state.materialInventory[id] || '';
  input.setAttribute('aria-label',material.name + '背包数量');
  const preview = document.createElement('span');
  preview.className = 'formula-preview';
  const updatePreview = () => {
    const raw = input.value;
    const operator = /[+\-*/×÷()（）]/.test(raw);
    preview.textContent = operator && raw.trim()
      ? '= ' + safeEval(raw).toLocaleString() : '';
    input.classList.toggle('has-preview',Boolean(preview.textContent));
  };
  input.addEventListener('input',() => {
    if (input.value.trim()) state.materialInventory[id] = input.value;
    else delete state.materialInventory[id];
    updatePreview();
    renderResults();
    scheduleSave();
  });
  updatePreview();
  inputWrap.append(input,preview);
  wrapper.append(iconSlot,labelText,inputWrap);
  return wrapper;
}

function renderInventory() {
  const result = collectInventoryCatalog(state.plans.map(plan=>({
    characterProfile:planProfiles.get(plan.id)?.characterProfile || null,
    weaponProfile:planProfiles.get(plan.id)?.weaponProfile || null
  })));
  for (const [containerId,sections] of Object.entries(result)) {
    const holder=document.getElementById(containerId);
    holder.replaceChildren();
    for (const group of sections) {
      if (!group.title) {
        for (const row of group.rows) holder.append(createMultiInventoryInput(row));
        continue;
      }
      const section=document.createElement('section');
      section.className='independent-group';
      const title=document.createElement('h3');
      title.textContent=group.title;
      const grid=document.createElement('div');
      grid.className='input-grid';
      for (const row of group.rows) grid.append(createMultiInventoryInput(row));
      section.append(title,grid);
      holder.append(section);
    }
  }
  document.getElementById('independentWeaponMaterials').replaceChildren();
}

function createResultSection(title) {
  const section = document.createElement('section');
  section.className = 'result-section';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const rows = document.createElement('div');
  rows.className = 'result-rows';
  section.append(heading, rows);
  return { section, rows };
}

function createResultRow(label, value, color = 'base', icon = '') {
  const row = document.createElement('div');
  row.className = `result-row result-${color}`;
  const nameWrap = document.createElement('span');
  nameWrap.className = 'result-name';
  const iconSlot = document.createElement('span');
  iconSlot.className = `material-icon-slot result-icon-slot slot-${color}`;
  if (icon || label) {
    const image = document.createElement('img');
    image.className = 'material-icon result-icon';
    image.alt = '';
    iconSlot.append(image);
    applyImageSource(image, icon, iconSlot, label);
  } else {
    iconSlot.classList.add('icon-fallback');
  }
  nameWrap.append(iconSlot);
  const name = document.createElement('span');
  name.textContent = label;
  nameWrap.append(name);
  const count = document.createElement('strong');
  count.textContent = `× ${value.toLocaleString()}`;
  row.append(nameWrap, count);
  return row;
}



function officialMaterialGroups() {
  const groups = new Map();
  const add = (material, group) => {
    if (!material) return;
    const id = Number(material.id);
    if (Number.isSafeInteger(id) && id > 0 && !groups.has(id)) groups.set(id, group);
  };
  add({id: 202}, '基础与经验材料');
  for (const key of ['spec', 'boss', 'weekly', 'crown']) add(characterProfile?.materials?.[key], '角色基础材料');
  for (const key of ['charGems', 'cult']) {
    for (const material of characterProfile?.materials?.[key] || []) add(material, '角色突破材料');
  }
  for (const material of characterProfile?.materials?.books || []) add(material, '天赋材料');
  for (const key of ['weapGems', 'matA', 'matB']) {
    for (const material of weaponProfile?.materials?.[key] || []) add(material, '武器突破材料');
  }
  return groups;
}

function appendHybridResults(container, calculation) {
  const uid = currentUid();
  const mixed = calculation.officialItemCount > 0;
  const manual = mixed ? calculation.manualRemaining : (state.hybridInventory[uid] || {});
  const stock = evaluateNanokaDemand(calculation.demand, {
    manual,
    available: calculation.available,
    inventoryProbe: calculation.inventoryProbe,
    manualReference: state.verifiedInventory[uid] || {},
    officialMaterials: calculation.materials,
    mixed
  });
  const label = document.createElement('p');
  label.className = 'hybrid-inventory-description';
  label.textContent = mixed
    ? '已确认的手动数量按材料 ID 对照；官方已计算的材料使用本次剩余量。合成材料需核对库存。'
    : '优先使用已确认的手动数量。米游社推算可能包含合成产物，未确认的材料系列显示需求量。';
  container.append(label);
  for (const group of stock.groups) {
    const section = createResultSection(group.title + ' · Nanoka');
    if (!group.complete) {
      const note = document.createElement('p');
      note.className = 'hybrid-inventory-note';
      note.textContent = group.covered
        ? '当前库存包含米游社合成推算，缺口待核对；暂显示培养需求。'
        : '库存尚未全部确认，当前显示培养需求。';
      section.section.append(note);
    }
    for (const item of group.rows) {
      const displayCount = group.complete ? item.lack : item.count;
      const row = createResultRow(item.name, displayCount, 'base', itemIconUrl(item.id));
      row.classList.add('hybrid-demand-row');
      const amount = row.querySelector('strong');
      amount.textContent = group.complete
        ? (item.lack ? '缺 × ' + item.lack.toLocaleString() : '已满足')
        : item.count ? '需 × ' + item.count.toLocaleString() : '—';
      const editor = document.createElement('label');
      editor.className = 'hybrid-stock';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.inputMode = 'numeric';
      input.placeholder = '待确认';
      input.setAttribute('aria-label', item.name + '可用数量');
      input.value = item.stock === null ? '' : String(item.stock);
      const stockLabel = document.createElement('span');
      stockLabel.textContent = item.source === '米游社推算'
        ? '米游社推算' : item.source === '官方计算后可用'
          ? '官方余量' : item.source === '手动背包'
            ? '手动背包' : item.source === '手动确认'
              ? '手动确认' : item.source === '米游社剩余量'
                ? '接口剩余' : mixed ? '本次剩余' : '背包数量';
      editor.append(stockLabel, input);
      input.addEventListener('change', () => {
        const value = input.value.trim();
        if (value !== '' && (!/^\d+$/.test(value)
          || !Number.isSafeInteger(Number(value)) || Number(value) < 0)) {
          showToast('请输入非负整数库存数量。', 'error');
          input.value = item.stock === null ? '' : String(item.stock);
          return;
        }
        const existing = mixed
          ? calculation.manualRemaining
          : (state.hybridInventory[uid] ||= {});
        if (!value) delete existing[item.id];
        else existing[item.id] = Number(value);
        renderResults();
        if (!mixed) scheduleSave();
      });
      row.append(editor);
      if (item.different) {
        const difference = document.createElement('small');
        difference.className = 'hybrid-stock-difference';
        difference.textContent = '手动背包 ' + item.manualReference.toLocaleString()
          + ' · 米游社推算 ' + item.probeValue.toLocaleString();
        row.append(difference);
      }
      section.rows.append(row);
    }
    container.append(section.section);
  }
  for (const missing of stock.unrecognized) {
    const row = createResultRow(missing.title, missing.count, 'base');
    row.querySelector('strong').textContent = '需 × ' + missing.count + ' · 材料待实装';
    const section = createResultSection('材料数据待补充 · Nanoka');
    section.rows.append(row);
    container.append(section.section);
  }
}

function renderOfficialResults() {
  const container = document.getElementById('resultContent');
  container.replaceChildren();
  if (!currentUid()) {
    container.append(createEmptyResult('尚未选择游戏 UID', '请在米游社计算中读取账号对应的游戏 UID。'));
    return;
  }
  if (!officialCalculation || officialCalculation.signature !== currentCalculationSignature()) {
    container.append(createEmptyResult('等待官方计算结果', '设置养成目标后，点击“计算缺口”读取米游社结果。'));
    return;
  }
  const missing = officialCalculation.materials
    .filter(item => Number.isSafeInteger(item.lack) && item.lack > 0);
  if (!missing.length && !officialCalculation.demand) {
    container.append(createEmptyResult('官方计算：材料已满足', '当前培养目标所需材料已覆盖。'));
    return;
  }
  const groups = officialMaterialGroups();
  const buckets = new Map();
  for (const material of missing) {
    const group = groups.get(material.id) || '其他材料';
    if (!buckets.has(group)) buckets.set(group, []);
    buckets.get(group).push(material);
  }
  for (const title of ['基础与经验材料', '角色基础材料', '角色突破材料', '天赋材料', '武器突破材料', '其他材料']) {
    const items = buckets.get(title);
    if (!items?.length) continue;
    const section = createResultSection(title + ' · 米游社');
    for (const material of items) {
      section.rows.append(createResultRow(material.name, material.lack, 'base', itemIconUrl(material.id)));
    }
    container.append(section.section);
  }
  if (officialCalculation.demand) appendHybridResults(container, officialCalculation);
}

function renderResults() {
  if (getCalculationMode() === 'official') {
    renderOfficialResults();
    return;
  }
  const result = currentMultiCalculation();
  const container = document.getElementById('resultContent');
  container.replaceChildren();

  if (!result.hasAnyTarget && !result.unavailable.length && !result.incomplete.length) {
    container.append(createEmptyResult('尚未设置升级目标','选择角色或武器，并为培养项设置当前等级与目标等级。'));
    return;
  }
  if (!result.hasAnyDeficit && !result.unavailable.length && !result.incomplete.length) {
    container.append(createEmptyResult('库存已经满足当前目标','背包数量已覆盖所有培养项的材料需求。'));
    return;
  }
  const singleSections = new Map();
  for (const group of result.groups) {
    if (!group.hasDeficit) continue;
    if (group.family) {
      const suffix = group.totalBase > 0 ? '（折合 ' + group.totalBase.toLocaleString()
        + ' 个最低阶材料）' : '';
      const section = createResultSection(group.title + suffix);
      for (const row of group.rows) {
        if (!row.lack) continue;
        section.rows.append(createResultRow(row.name,row.lack,'base',itemIconUrl(row.id)));
      }
      container.append(section.section);
    } else {
      let section = singleSections.get(group.title);
      if (!section) {
        section = createResultSection(group.title);
        singleSections.set(group.title,section);
      }
      for (const row of group.rows) {
        if (row.lack) section.rows.append(createResultRow(row.name,row.lack,'base',itemIconUrl(row.id)));
      }
    }
  }
  for (const section of singleSections.values()) container.append(section.section);
  if (result.incomplete.length || result.unavailable.length) {
    const section=createResultSection('材料数据待补充');
    for (const missing of result.incomplete) {
      const row=createResultRow(missing.title,missing.count,'base');
      section.rows.append(row);
    }
    for (const name of result.unavailable) {
      const note=document.createElement('p');
      note.className='source-warning';
      note.textContent=name + ' 的材料数据尚未载入，请重新同步后计算。';
      section.rows.append(note);
    }
    container.append(section.section);
  }
}


function createEmptyResult(title, description) {
  const empty = document.createElement('div');
  empty.className = 'empty-result';
  const mark = document.createElement('div');
  mark.className = 'empty-mark';
  mark.textContent = '✓';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = description;
  empty.append(mark, heading, paragraph);
  return empty;
}

function refreshAll() {
  renderPlanItems();
  renderSelectors();
  renderInventory();
  renderResults();
}

function bindStaticEvents() {
  document.getElementById('clearButton').addEventListener('click', openClearDialog);
  document.getElementById('addPlanButton').addEventListener('click',addPlan);
  document.getElementById('removePlanButton').addEventListener('click',removePlan);
  for (const button of document.querySelectorAll('[data-calc-mode]')) {
    button.addEventListener('click', () => chooseCalculationMode(button.dataset.calcMode));
  }
  document.getElementById('cancelClearButton').addEventListener('click', closeClearDialog);
  document.getElementById('confirmClearButton').addEventListener('click', async () => {
    const uid = state.inventoryUid;
    state = cloneDefaultState();
    state.inventoryUid = uid;
    planProfiles.clear();
    profileLoadSerial++;
    officialCalculation = null;
    refreshCalculationMode();
    characterProfile = null;
    weaponProfile = null;
    refreshAll();
    renderSourceControls();
    closeClearDialog();
    await persistState();
    showToast('全部数据已清空。', 'success');
  });

  const dialogBackdrop = document.getElementById('confirmDialog');
  dialogBackdrop.addEventListener('click', (event) => {
    if (event.target === dialogBackdrop) closeClearDialog();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dialogBackdrop.hidden) closeClearDialog();
  });

  document.getElementById('exportButton').addEventListener('click', exportConfiguration);
  document.getElementById('importButton').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', importConfiguration);
}

function openClearDialog() {
  const dialog = document.getElementById('confirmDialog');
  dialogPreviouslyFocused = document.activeElement;
  dialog.hidden = false;
  document.getElementById('cancelClearButton').focus();
}

function closeClearDialog() {
  document.getElementById('confirmDialog').hidden = true;
  if (dialogPreviouslyFocused instanceof HTMLElement) dialogPreviouslyFocused.focus();
}

function exportConfiguration() {
  const payload = {
    type: EXPORT_TYPE,
    version: 2,
    exportedAt: new Date().toISOString(),
    data: state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `全能养成规划配置-${formatTimestamp(new Date())}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast('配置已导出。', 'success');
}

async function importConfiguration(event) {
  const input = event.target;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (file.size > 1024 * 1024) {
    showToast('配置文件超过 1 MB，已取消导入。', 'error');
    return;
  }

  try {
    const parsed = JSON.parse(await file.text());
    const candidate = (parsed?.type === EXPORT_TYPE || parsed?.type === OLD_EXPORT_TYPE) ? parsed.data : parsed;
    if (!candidate || typeof candidate !== 'object' || !candidate.config || !candidate.inv) {
      throw new Error('invalid structure');
    }
    state = normalizeState(candidate);
    state.calculationMode = 'manual';
    planProfiles.clear();
    profileLoadSerial++;
    officialCalculation = null;
    refreshCalculationMode();
    refreshAll();
    renderSourceControls();
    await persistState();
    await reloadSelectedProfiles();
    showToast('配置已导入并重新计算。', 'success');
  } catch (error) {
    console.error(error);
    showToast('文件内容无法识别，原有数据未改动。', 'error');
  }
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast toast-${type} toast-visible`;
  toastTimer = setTimeout(() => {
    toast.className = 'toast';
  }, 2600);
}

function setSourceStatus(message, tone = '') {
  const element = document.getElementById('sourceStatus');
  element.textContent = message;
  element.dataset.tone = tone;
}

function setSourceMeta(message) {
  const element = document.getElementById('sourceMeta');
  element.textContent = message;
}

async function testImageSources() {
  const element = document.getElementById('imageSourceStatus');
  if (!element) return;

  // 成功时保持整行隐藏，避免占用界面空间。
  element.hidden = true;
  element.textContent = '';
  element.dataset.tone = 'error';

  if (!globalThis.chrome?.runtime?.sendMessage) {
    element.textContent = '图片来源检测失败：扩展后台不可用';
    element.hidden = false;
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'image-source:test-all' });
    const sources = response?.sources || {};
    const failures = [sources.nanoka, sources.lunaris]
      .filter((source) => source && !source.ok)
      .map((source) => `${source.name || '未知来源'}：${source.error || '未知错误'}`);

    if (!response?.ok && failures.length === 0) {
      failures.push(response?.error || '后台检测未返回有效结果');
    }

    if (failures.length > 0) {
      element.textContent = `图片来源读取失败 · ${failures.join('；')}`;
      element.hidden = false;
    }
  } catch (error) {
    element.textContent = `图片来源读取失败 · ${String(error?.message || error)}`;
    element.hidden = false;
  }
}

function getSelectedCharacterEntry() {
  return characterList.find((row) => row.id === state.source.selectedCharacterId) || null;
}

function getSelectedWeaponEntry() {
  return weaponList.find((row) => row.id === state.source.selectedWeaponId) || null;
}

function filteredCharacters() {
  const search = uiFilters.characterSearch.trim().toLowerCase();
  return characterList.filter((row) => {
    if (search && !row.name.toLowerCase().includes(search)) return false;
    if (uiFilters.characterElement && row.element !== uiFilters.characterElement) return false;
    if (uiFilters.characterRarity && String(row.rarity) !== uiFilters.characterRarity) return false;
    return true;
  });
}

function filteredWeapons() {
  const search = uiFilters.weaponSearch.trim().toLowerCase();
  return weaponList.filter((row) => {
    if (search && !row.name.toLowerCase().includes(search)) return false;
    if (uiFilters.weaponType && row.weaponType !== uiFilters.weaponType) return false;
    if (uiFilters.weaponRarity && String(row.rarity) !== uiFilters.weaponRarity) return false;
    return true;
  });
}

function fillFilterOptions(selectId, values, formatter, placeholder) {
  const select = document.getElementById(selectId);
  const previous = select.value;
  select.replaceChildren(new Option(placeholder, ''));
  values.forEach((value) => select.append(new Option(formatter(value), value)));
  select.value = [...select.options].some((option) => option.value === previous) ? previous : '';
  if (selectId === 'characterElementFilter') uiFilters.characterElement = select.value;
  if (selectId === 'characterRarityFilter') uiFilters.characterRarity = select.value;
  if (selectId === 'weaponTypeFilter') uiFilters.weaponType = select.value;
  if (selectId === 'weaponRarityFilter') uiFilters.weaponRarity = select.value;
}

function renderProfileCard(containerId, warningId, profile, fallbackTitle, metaText) {
  const card = document.getElementById(containerId);
  const warning = document.getElementById(warningId);
  if (!profile) {
    card.hidden = true;
    warning.hidden = true;
    return;
  }
  card.hidden = false;
  card.replaceChildren();
  if (profile.icon) {
    const image = document.createElement('img');
    image.alt = profile.name;
    applyImageSource(image, profile.icon);
    card.append(image);
  }
  const copy = document.createElement('div');
  copy.className = 'profile-copy';
  const title = document.createElement('strong');
  title.textContent = profile.name || fallbackTitle;
  const meta = document.createElement('span');
  meta.textContent = metaText;
  copy.append(title, meta);
  card.append(copy);

  const warnings = profile.warnings || [];
  warning.hidden = warnings.length === 0;
  warning.textContent = warnings.length ? `部分字段采用通用名称：${warnings.join('、')}` : '';
}

function renderSourceControls() {
  fillFilterOptions(
    'characterElementFilter',
    [...new Set(characterList.map((row) => row.element).filter(Boolean))],
    formatElement,
    '全部属性'
  );
  fillFilterOptions(
    'characterRarityFilter',
    ['5', '4'],
    (value) => `${value}★`,
    '全部星级'
  );
  fillFilterOptions(
    'weaponTypeFilter',
    [...new Set(weaponList.map((row) => row.weaponType).filter(Boolean))],
    formatWeaponType,
    '全部类型'
  );
  fillFilterOptions(
    'weaponRarityFilter',
    ['5', '4', '3', '2', '1'],
    (value) => `${value}★`,
    '全部星级'
  );

  document.getElementById('characterSearch').value = uiFilters.characterSearch;
  document.getElementById('weaponSearch').value = uiFilters.weaponSearch;

  const characterSelect = document.getElementById('characterSelect');
  const weaponSelect = document.getElementById('weaponSelect');
  characterSelect.replaceChildren(new Option('不添加角色', ''));
  weaponSelect.replaceChildren(new Option('不添加武器', ''));

  filteredCharacters().forEach((row) => {
    const meta = [formatElement(row.element), rarityText(row.rarity), row.sourceTag].filter(Boolean).join(' · ');
    characterSelect.append(new Option(`${row.name}${meta ? ` · ${meta}` : ''}`, row.id));
  });
  filteredWeapons().forEach((row) => {
    const meta = [formatWeaponType(row.weaponType), rarityText(row.rarity), row.sourceTag].filter(Boolean).join(' · ');
    weaponSelect.append(new Option(`${row.name}${meta ? ` · ${meta}` : ''}`, row.id));
  });

  characterSelect.value = [...characterSelect.options].some((option) => option.value === state.source.selectedCharacterId)
    ? state.source.selectedCharacterId
    : '';
  weaponSelect.value = [...weaponSelect.options].some((option) => option.value === state.source.selectedWeaponId)
    ? state.source.selectedWeaponId
    : '';

  const charMeta = characterProfile
    ? [formatElement(characterProfile.element), rarityText(characterProfile.rarity), characterProfile.sourceTag, characterProfile.version].filter(Boolean).join(' · ')
    : '当前为手动模式';
  const weaponMeta = weaponProfile
    ? [formatWeaponType(weaponProfile.weaponType), rarityText(weaponProfile.rarity), weaponProfile.sourceTag, weaponProfile.version].filter(Boolean).join(' · ')
    : '当前为手动模式';
  renderProfileCard('characterCard', 'characterWarning', characterProfile, '角色', charMeta);
  renderProfileCard('weaponCard', 'weaponWarning', weaponProfile, '武器', weaponMeta);

  const mergeRules = getMergeRules();
  const mergeNotes = [];
  if (mergeRules.matAIntoCult) mergeNotes.push('武器素材 A 已自动并入角色培养素材');
  if (mergeRules.matBIntoCult) mergeNotes.push('武器素材 B 已自动并入角色培养素材');
  if (!mergeNotes.length) mergeNotes.push('当前未检测到角色与武器的共用材料');
  setSourceMeta(`数据源：Nanoka · 图片备用：Lunaris · 正式服 ${syncInfo.live || '—'} · 前瞻 ${syncInfo.latest || '—'} · ${mergeNotes.join('；')}`);
}

async function syncAllLists({ force = false } = {}) {
  setSourceStatus('正在同步角色与武器列表…');
  document.getElementById('syncButton').disabled = true;
  try {
    const manifestResponse = await requestHakushin('/manifest.json', { force, maxAge: 6 * 60 * 60 * 1000 });
    const versions = readManifestVersions(manifestResponse.data);
    syncInfo.live = versions.live;
    syncInfo.latest = versions.latest;

    const [charLive, charLatest, weaponLive, weaponLatest] = await Promise.all([
      requestHakushin(`/gi/${encodeURIComponent(versions.live)}/character.json`, { force, maxAge: 12 * 60 * 60 * 1000 }),
      requestHakushin(`/gi/${encodeURIComponent(versions.latest)}/character.json`, { force, maxAge: 12 * 60 * 60 * 1000 }),
      requestHakushin(`/gi/${encodeURIComponent(versions.live)}/weapon.json`, { force, maxAge: 12 * 60 * 60 * 1000 }),
      requestHakushin(`/gi/${encodeURIComponent(versions.latest)}/weapon.json`, { force, maxAge: 12 * 60 * 60 * 1000 })
    ]);

    const charLiveList = normalizeCharacterList(charLive.data).map((row) => ({ ...row, version: versions.live }));
    const charLatestList = normalizeCharacterList(charLatest.data).map((row) => ({ ...row, version: versions.latest }));
    const weaponLiveList = normalizeWeaponList(weaponLive.data).map((row) => ({ ...row, version: versions.live }));
    const weaponLatestList = normalizeWeaponList(weaponLatest.data).map((row) => ({ ...row, version: versions.latest }));

    characterList = mergeSourceLists(charLiveList, charLatestList);
    weaponList = mergeSourceLists(weaponLiveList, weaponLatestList);
    syncInfo.listSource = [charLive.source, charLatest.source, weaponLive.source, weaponLatest.source].join(',');
    state.source.lastSyncedAt = Date.now();
    setSourceStatus(`已载入 ${characterList.length} 名角色、${weaponList.length} 件武器`, syncInfo.listSource.includes('cache') ? 'cache' : 'ok');
    renderSourceControls();
    await persistState();
    await reloadSelectedProfiles({ force });
  } catch (error) {
    console.error(error);
    characterList = [];
    weaponList = [];
    characterProfile = null;
    weaponProfile = null;
    planProfiles.clear();
    profileLoadSerial++;
    updateMergeRules();
    setSourceStatus(`同步失败，已启用手动模式：${error.message}`, 'error');
    renderSourceControls();
    renderInventory();
    renderResults();
  } finally {
    document.getElementById('syncButton').disabled = false;
  }
}

function updateMergeRules() {
  state.source.mergeRules = detectMergeRules(characterProfile, weaponProfile);
}

async function fetchPlanProfiles(plan,{force=false}={}) {
  const charId=String(plan.source.selectedCharacterId || '');
  const weaponId=String(plan.source.selectedWeaponId || '');
  const selectedChar=characterList.find(row=>row.id===charId);
  const selectedWeapon=weaponList.find(row=>row.id===weaponId);
  const getCharacter=async()=>{
    if(!charId)return null;
    if(!selectedChar)throw new Error('角色 '+(plan.source.selectedCharacterName||charId)+' 未进入当前数据列表');
    const response=await requestHakushin(
      '/gi/'+encodeURIComponent(selectedChar.version)+'/zh/character/'+encodeURIComponent(charId)+'.json',
      {force,maxAge:24*60*60*1000}
    );
    return parseCharacterDetail(response.data,selectedChar);
  };
  const getWeapon=async()=>{
    if(!weaponId)return null;
    if(!selectedWeapon)throw new Error('武器 '+(plan.source.selectedWeaponName||weaponId)+' 未进入当前数据列表');
    const response=await requestHakushin(
      '/gi/'+encodeURIComponent(selectedWeapon.version)+'/zh/weapon/'+encodeURIComponent(weaponId)+'.json',
      {force,maxAge:24*60*60*1000}
    );
    return parseWeaponDetail(response.data,selectedWeapon);
  };
  const results=await Promise.allSettled([getCharacter(),getWeapon()]);
  const problems=results.filter(result=>result.status==='rejected')
    .map(result=>String(result.reason?.message || result.reason));
  return {
    characterProfile:results[0].status==='fulfilled' ? results[0].value : null,
    weaponProfile:results[1].status==='fulfilled' ? results[1].value : null,
    errors:problems
  };
}

async function reloadSelectedProfiles({force=false}={}) {
  commitActivePlan();
  const token=++profileLoadSerial;
  setSourceStatus('正在读取培养项资料…');
  const items=await Promise.all(state.plans.map(plan=>fetchPlanProfiles(plan,{force})));
  if(token!==profileLoadSerial)return;
  planProfiles=new Map();
  const problems=[];
  for(let i=0;i<state.plans.length;i++){
    const plan=state.plans[i], profiles=items[i];
    planProfiles.set(plan.id,profiles);
    if(profiles.characterProfile){
      plan.source.selectedCharacterName=profiles.characterProfile.name;
      plan.source.selectedCharacterVersion=profiles.characterProfile.version;
      plan.source.selectedCharacterTag=profiles.characterProfile.sourceTag;
    }
    if(profiles.weaponProfile){
      plan.source.selectedWeaponName=profiles.weaponProfile.name;
      plan.source.selectedWeaponVersion=profiles.weaponProfile.version;
      plan.source.selectedWeaponTag=profiles.weaponProfile.sourceTag;
    }
    for(const problem of profiles.errors) problems.push('培养项 '+(i+1)+'：'+problem);
  }
  const active=activePlan();
  state.source=structuredClone(active.source);
  state.config=structuredClone(active.config);
  const profiles=planProfiles.get(active.id) || {};
  characterProfile=profiles.characterProfile || null;
  weaponProfile=profiles.weaponProfile || null;
  updateMergeRules();
  commitActivePlan();

  if(!state.materialInventoryMigrated){
    const original=state.plans[0];
    const originalProfiles=planProfiles.get(original.id)||{};
    const hasInput=Object.values(state.inv).some(value=>Array.isArray(value)
      ? value.some(row=>String(row).trim())
      : String(value).trim());
    const canMigrate=(!original.source.selectedCharacterId || originalProfiles.characterProfile)
      && (!original.source.selectedWeaponId || originalProfiles.weaponProfile);
    if(canMigrate){
      const legacy=migrateLegacyInventory(state.inv,originalProfiles.characterProfile,
        originalProfiles.weaponProfile,original.source.mergeRules);
      state.materialInventory={...legacy,...state.materialInventory};
      state.materialInventoryMigrated=true;
    } else if(!hasInput) {
      state.materialInventoryMigrated=true;
    }
  }

  renderSourceControls();
  refreshAll();
  await persistState();
  setSourceStatus(problems.length
    ? '部分培养项资料读取失败：'+problems.join('；')
    : '已载入 '+state.plans.length+' 个培养项',
    problems.length ? 'error' : 'ok');
}



function bindSourceEvents() {
  document.getElementById('syncButton').addEventListener('click', () => {
    void testImageSources();
    void syncAllLists({ force: true });
  });

  document.getElementById('characterSearch').addEventListener('input', (event) => {
    uiFilters.characterSearch = event.target.value;
    renderSourceControls();
  });
  document.getElementById('weaponSearch').addEventListener('input', (event) => {
    uiFilters.weaponSearch = event.target.value;
    renderSourceControls();
  });
  document.getElementById('characterElementFilter').addEventListener('change', (event) => {
    uiFilters.characterElement = event.target.value;
    renderSourceControls();
  });
  document.getElementById('characterRarityFilter').addEventListener('change', (event) => {
    uiFilters.characterRarity = event.target.value;
    renderSourceControls();
  });
  document.getElementById('weaponTypeFilter').addEventListener('change', (event) => {
    uiFilters.weaponType = event.target.value;
    renderSourceControls();
  });
  document.getElementById('weaponRarityFilter').addEventListener('change', (event) => {
    uiFilters.weaponRarity = event.target.value;
    renderSourceControls();
  });

  document.getElementById('characterSelect').addEventListener('change', async (event) => {
    state.source.selectedCharacterId = event.target.value;
    state.source.selectedCharacterName = '';
    state.source.selectedCharacterVersion = '';
    state.source.selectedCharacterTag = '';
    commitActivePlan();
    await reloadSelectedProfiles();
  });
  document.getElementById('weaponSelect').addEventListener('change', async (event) => {
    state.source.selectedWeaponId = event.target.value;
    state.source.selectedWeaponName = '';
    state.source.selectedWeaponVersion = '';
    state.source.selectedWeaponTag = '';
    commitActivePlan();
    await reloadSelectedProfiles();
  });
}

async function initialize() {
  bindStaticEvents();
  bindSourceEvents();
  try {
    const stored = await storage.get();
    state = normalizeState(stored);
    state.calculationMode = 'manual';
    setSaveStatus(stored ? '已恢复上次数据' : '首次使用，数据会自动保存');
  } catch (error) {
    console.error(error);
    state = cloneDefaultState();
    setSaveStatus('读取失败，已使用初始数据');
  }
  refreshCalculationMode();
  refreshAll();
  renderSourceControls();
  void testImageSources();
  await syncAllLists();
}

void initialize();
