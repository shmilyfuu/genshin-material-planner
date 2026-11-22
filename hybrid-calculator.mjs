import { TALENT_DATA, CHAR_ASC_DATA, WEAPON_ASC_DATA, calcTieredDeficit } from './core.mjs';

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

export function evaluateNanokaDemand(demand, {
  manual = {}, available = [], inventoryProbe = [], officialMaterials = [], mixed = false
} = {}) {
  const known = new Map();
  for (const entry of inventoryProbe.length ? inventoryProbe : available) {
    const id = Number(entry?.id), count = Number(entry?.num);
    if (Number.isSafeInteger(id) && id > 0 && number(count)) known.set(id, count);
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
      const own = Object.prototype.hasOwnProperty.call(manual, String(row.id))
        ? manual[String(row.id)] : undefined;
      const officialUsed = mixed && consumedByOfficial.has(row.id);
      let stock = null;
      let source = '待确认';
      if (number(own)) {
        stock = own;
        source = '手动';
      } else if (officialUsed) {
        stock = remaining.get(row.id) ?? 0;
        source = '官方计算后可用';
      } else if (known.has(row.id)) {
        stock = known.get(row.id);
        source = inventoryProbe.length ? '米游社推算' : '米游社剩余量';
      }
      return {...row, stock, source};
    });
    const complete = rows.every(row => number(row.stock));
    if (complete) {
      const deficit = group.family
        ? calcTieredDeficit(rows.map(row => row.count), rows.map(row => row.stock)).optimal
        : rows.map(row => Math.max(0, row.count - row.stock));
      rows.forEach((row, i) => { row.lack = deficit[i]; });
    } else {
      rows.forEach(row => { row.lack = null; });
    }
    return {...group, complete, rows};
  });
  return {...demand, groups};
}
