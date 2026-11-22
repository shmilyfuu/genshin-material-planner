import {
  CHAR_LEVEL_LABELS,
  calculateResult,
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
import { calculatorAutofill } from './miyoushe-inventory-map.mjs';

const STORAGE_KEY = 'materialPlannerHakushinBetaState';
const EXPORT_TYPE = 'material-planner-hakushin-beta-config';
const OLD_EXPORT_TYPE = 'material-planner-sidepanel-config';
const TIER_COLOR_MAP = {
  白色: 'white',
  绿色: 'green',
  蓝色: 'blue',
  紫色: 'purple',
  金色: 'gold',
  白: 'white',
  绿: 'green',
  蓝: 'blue',
  紫: 'purple',
  金: 'gold'
};
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

const inventoryDefinitions = {
  basicInventory: [
    { key: 'gold', label: '金币', color: 'base' },
    { key: 'spec', label: '区域特产', color: 'base' },
    { key: 'boss', label: 'Boss 素材', color: 'base' },
    { key: 'weekly', label: '周本材料', color: 'base' },
    { key: 'crown', label: '皇冠', color: 'gold' }
  ],
  cultInventory: [
    { key: 'cult', index: 0, label: '白色培养素材', color: 'white' },
    { key: 'cult', index: 1, label: '绿色培养素材', color: 'green' },
    { key: 'cult', index: 2, label: '蓝色培养素材', color: 'blue' },
    { key: 'cult', index: 3, label: '紫色培养素材', color: 'purple', condition: (state) => Boolean(state.source?.mergeRules?.matAIntoCult) }
  ],
  talentInventory: [
    { key: 'books', index: 0, label: '绿天赋书', color: 'green' },
    { key: 'books', index: 1, label: '蓝天赋书', color: 'blue' },
    { key: 'books', index: 2, label: '紫天赋书', color: 'purple' },
    { key: 'charGems', index: 0, label: '绿角色石头', color: 'green' },
    { key: 'charGems', index: 1, label: '蓝角色石头', color: 'blue' },
    { key: 'charGems', index: 2, label: '紫角色石头', color: 'purple' },
    { key: 'charGems', index: 3, label: '金角色石头', color: 'gold' }
  ],
  weaponInventory: [
    { key: 'weapGems', index: 0, label: '绿武器材料', color: 'green' },
    { key: 'weapGems', index: 1, label: '蓝武器材料', color: 'blue' },
    { key: 'weapGems', index: 2, label: '紫武器材料', color: 'purple' },
    { key: 'weapGems', index: 3, label: '金武器材料', color: 'gold' }
  ]
};

let state = cloneDefaultState();
let saveTimer = null;
let toastTimer = null;
let dialogPreviouslyFocused = null;
let characterList = [];
let weaponList = [];
let characterProfile = null;
let weaponProfile = null;
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

function inventoryMaterial(definition) {
  if (definition.key === 'gold') return { id: 202, name: '摩拉' };
  if (definition.key === 'cult' && definition.index === 3) return getCultMaterial(3);
  if (['spec', 'boss', 'weekly', 'crown'].includes(definition.key)) return materialAt(definition.key);
  return materialAt(definition.key, definition.index);
}

function inventoryItemKey(definition) {
  const id = Number(inventoryMaterial(definition)?.id);
  if (Number.isSafeInteger(id) && id > 0) return String(id);
  return 'slot:' + definition.key + ':' + (definition.index ?? '');
}

function currentAccountInventory() {
  return state.accountInventories?.[state.inventoryUid] || null;
}

function getInventoryValue(definition) {
  if (!state.inventoryUid) {
    const value = state.inv[definition.key];
    return definition.index === undefined ? value : value[definition.index];
  }
  const entry = currentAccountInventory();
  const key = inventoryItemKey(definition);
  if (entry && Object.hasOwn(entry.manual, key)) return entry.manual[key];
  const id = Number(inventoryMaterial(definition)?.id);
  const material = entry?.materials?.[id];
  return calculatorAutofill(material, definition.key, definition.index ?? null) ?? '';
}

function setInventoryValue(definition, value) {
  if (!state.inventoryUid) {
    if (definition.index === undefined) state.inv[definition.key] = value;
    else state.inv[definition.key][definition.index] = value;
    return;
  }
  const entry = state.accountInventories[state.inventoryUid] ||= {manual: {}, materials: {}, updatedAt: 0};
  const key = inventoryItemKey(definition);
  if (value === '') delete entry.manual[key];
  else entry.manual[key] = value;
}

export function chooseInventoryUid(value) {
  const uid = /^\d{6,12}$/.test(String(value || '')) ? String(value) : '';
  if (uid === state.inventoryUid) return;
  state.inventoryUid = uid;
  renderInventory();
  renderResults();
  scheduleSave();
}

export async function syncAccountMaterials(uid, materials) {
  if (!uid || uid !== state.inventoryUid) throw new Error('当前 UID 已切换，请重新选择账号。');
  if (!Array.isArray(materials) || !materials.length) throw new Error('材料列表为空。');
  const values = {};
  for (const item of materials) {
    const id = Number(item?.id);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const valid = (number) => Number.isSafeInteger(number) && number >= 0;
    const number = (value) => valid(value) ? value : null;
    values[id] = {
      calculatorAvailable: number(item.calculatorAvailable),
      coveredDemand: number(item.coveredDemand),
      total: number(item.total),
      lack: number(item.lack)
    };
  }
  if (!Object.keys(values).length) throw new Error('材料 ID 列表为空。');
  const old = state.accountInventories[uid] || {manual: {}, materials: {}, updatedAt: 0};
  state.accountInventories[uid] = {manual: {...old.manual}, materials: values, updatedAt: Date.now()};
  renderInventory();
  renderResults();
  await persistState();
  let applied = 0;
  for (const definition of allInventoryDefinitions()) {
    if (getInventoryValue(definition) !== '' &&
      calculatorAutofill(values[Number(inventoryMaterial(definition)?.id)], definition.key, definition.index ?? null) !== null) applied++;
  }
  return {received: Object.keys(values).length, applied};
}

function allInventoryDefinitions() {
  return [
    ...['gold', 'spec', 'boss', 'weekly', 'crown'].map((key) => ({key})),
    ...Object.entries({books: 3, cult: 4, charGems: 4, weapGems: 4, matA: 3, matB: 3})
      .flatMap(([key, count]) => Array.from({length: count}, (_, index) => ({key, index})))
  ];
}

function calculationState() {
  if (!state.inventoryUid) return state;
  const inv = structuredClone(cloneDefaultState().inv);
  for (const definition of allInventoryDefinitions()) {
    const value = getInventoryValue(definition);
    if (definition.index === undefined) inv[definition.key] = value;
    else inv[definition.key][definition.index] = value;
  }
  return {...state, inv};
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
  renderSelectors();
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

function resolveDefinition(definition) {
  const material = inventoryMaterial(definition);
  return {
    ...definition,
    displayLabel: material?.name || definition.label,
    icon: definition.key === 'gold' ? itemIconUrl(202) : material?.icon || ''
  };
}

function createInventoryInput(definition) {
  const resolved = resolveDefinition(definition);
  const wrapper = document.createElement('label');
  wrapper.className = `item-input color-${definition.color}`;

  const iconSlot = document.createElement('span');
  iconSlot.className = `material-icon-slot inventory-icon-slot slot-${definition.color}`;
  if (resolved.icon || resolved.displayLabel) {
    const icon = document.createElement('img');
    icon.className = 'material-icon';
    icon.alt = '';
    iconSlot.append(icon);
    applyImageSource(icon, resolved.icon, iconSlot, resolved.displayLabel);
  } else {
    iconSlot.classList.add('icon-fallback');
  }

  const labelText = document.createElement('span');
  labelText.className = 'item-label';
  labelText.textContent = resolved.displayLabel;

  const inputWrap = document.createElement('span');
  inputWrap.className = 'input-wrap';
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = '0';
  input.value = getInventoryValue(definition);
  input.setAttribute('aria-label', resolved.displayLabel);

  const preview = document.createElement('span');
  preview.className = 'formula-preview';

  const updatePreview = () => {
    const rawValue = input.value;
    const evaluated = safeEval(rawValue);
    const hasOperator = /[+\-*/×÷()（）]/.test(rawValue);
    preview.textContent = hasOperator && rawValue.trim() ? `= ${evaluated.toLocaleString()}` : '';
    input.classList.toggle('has-preview', Boolean(preview.textContent));
  };

  input.addEventListener('input', () => {
    setInventoryValue(definition, input.value);
    updatePreview();
    renderResults();
    scheduleSave();
  });
  updatePreview();
  inputWrap.append(input, preview);
  wrapper.append(iconSlot, labelText, inputWrap);
  const id = Number(inventoryMaterial(definition)?.id);
  const official = currentAccountInventory()?.materials?.[id];
  if (state.inventoryUid && official) {
    const available = official.calculatorAvailable;
    const covered = official.coveredDemand;
    const recommended = calculatorAutofill(official, definition.key, definition.index ?? null);
    const hint = document.createElement('small');
    hint.className = 'mys-inventory-hint';
    hint.textContent = '米游社：可用 ' + (available === null ? '—' : available)
      + ' · 抵扣 ' + (covered === null ? '—' : covered)
      + (recommended === null ? ' · 请核对' : ' · 计算参考 ' + recommended);
    wrapper.append(hint);
  }
  return wrapper;
}

function createIndependentGroup(title, definitions) {
  const group = document.createElement('section');
  group.className = 'independent-group';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const grid = document.createElement('div');
  grid.className = 'input-grid';
  definitions.forEach((definition) => grid.append(createInventoryInput(definition)));
  group.append(heading, grid);
  return group;
}

function renderInventory() {
  Object.entries(inventoryDefinitions).forEach(([containerId, definitions]) => {
    const container = document.getElementById(containerId);
    container.replaceChildren();
    definitions
      .filter((definition) => !definition.condition || definition.condition(state))
      .forEach((definition) => container.append(createInventoryInput(definition)));
  });

  const independent = document.getElementById('independentWeaponMaterials');
  independent.replaceChildren();
  const rules = getMergeRules();

  if (!rules.matAIntoCult) {
    independent.append(createIndependentGroup('武器素材 A', [
      { key: 'matA', index: 0, label: '绿武器 MatA', color: 'green' },
      { key: 'matA', index: 1, label: '蓝武器 MatA', color: 'blue' },
      { key: 'matA', index: 2, label: '紫武器 MatA', color: 'purple' }
    ]));
  }

  if (!rules.matBIntoCult) {
    independent.append(createIndependentGroup('武器素材 B', [
      { key: 'matB', index: 0, label: '白武器 MatB', color: 'white' },
      { key: 'matB', index: 1, label: '绿武器 MatB', color: 'green' },
      { key: 'matB', index: 2, label: '蓝武器 MatB', color: 'blue' }
    ]));
  }
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

function appendTieredSection(container, group, title, items, baseLabel) {
  if (!group.hasDeficit) return;
  const { section, rows } = createResultSection(`${title}（折合 ${group.totalBase.toLocaleString()} ${baseLabel}）`);
  group.optimal.forEach((count, index) => {
    if (count <= 0) return;
    const item = items[index] || {};
    const label = item.name || `第 ${index + 1} 阶`;
    const color = item.color || TIER_COLOR_MAP[label] || 'base';
    rows.append(createResultRow(label, count, color, item.icon || ''));
  });
  container.append(section);
}

function flatItem(label, icon = '', color = 'base') {
  return { name: label, icon, color };
}

function buildTierItem(material, fallbackLabel, fallbackColor) {
  return {
    name: material?.name || fallbackLabel,
    icon: material?.icon || '',
    color: fallbackColor
  };
}

function renderResults() {
  const result = calculateResult(calculationState());
  const container = document.getElementById('resultContent');
  container.replaceChildren();

  if (!result.hasAnyTarget) {
    container.append(createEmptyResult('尚未设置升级目标', '先在上方设置等级，再填写背包数量。'));
    return;
  }

  if (!result.hasAnyDeficit) {
    container.append(createEmptyResult('库存已经满足当前目标', '背包数量已覆盖全部所需材料。'));
    return;
  }

  const flatLabels = {
    gold: flatItem('金币', itemIconUrl(202), 'base'),
    spec: flatItem(materialAt('spec')?.name || '区域特产', materialAt('spec')?.icon || '', 'base'),
    boss: flatItem(materialAt('boss')?.name || 'Boss 素材', materialAt('boss')?.icon || '', 'base'),
    weekly: flatItem(materialAt('weekly')?.name || '周本材料', materialAt('weekly')?.icon || '', 'base'),
    crown: flatItem(materialAt('crown')?.name || '皇冠', materialAt('crown')?.icon || '', 'gold')
  };

  const activeFlat = Object.entries(result.flat).filter(([, value]) => value > 0);
  if (activeFlat.length) {
    const { section, rows } = createResultSection('基础专属缺口');
    activeFlat.forEach(([key, value]) => {
      const item = flatLabels[key];
      rows.append(createResultRow(item.name, value, item.color, item.icon));
    });
    container.append(section);
  }

  appendTieredSection(container, result.groups.cult, '全局培养素材', [
    buildTierItem(getCultMaterial(0), '白色培养素材', 'white'),
    buildTierItem(getCultMaterial(1), '绿色培养素材', 'green'),
    buildTierItem(getCultMaterial(2), '蓝色培养素材', 'blue'),
    buildTierItem(getCultMaterial(3), '紫色培养素材', 'purple')
  ], getCultMaterial(0)?.name || '白色培养素材');
  appendTieredSection(container, result.groups.books, '天赋书', [
    buildTierItem(materialAt('books', 0), '绿天赋书', 'green'),
    buildTierItem(materialAt('books', 1), '蓝天赋书', 'blue'),
    buildTierItem(materialAt('books', 2), '紫天赋书', 'purple')
  ], materialAt('books', 0)?.name || '绿天赋书');
  appendTieredSection(container, result.groups.charGems, '角色突破石', [
    buildTierItem(materialAt('charGems', 0), '绿角色石头', 'green'),
    buildTierItem(materialAt('charGems', 1), '蓝角色石头', 'blue'),
    buildTierItem(materialAt('charGems', 2), '紫角色石头', 'purple'),
    buildTierItem(materialAt('charGems', 3), '金角色石头', 'gold')
  ], materialAt('charGems', 0)?.name || '绿角色石头');
  appendTieredSection(container, result.groups.weapGems, '武器突破材料', [
    buildTierItem(materialAt('weapGems', 0), '绿武器材料', 'green'),
    buildTierItem(materialAt('weapGems', 1), '蓝武器材料', 'blue'),
    buildTierItem(materialAt('weapGems', 2), '紫武器材料', 'purple'),
    buildTierItem(materialAt('weapGems', 3), '金武器材料', 'gold')
  ], materialAt('weapGems', 0)?.name || '绿武器材料');
  appendTieredSection(container, result.groups.matA, '武器素材 A', [
    buildTierItem(materialAt('matA', 0), '绿武器 MatA', 'green'),
    buildTierItem(materialAt('matA', 1), '蓝武器 MatA', 'blue'),
    buildTierItem(materialAt('matA', 2), '紫武器 MatA', 'purple')
  ], materialAt('matA', 0)?.name || '绿武器 MatA');
  appendTieredSection(container, result.groups.matB, '武器素材 B', [
    buildTierItem(materialAt('matB', 0), '白武器 MatB', 'white'),
    buildTierItem(materialAt('matB', 1), '绿武器 MatB', 'green'),
    buildTierItem(materialAt('matB', 2), '蓝武器 MatB', 'blue')
  ], materialAt('matB', 0)?.name || '白武器 MatB');
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
  renderSelectors();
  renderInventory();
  renderResults();
}

function bindStaticEvents() {
  document.getElementById('clearButton').addEventListener('click', openClearDialog);
  document.getElementById('cancelClearButton').addEventListener('click', closeClearDialog);
  document.getElementById('confirmClearButton').addEventListener('click', async () => {
    const uid = state.inventoryUid;
    state = cloneDefaultState();
    state.inventoryUid = uid;
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
  characterSelect.replaceChildren(new Option('手动模式', ''));
  weaponSelect.replaceChildren(new Option('手动模式', ''));

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

async function loadCharacterProfile({ force = false } = {}) {
  const selected = getSelectedCharacterEntry();
  if (!selected) {
    state.source.selectedCharacterId = '';
    state.source.selectedCharacterName = '';
    state.source.selectedCharacterVersion = '';
    state.source.selectedCharacterTag = '';
    characterProfile = null;
    return;
  }
  const response = await requestHakushin(`/gi/${encodeURIComponent(selected.version)}/zh/character/${encodeURIComponent(selected.id)}.json`, { force, maxAge: 24 * 60 * 60 * 1000 });
  characterProfile = parseCharacterDetail(response.data, selected);
  state.source.selectedCharacterName = characterProfile.name;
  state.source.selectedCharacterVersion = selected.version;
  state.source.selectedCharacterTag = selected.sourceTag;
}

async function loadWeaponProfile({ force = false } = {}) {
  const selected = getSelectedWeaponEntry();
  if (!selected) {
    state.source.selectedWeaponId = '';
    state.source.selectedWeaponName = '';
    state.source.selectedWeaponVersion = '';
    state.source.selectedWeaponTag = '';
    weaponProfile = null;
    return;
  }
  const response = await requestHakushin(`/gi/${encodeURIComponent(selected.version)}/zh/weapon/${encodeURIComponent(selected.id)}.json`, { force, maxAge: 24 * 60 * 60 * 1000 });
  weaponProfile = parseWeaponDetail(response.data, selected);
  state.source.selectedWeaponName = weaponProfile.name;
  state.source.selectedWeaponVersion = selected.version;
  state.source.selectedWeaponTag = selected.sourceTag;
}

async function reloadSelectedProfiles({ force = false } = {}) {
  try {
    const tasks = [];
    if (state.source.selectedCharacterId) tasks.push(loadCharacterProfile({ force }));
    else characterProfile = null;
    if (state.source.selectedWeaponId) tasks.push(loadWeaponProfile({ force }));
    else weaponProfile = null;
    if (tasks.length) {
      setSourceStatus('正在读取已选对象详情…');
      await Promise.all(tasks);
    }
    updateMergeRules();
    renderSourceControls();
    renderInventory();
    renderResults();
    await persistState();
    if (!tasks.length) {
      setSourceStatus('当前为手动模式，可直接使用现有计算逻辑。', 'ok');
    } else {
      setSourceStatus('角色与武器数据已载入', 'ok');
    }
  } catch (error) {
    console.error(error);
    if (String(error.message || '').includes('武器')) weaponProfile = null;
    if (String(error.message || '').includes('角色')) characterProfile = null;
    updateMergeRules();
    renderSourceControls();
    renderInventory();
    renderResults();
    setSourceStatus(`详情读取失败，已保留通用计算：${error.message}`, 'error');
  }
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
    await persistState();
    await reloadSelectedProfiles();
  });
  document.getElementById('weaponSelect').addEventListener('change', async (event) => {
    state.source.selectedWeaponId = event.target.value;
    await persistState();
    await reloadSelectedProfiles();
  });
}

async function initialize() {
  bindStaticEvents();
  bindSourceEvents();
  try {
    const stored = await storage.get();
    state = normalizeState(stored);
    setSaveStatus(stored ? '已恢复上次数据' : '首次使用，数据会自动保存');
  } catch (error) {
    console.error(error);
    state = cloneDefaultState();
    setSaveStatus('读取失败，已使用初始数据');
  }
  refreshAll();
  renderSourceControls();
  void testImageSources();
  await syncAllLists();
}

void initialize();
