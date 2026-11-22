export const TALENT_DATA = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [12500, 3, 0, 0, 6, 0, 0, 0, 0],
  [30000, 3, 2, 0, 6, 3, 0, 0, 0],
  [55000, 3, 6, 0, 6, 7, 0, 0, 0],
  [85000, 3, 12, 0, 6, 13, 0, 0, 0],
  [123000, 3, 21, 0, 6, 22, 0, 0, 0],
  [243000, 3, 21, 4, 6, 22, 4, 1, 0],
  [503000, 3, 21, 10, 6, 22, 10, 2, 0],
  [953000, 3, 21, 22, 6, 22, 19, 4, 0],
  [1653000, 3, 21, 38, 6, 22, 31, 6, 1]
];

export const CHAR_ASC_DATA = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [20000, 1, 0, 0, 0, 3, 3, 0, 0, 0],
  [60000, 1, 3, 0, 0, 13, 18, 0, 0, 2],
  [120000, 1, 9, 0, 0, 33, 18, 12, 0, 6],
  [200000, 1, 9, 3, 0, 63, 18, 30, 0, 14],
  [300000, 1, 9, 9, 0, 108, 18, 30, 12, 26],
  [420000, 1, 9, 9, 6, 168, 18, 30, 36, 46]
];

export const WEAPON_ASC_DATA = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [10000, 5, 0, 0, 0, 5, 0, 0, 3, 0, 0],
  [30000, 5, 5, 0, 0, 23, 0, 0, 15, 0, 0],
  [60000, 5, 14, 0, 0, 23, 9, 0, 15, 9, 0],
  [105000, 5, 14, 5, 0, 23, 27, 0, 15, 23, 0],
  [160000, 5, 14, 14, 0, 23, 27, 14, 15, 23, 9],
  [255000, 5, 14, 14, 6, 23, 27, 41, 15, 23, 27]
];

export const CHAR_LEVEL_LABELS = ['Lv.1', 'Lv.20', 'Lv.40', 'Lv.50', 'Lv.60', 'Lv.70', 'Lv.80'];

export const DEFAULT_STATE = Object.freeze({
  schemaVersion: 3,
  source: {
    selectedCharacterId: '',
    selectedCharacterName: '',
    selectedCharacterVersion: '',
    selectedCharacterTag: '',
    selectedWeaponId: '',
    selectedWeaponName: '',
    selectedWeaponVersion: '',
    selectedWeaponTag: '',
    lastSyncedAt: 0,
    mergeRules: {
      matAIntoCult: false,
      matBIntoCult: false
    }
  },
  config: {
    talentA: [0, 0],
    talentE: [0, 0],
    talentQ: [0, 0],
    charAsc: [0, 0],
    weapAsc: [0, 0]
  },
  inventoryUid: '',
  calculationMode: 'manual',
  inv: {
    gold: '',
    spec: '',
    boss: '',
    weekly: '',
    crown: '',
    books: ['', '', ''],
    cult: ['', '', '', ''],
    charGems: ['', '', '', ''],
    weapGems: ['', '', '', ''],
    matA: ['', '', ''],
    matB: ['', '', '']
  }
});

export function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeRange(value, max) {
  const source = Array.isArray(value) ? value : [0, 0];
  let current = clampInt(source[0], 0, max);
  let target = clampInt(source[1], 0, max);
  if (target < current) target = current;
  return [current, target];
}

function normalizeString(value) {
  if (typeof value === 'string') return value.slice(0, 120);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function normalizeStringArray(value, length) {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length }, (_, index) => normalizeString(source[index]));
}




export function normalizeState(input) {
  const fallback = cloneDefaultState();
  const source = input && typeof input === 'object' ? input : {};
  const config = source.config && typeof source.config === 'object' ? source.config : {};
  const inv = source.inv && typeof source.inv === 'object' ? source.inv : {};
  const sourceSettings = source.source && typeof source.source === 'object' ? source.source : {};
  const mergeRules = sourceSettings.mergeRules && typeof sourceSettings.mergeRules === 'object' ? sourceSettings.mergeRules : {};

  return {
    schemaVersion: 3,
    inventoryUid: /^\d{6,12}$/.test(String(source.inventoryUid || '')) ? String(source.inventoryUid) : '',
    calculationMode: source.calculationMode === 'official' ? 'official' : 'manual',
    source: {
      selectedCharacterId: normalizeString(sourceSettings.selectedCharacterId),
      selectedCharacterName: normalizeString(sourceSettings.selectedCharacterName),
      selectedCharacterVersion: normalizeString(sourceSettings.selectedCharacterVersion || sourceSettings.selectedVersion),
      selectedCharacterTag: normalizeString(sourceSettings.selectedCharacterTag),
      selectedWeaponId: normalizeString(sourceSettings.selectedWeaponId),
      selectedWeaponName: normalizeString(sourceSettings.selectedWeaponName),
      selectedWeaponVersion: normalizeString(sourceSettings.selectedWeaponVersion),
      selectedWeaponTag: normalizeString(sourceSettings.selectedWeaponTag),
      lastSyncedAt: Number.isFinite(sourceSettings.lastSyncedAt) ? Math.max(0, sourceSettings.lastSyncedAt) : 0,
      mergeRules: {
        matAIntoCult: Boolean(mergeRules.matAIntoCult),
        matBIntoCult: Boolean(mergeRules.matBIntoCult)
      }
    },
    config: {
      talentA: normalizeRange(config.talentA, 9),
      talentE: normalizeRange(config.talentE, 9),
      talentQ: normalizeRange(config.talentQ, 9),
      charAsc: normalizeRange(config.charAsc, 6),
      weapAsc: normalizeRange(config.weapAsc, 6)
    },
    inv: {
      gold: normalizeString(inv.gold),
      spec: normalizeString(inv.spec),
      boss: normalizeString(inv.boss),
      weekly: normalizeString(inv.weekly),
      crown: normalizeString(inv.crown),
      books: normalizeStringArray(inv.books, 3),
      cult: normalizeStringArray(inv.cult, 4),
      charGems: normalizeStringArray(inv.charGems, 4),
      weapGems: normalizeStringArray(inv.weapGems, 4),
      matA: normalizeStringArray(inv.matA, 3),
      matB: normalizeStringArray(inv.matB, 3)
    }
  };
}

export function safeEval(expression) {
  if (expression === null || expression === undefined) return 0;

  const source = String(expression)
    .trim()
    .replace(/[，,\s]/g, '')
    .replace(/[×xX]/g, '*')
    .replace(/÷/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')');

  if (!source || !/^[0-9+\-*/().]+$/.test(source)) return 0;

  let index = 0;

  function parseExpression() {
    let value = parseTerm();
    while (index < source.length && (source[index] === '+' || source[index] === '-')) {
      const operator = source[index++];
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    while (index < source.length && (source[index] === '*' || source[index] === '/')) {
      const operator = source[index++];
      const right = parseFactor();
      if (operator === '/' && right === 0) throw new Error('division by zero');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  }

  function parseFactor() {
    if (source[index] === '+') {
      index += 1;
      return parseFactor();
    }
    if (source[index] === '-') {
      index += 1;
      return -parseFactor();
    }
    if (source[index] === '(') {
      index += 1;
      const value = parseExpression();
      if (source[index] !== ')') throw new Error('missing closing parenthesis');
      index += 1;
      return value;
    }

    const start = index;
    let dotCount = 0;
    while (index < source.length && /[0-9.]/.test(source[index])) {
      if (source[index] === '.') dotCount += 1;
      index += 1;
    }
    if (start === index || dotCount > 1) throw new Error('invalid number');
    const value = Number(source.slice(start, index));
    if (!Number.isFinite(value)) throw new Error('invalid number');
    return value;
  }

  try {
    const value = parseExpression();
    if (index !== source.length || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
  } catch {
    return 0;
  }
}

export function calcTieredDeficit(targetArr, currentArr) {
  const count = targetArr.length;
  const required = new Array(count).fill(0);
  const deficit = new Array(count).fill(0);

  for (let index = count - 1; index >= 0; index -= 1) {
    required[index] = targetArr[index] + (index < count - 1 ? 3 * deficit[index + 1] : 0);
    deficit[index] = Math.max(0, required[index] - currentArr[index]);
  }

  const totalBase = deficit[0];
  let remainingBase = totalBase;
  const optimal = new Array(count).fill(0);
  const dynamicDeficit = [...deficit];

  for (let index = count - 1; index >= 0; index -= 1) {
    if (remainingBase <= 0) break;
    const divisor = 3 ** index;
    if (index < count - 1) {
      dynamicDeficit[index] = Math.max(
        0,
        targetArr[index] + 3 * (dynamicDeficit[index + 1] - optimal[index + 1]) - currentArr[index]
      );
    }
    optimal[index] = Math.min(dynamicDeficit[index], Math.floor(remainingBase / divisor));
    remainingBase -= optimal[index] * divisor;
  }

  return {
    totalBase,
    optimal,
    hasTarget: targetArr.some((value) => value > 0),
    hasDeficit: optimal.some((value) => value > 0)
  };
}

export function calculateResult(rawState) {
  const state = normalizeState(rawState);
  const { config, inv } = state;
  const mergeRules = state.source?.mergeRules || {};
  const current = {
    gold: safeEval(inv.gold),
    spec: safeEval(inv.spec),
    boss: safeEval(inv.boss),
    weekly: safeEval(inv.weekly),
    crown: safeEval(inv.crown),
    books: inv.books.map(safeEval),
    cult: inv.cult.map(safeEval),
    charGems: inv.charGems.map(safeEval),
    weapGems: inv.weapGems.map(safeEval),
    matA: inv.matA.map(safeEval),
    matB: inv.matB.map(safeEval)
  };

  let targetGold = 0;
  let targetSpec = 0;
  let targetBoss = 0;
  let targetWeekly = 0;
  let targetCrown = 0;
  const targetBooks = [0, 0, 0];
  const targetCult = [0, 0, 0, 0];
  const targetCharGems = [0, 0, 0, 0];
  const targetWeapGems = [0, 0, 0, 0];
  const targetMatA = [0, 0, 0];
  const targetMatB = [0, 0, 0];

  ['talentA', 'talentE', 'talentQ'].forEach((key) => {
    const currentIndex = config[key][0];
    const targetIndex = config[key][1];
    const diff = TALENT_DATA[targetIndex].map((value, index) => value - TALENT_DATA[currentIndex][index]);
    targetGold += diff[0];
    targetBooks[0] += diff[1];
    targetBooks[1] += diff[2];
    targetBooks[2] += diff[3];
    targetCult[0] += diff[4];
    targetCult[1] += diff[5];
    targetCult[2] += diff[6];
    targetWeekly += diff[7];
    targetCrown += diff[8];
  });

  const charCurrent = config.charAsc[0];
  const charTarget = config.charAsc[1];
  const charDiff = CHAR_ASC_DATA[charTarget].map((value, index) => value - CHAR_ASC_DATA[charCurrent][index]);
  targetGold += charDiff[0];
  targetCharGems[0] += charDiff[1];
  targetCharGems[1] += charDiff[2];
  targetCharGems[2] += charDiff[3];
  targetCharGems[3] += charDiff[4];
  targetSpec += charDiff[5];
  targetCult[0] += charDiff[6];
  targetCult[1] += charDiff[7];
  targetCult[2] += charDiff[8];
  targetBoss += charDiff[9];

  const weaponCurrent = config.weapAsc[0];
  const weaponTarget = config.weapAsc[1];
  const weaponDiff = WEAPON_ASC_DATA[weaponTarget].map((value, index) => value - WEAPON_ASC_DATA[weaponCurrent][index]);
  targetGold += weaponDiff[0];
  targetWeapGems[0] += weaponDiff[1];
  targetWeapGems[1] += weaponDiff[2];
  targetWeapGems[2] += weaponDiff[3];
  targetWeapGems[3] += weaponDiff[4];
  targetMatA[0] += weaponDiff[5];
  targetMatA[1] += weaponDiff[6];
  targetMatA[2] += weaponDiff[7];
  targetMatB[0] += weaponDiff[8];
  targetMatB[1] += weaponDiff[9];
  targetMatB[2] += weaponDiff[10];

  const independentMatA = [0, 0, 0];
  const independentMatB = [0, 0, 0];

  if (mergeRules.matAIntoCult) {
    targetCult[1] += targetMatA[0];
    targetCult[2] += targetMatA[1];
    targetCult[3] += targetMatA[2];
  } else {
    independentMatA.splice(0, 3, ...targetMatA);
  }

  if (mergeRules.matBIntoCult) {
    targetCult[0] += targetMatB[0];
    targetCult[1] += targetMatB[1];
    targetCult[2] += targetMatB[2];
  } else {
    independentMatB.splice(0, 3, ...targetMatB);
  }

  const flatTargets = {
    gold: targetGold,
    spec: targetSpec,
    boss: targetBoss,
    weekly: targetWeekly,
    crown: targetCrown
  };

  const flat = {
    gold: Math.max(0, targetGold - current.gold),
    spec: Math.max(0, targetSpec - current.spec),
    boss: Math.max(0, targetBoss - current.boss),
    weekly: Math.max(0, targetWeekly - current.weekly),
    crown: Math.max(0, targetCrown - current.crown)
  };

  const groups = {
    books: calcTieredDeficit(targetBooks, current.books),
    cult: calcTieredDeficit(targetCult, current.cult),
    charGems: calcTieredDeficit(targetCharGems, current.charGems),
    weapGems: calcTieredDeficit(targetWeapGems, current.weapGems),
    matA: mergeRules.matAIntoCult ? { totalBase: 0, optimal: [0, 0, 0], hasTarget: false, hasDeficit: false } : calcTieredDeficit(independentMatA, current.matA),
    matB: mergeRules.matBIntoCult ? { totalBase: 0, optimal: [0, 0, 0], hasTarget: false, hasDeficit: false } : calcTieredDeficit(independentMatB, current.matB)
  };

  const hasAnyTarget = Object.values(flatTargets).some((value) => value > 0)
    || Object.values(groups).some((group) => group.hasTarget);
  const hasAnyDeficit = Object.values(flat).some((value) => value > 0)
    || Object.values(groups).some((group) => group.hasDeficit);

  return {
    flat,
    groups,
    hasAnyTarget,
    hasAnyDeficit
  };
}
