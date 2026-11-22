import { TALENT_DATA, CHAR_ASC_DATA, WEAPON_ASC_DATA, calcTieredDeficit, safeEval } from './core.mjs';

const number = (value) => Number.isSafeInteger(value) && value >= 0;
const itemId = (material) => {
  const id = Number(material?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const pair = (config, key, limit) => {
  const value = config?.[key];
  if (!Array.isArray(value) || value.length !== 2
    || !value.every((n) => Number.isInteger(n) && n >= 0 && n <= limit)
    || value[1] < value[0]) throw new Error(key + ' 培养等级无效。');
  return value;
};
const delta = (table, current, target) =>
  table[target].map((n, i) => n - table[current][i]);

export function buildNanokaDemand({ config, characterProfile, weaponProfile, parts }) {
  const nodes = new Map();
  const links = [];
  const unrecognized = [];

  function add(material, count, title, kind) {
    if (!count) return;
    const id = itemId(material);
    if (id === null) {
      unrecognized.push({title, count, kind});
      return;
    }
    const row = nodes.get(id) || {
      id, name: String(material.name || title), rank: Number(material.rank) || 0,
      kind, count: 0
    };
    row.count += count;
    if (row.kind !== kind) row.kind = '共同材料';
    nodes.set(id, row);
  }
  function family(materials, counts, label, kind) {
    if (!counts.some((count) => count > 0)) return;
    const ids = [];
    for (let i = 0; i < counts.length; i++) {
      const material = materials?.[i];
      add(material, counts[i], label + '·' + (i + 1) + '阶', kind);
      const id = itemId(material);
      if (id !== null) {
        ids.push(id);
        if (!nodes.has(id)) {
          nodes.set(id, {id, name: String(material.name || label), rank: Number(material.rank) || 0, kind, count: 0});
        }
      }
    }
    if (ids.length) links.push({ids, label});
  }

  if (parts?.character) {
    if (!characterProfile) throw new Error('Nanoka 角色材料尚未载入，请重新选择角色。');
    const char = delta(CHAR_ASC_DATA, ...pair(config, 'charAsc', 6));
    const talents = ['talentA', 'talentE', 'talentQ']
      .map(key => delta(TALENT_DATA, ...pair(config, key, 9)));
    const sumTalent = (index) => talents.reduce((sum, row) => sum + row[index], 0);
    const m = characterProfile.materials;
    add({id: 202, name: '摩拉'}, char[0] + sumTalent(0), '摩拉', '基础材料');
    add(m.spec, char[5], '区域特产', '角色基础材料');
    add(m.boss, char[9], 'Boss 材料', '角色基础材料');
    add(m.weekly, sumTalent(7), '周本材料', '天赋材料');
    add(m.crown, sumTalent(8), '智识之冕', '天赋材料');
    family(m.charGems, char.slice(1, 5), '角色突破石', '角色突破材料');
    family(m.cult, [char[6] + sumTalent(4), char[7] + sumTalent(5), char[8] + sumTalent(6)],
      '角色培养素材', '角色突破材料');
    family(m.books, [sumTalent(1), sumTalent(2), sumTalent(3)], '天赋书', '天赋材料');
  }
  if (parts?.weapon) {
    if (!weaponProfile) throw new Error('Nanoka 武器材料尚未载入，请重新选择武器。');
    const weapon = delta(WEAPON_ASC_DATA, ...pair(config, 'weapAsc', 6));
    const m = weaponProfile.materials;
    add({id: 202, name: '摩拉'}, weapon[0], '摩拉', '基础材料');
    family(m.weapGems, weapon.slice(1, 5), '武器突破秘境材料', '武器突破材料');
    family(m.matA, weapon.slice(5, 8), '武器素材 A', '武器突破材料');
    family(m.matB, weapon.slice(8, 11), '武器素材 B', '武器突破材料');
  }

  const parent = new Map([...nodes.keys()].map(id => [id, id]));
  const root = (id) => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current);
    return current;
  };
  for (const link of links) {
    const first = link.ids[0];
    for (const id of link.ids.slice(1)) parent.set(root(id), root(first));
  }
  const groupMap = new Map();
  for (const row of nodes.values()) {
    const id = root(row.id);
    const group = groupMap.get(id) || {rows: [], family: false, titles: new Set()};
    group.rows.push(row);
    groupMap.set(id, group);
  }
  for (const link of links) {
    const group = groupMap.get(root(link.ids[0]));
    group.family = true;
    group.titles.add(link.label);
  }
  const groups = [...groupMap.values()].map(group => {
    group.rows.sort((a, b) => a.rank - b.rank || a.id - b.id);
    return {
      title: [...group.titles].length > 1 ? '共同培养材料' :
        [...group.titles][0] || group.rows[0].kind,
      family: group.family,
      rows: group.rows
    };
  });
  groups.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  return {groups, unrecognized};
}

export function mapManualInventory({inventory = {}, characterProfile, weaponProfile, mergeRules = {}} = {}) {
  const values = new Map();
  const conflicts = new Set();
  const put = (material, input) => {
    const id = itemId(material);
    if (id === null || input === null || input === undefined
      || String(input).trim() === '') return;
    const expression = String(input).trim()
      .replace(/[，,\s]/g, '').replace(/[×xX]/g, '*')
      .replace(/÷/g, '/').replace(/（/g, '(').replace(/）/g, ')');
    if (!/^[\d+\-*/().]+$/.test(expression) || /[+\-*/.(]$/.test(expression)) return;
    const amount = safeEval(input);
    if (!number(amount)) return;
    if (values.has(id) && values.get(id) !== amount) conflicts.add(id);
    values.set(id, amount);
  };
  const singles = [
    ['gold', {id: 202}],
    ['spec', characterProfile?.materials?.spec],
    ['boss', characterProfile?.materials?.boss],
    ['weekly', characterProfile?.materials?.weekly],
    ['crown', characterProfile?.materials?.crown]
  ];
  for (const [key, material] of singles) put(material, inventory?.[key]);

  const groups = [
    ['books', characterProfile?.materials?.books],
    ['charGems', characterProfile?.materials?.charGems],
    ['weapGems', weaponProfile?.materials?.weapGems],
    ['cult', characterProfile?.materials?.cult],
    ['matA', weaponProfile?.materials?.matA],
    ['matB', weaponProfile?.materials?.matB]
  ];
  for (const [key, items] of groups) {
    if ((key === 'matA' && mergeRules.matAIntoCult)
      || (key === 'matB' && mergeRules.matBIntoCult)) continue;
    const slots = inventory?.[key];
    if (!Array.isArray(slots)) continue;
    for (let i = 0; i < slots.length; i++) {
      const material = key === 'cult' && i === 3
        ? mergeRules.matAIntoCult ? weaponProfile?.materials?.matA?.[2] : null
        : items?.[i];
      put(material, slots[i]);
    }
  }
  for (const id of conflicts) values.delete(id);
  return {
    values: Object.fromEntries([...values].map(([id, amount]) => [String(id), amount])),
    conflicts: [...conflicts]
  };
}

export function evaluateNanokaDemand(demand, {
  manual = {}, manualReference = {}, available = [], inventoryProbe = [],
  officialMaterials = [], mixed = false
} = {}) {
  const known = new Map();
  for (const entry of inventoryProbe.length ? inventoryProbe : available) {
    const id = Number(entry?.id), count = Number(entry?.num);
    if (Number.isSafeInteger(id) && id > 0 && number(count)) {
      known.set(id, {count, minimum: entry.minimum === true});
    }
  }
  const consumedByOfficial = new Set(officialMaterials
    .filter(row => number(row?.total) && row.total > 0)
    .map(row => Number(row.id)));
  const remaining = new Map();
  for (const entry of available) {
    const id = Number(entry?.id), count = Number(entry?.num);
    if (Number.isSafeInteger(id) && id > 0 && number(count)) remaining.set(id, count);
  }
  const groups = demand.groups.map(group => {
    const rows = group.rows.map(row => {
      const id = String(row.id);
      const explicit = Object.hasOwn(manual, id) && number(manual[id]) ? manual[id] : null;
      const reference = Object.hasOwn(manualReference, id) && number(manualReference[id])
        ? manualReference[id] : null;
      const inferred = known.get(row.id);
      const officialUsed = mixed && consumedByOfficial.has(row.id);
      let stock = null;
      let source = '待确认';
      let verified = false;
      if (explicit !== null) {
        stock = explicit;
        source = '手动确认';
        verified = true;
      } else if (officialUsed) {
        if (remaining.has(row.id)) {
          stock = remaining.get(row.id);
          source = '官方计算后可用';
        }
      } else if (reference !== null) {
        stock = reference;
        source = '手动背包';
        verified = true;
      } else if (inferred) {
        stock = inferred.count;
        source = '米游社推算';
        verified = !group.family && !inferred.minimum;
      }
      return {
        ...row, stock, source, verified,
        manualReference: reference,
        probeValue: inferred?.count ?? null,
        different: reference !== null && inferred && reference !== inferred.count
      };
    });
    const complete = rows.every(row => row.verified);
    const covered = rows.every(row => number(row.stock));
    if (complete) {
      const deficit = group.family
        ? calcTieredDeficit(rows.map(row => row.count), rows.map(row => row.stock)).optimal
        : rows.map(row => Math.max(0, row.count - row.stock));
      rows.forEach((row, i) => { row.lack = deficit[i]; });
    } else {
      rows.forEach(row => { row.lack = null; });
    }
    return {...group, complete, covered, rows};
  });
  return {...demand, groups};
}
