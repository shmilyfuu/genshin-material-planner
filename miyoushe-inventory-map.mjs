function parseId(material) {
  const id = Number(material?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function ownValue(inventory, key, index) {
  const value = inventory?.[key];
  return index === null ? String(value ?? '') : String(Array.isArray(value) ? value[index] ?? '' : '');
}

export function mapInventoryMaterials({ officialMaterials = [], characterProfile = null, weaponProfile = null, inventory = {}, rules = {} } = {}) {
  if (!characterProfile && !weaponProfile) return { rows: [], available: 0, lowerBounds: 0, missing: 0 };
  const reported = new Map();
  for (const material of officialMaterials) {
    const id = parseId(material);
    if (id !== null) reported.set(id, material);
  }
  const rows = [];
  const add = (key, index, material, fallbackLabel) => {
    const id = parseId(material);
    if (id === null) return;
    const result = reported.get(id);
    const need = Number(result?.total);
    const lack = Number(result?.lack);
    const owned = Number(result?.estimatedOwned);
    const valid = result && Number.isSafeInteger(need) && need >= 0
      && Number.isSafeInteger(lack) && lack >= 0 && lack <= need
      && Number.isSafeInteger(owned) && owned >= 0 && owned === need - lack;
    rows.push({
      id, key, index,
      name: String(material.name || fallbackLabel),
      current: ownValue(inventory, key, index),
      official: valid ? owned : null,
      status: !valid ? 'missing' : lack > 0 ? 'estimate' : 'lowerBound'
    });
  };

  add('gold', null, { id: 202, name: '摩拉' }, '摩拉');
  for (const [key, label] of [
    ['spec', '区域特产'], ['boss', 'Boss 素材'],
    ['weekly', '周本材料'], ['crown', '智识之冕']
  ]) add(key, null, characterProfile?.materials?.[key], label);

  const groups = [
    ['books', characterProfile?.materials?.books],
    ['cult', characterProfile?.materials?.cult],
    ['charGems', characterProfile?.materials?.charGems],
    ['weapGems', weaponProfile?.materials?.weapGems],
    ['matA', weaponProfile?.materials?.matA],
    ['matB', weaponProfile?.materials?.matB]
  ];
  for (const [key, items] of groups) {
    if (key === 'matA' && rules.matAIntoCult) continue;
    if (key === 'matB' && rules.matBIntoCult) continue;
    const limit = key === 'cult' ? 4 : key === 'books' || key === 'matA' || key === 'matB' ? 3 : 4;
    for (let i = 0; i < limit; i++) {
      const material = key === 'cult' && i === 3
        ? rules.matAIntoCult ? weaponProfile?.materials?.matA?.[2] : null
        : items?.[i];
      add(key, i, material, key + ' ' + i);
    }
  }
  return {
    rows,
    available: rows.filter((row) => row.status === 'estimate').length,
    lowerBounds: rows.filter((row) => row.status === 'lowerBound').length,
    missing: rows.filter((row) => row.status === 'missing').length
  };
}
