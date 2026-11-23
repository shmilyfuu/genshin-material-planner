import {calcTieredDeficit, safeEval} from './core.mjs';
import {buildNanokaDemand} from './hybrid-calculator.mjs';

const idOf = (material) => {
  const value = Number(material?.id);
  return Number.isSafeInteger(value) && value > 0 ? String(value) : '';
};

export function migrateLegacyInventory(inventory, character, weapon, rules = {}) {
  const values = {};
  const assign = (material, input) => {
    const id = idOf(material);
    if (id && typeof input === 'string' && input.trim()) {
      if (!Object.hasOwn(values, id)) values[id] = input.slice(0, 120);
    }
  };
  assign({id: 202}, inventory?.gold);
  for (const key of ['spec','boss','weekly','crown']) {
    assign(character?.materials?.[key], inventory?.[key]);
  }
  for (const [key, materials] of [
    ['books', character?.materials?.books],
    ['charGems', character?.materials?.charGems],
    ['weapGems', weapon?.materials?.weapGems],
    ['cult', character?.materials?.cult],
    ['matA', weapon?.materials?.matA],
    ['matB', weapon?.materials?.matB]
  ]) {
    if ((key === 'matA' && rules.matAIntoCult)
      || (key === 'matB' && rules.matBIntoCult)) continue;
    const input = inventory?.[key];
    if (!Array.isArray(input)) continue;
    for (let i=0; i<input.length; i++) {
      const material = key === 'cult' && i === 3
        ? rules.matAIntoCult ? weapon?.materials?.matA?.[2] : null
        : materials?.[i];
      assign(material, input[i]);
    }
  }
  return values;
}

export function calculateMultiPlan(entries, inventory = {}) {
  const materials = new Map();
  const familyLinks = [];
  const incomplete = [];
  const unavailable = [];
  let hasAnyTarget = false;

  for (const entry of entries) {
    const plan = entry?.plan;
    const charId = String(plan?.source?.selectedCharacterId || '');
    const weaponId = String(plan?.source?.selectedWeaponId || '');
    if (!charId && !weaponId) continue;
    if ((charId && !entry.characterProfile)
      || (weaponId && !entry.weaponProfile)) {
      unavailable.push(plan?.source?.selectedCharacterName
        || plan?.source?.selectedWeaponName || '未载入的养成对象');
      continue;
    }
    const built = buildNanokaDemand({
      config: plan.config,
      characterProfile: entry.characterProfile,
      weaponProfile: entry.weaponProfile,
      parts: {character: Boolean(charId), weapon: Boolean(weaponId)}
    });
    for (const group of built.groups) {
      const link = [];
      for (const row of group.rows) {
        const id = String(row.id);
        const old = materials.get(id);
        if (old) {
          old.count += row.count;
          if (!old.rank && row.rank) old.rank = row.rank;
          if (!old.name && row.name) old.name = row.name;
          if (old.kind !== row.kind) old.kind = '共同材料';
        } else {
          materials.set(id, {...row, id, count: row.count});
        }
        if (group.family) link.push(id);
      }
      if (link.length) familyLinks.push({
        ids: link, title: group.title
      });
    }
    if (built.unrecognized.length) {
      for (const row of built.unrecognized) {
        incomplete.push({...row, plan: plan.source.selectedCharacterName
          || plan.source.selectedWeaponName || '培养项'});
      }
    }
  }

  const parent = new Map([...materials.keys()].map(id => [id, id]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (id !== root) {
      const next = parent.get(id);
      parent.set(id, root);
      id = next;
    }
    return root;
  };
  for (const {ids} of familyLinks) {
    for (const id of ids.slice(1)) parent.set(find(id),find(ids[0]));
  }

  const grouped = new Map();
  for (const row of materials.values()) {
    const root = find(row.id);
    const group = grouped.get(root) || {rows:[], titles:new Set(),family:false};
    group.rows.push(row);
    grouped.set(root,group);
  }
  for (const link of familyLinks) {
    const root = find(link.ids[0]);
    const group = grouped.get(root);
    group.family = true;
    group.titles.add(link.title);
  }

  const groups = [...grouped.values()].map(group => {
    const rows = group.rows.sort((a,b) => a.rank-b.rank || Number(a.id)-Number(b.id))
      .map(item => {
        const raw = inventory?.[item.id] ?? '';
        const stock = safeEval(raw);
        return {...item, stock, lack: 0};
      });
    let totalBase = 0;
    if (group.family) {
      const calc = calcTieredDeficit(
        rows.map(row => row.count),
        rows.map(row => row.stock)
      );
      totalBase = calc.totalBase;
      rows.forEach((row,i) => {row.lack=calc.optimal[i];});
    } else {
      rows.forEach(row => {row.lack=Math.max(0,row.count-row.stock);});
    }
    hasAnyTarget ||= rows.some(row => row.count > 0);
    return {
      title: group.titles.size > 1 ? '共同培养材料'
        : [...group.titles][0] || rows[0].kind,
      family: group.family,
      rows,
      totalBase,
      hasDeficit: rows.some(row => row.lack > 0)
    };
  });
  groups.sort((a,b) => a.title.localeCompare(b.title, 'zh-CN'));
  return {
    groups,
    hasAnyTarget,
    hasAnyDeficit: groups.some(group => group.hasDeficit),
    incomplete, unavailable,
    materials: [...materials.values()]
  };
}
