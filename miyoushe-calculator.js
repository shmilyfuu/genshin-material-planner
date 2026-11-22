'use strict';

const MYS_CALC_ROOT = MYS.takumi + '/event/e20200928calculate';
const MYS_CALC_CONTEXT = {
  origin: 'https://act.mihoyo.com',
  referrer: 'https://act.mihoyo.com/ys/event/calculator/index.html'
};

// The panel's level steps describe breakthroughs. The next level includes the
// selected promotion in the calculator request.
const MYS_BREAKTHROUGH_LEVELS = [1, 21, 41, 51, 61, 71, 81];

function mysCalcHeaders(device) {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'x-rpc-app_version': '2.106.2',
    'x-rpc-client_type': '4',
    'x-rpc-device_id': device.id,
    ...(device.fp ? { 'x-rpc-device_fp': device.fp } : {}),
    'x-rpc-platform': '4',
    'x-rpc-lrsag': '',
    'x-rpc-page': '__#',
    'x-rpc-mi_referrer': 'https://act.mihoyo.com/',
    'x-rpc-cal_type': '0',
    'x-rpc-stat_platform': 'PC',
    'x-rpc-lang': 'zh-cn'
  };
}

async function mysCalcPost(path, body, cookie, headers) {
  try {
    return await mysCookieRequest(MYS_CALC_ROOT + path, cookie, {
      method: 'POST', headers, body: JSON.stringify(body)
    }, MYS_CALC_CONTEXT);
  } catch (error) {
    const steps = {
      '/v1/avatar/list': '读取角色目录',
      '/v1/weapon/list': '读取武器目录',
      '/v3/batch_compute': '计算养成材料'
    };
    throw new Error((steps[path] || '计算器接口') + '失败：' + String(error?.message || error));
  }
}

function mysLevelPair(config, key, max) {
  const pair = config?.[key];
  if (!Array.isArray(pair) || pair.length !== 2) throw new Error(key + ' 等级参数缺失。');
  const [current, target] = pair;
  if (![current, target].every(n => Number.isInteger(n) && n >= 0 && n <= max)
    || target < current) throw new Error(key + ' 等级范围无效。');
  return [current, target];
}

function mysCreatePlanItems(plan, avatars, weapons) {
  const characterId = Number(plan?.characterId || 0);
  const weaponId = Number(plan?.weaponId || 0);
  const selectedCharacter = String(plan?.characterId || '') !== '';
  const selectedWeapon = String(plan?.weaponId || '') !== '';
  if (!selectedCharacter && !selectedWeapon) throw new Error('请先选择角色或武器。');
  if ((selectedCharacter && (!Number.isSafeInteger(characterId) || characterId <= 0))
    || (selectedWeapon && (!Number.isSafeInteger(weaponId) || weaponId <= 0))) {
    throw new Error('角色或武器 ID 无效。');
  }
  const config = plan?.config || {};
  const charLevels = mysLevelPair(config, 'charAsc', 6);
  const weaponLevels = mysLevelPair(config, 'weapAsc', 6);
  const skillLevels = ['talentA', 'talentE', 'talentQ']
    .map(key => mysLevelPair(config, key, 9));
  const charChange = selectedCharacter && (charLevels[1] > charLevels[0]
    || skillLevels.some(([a, b]) => b > a));
  const weaponChange = selectedWeapon && weaponLevels[1] > weaponLevels[0];
  if (!charChange && !weaponChange) throw new Error('请选择需要升级的角色或武器等级。');

  const avatar = charChange
    ? avatars.find(row => Number(row?.id) === characterId) : null;
  if (charChange && !avatar) throw new Error('米游社计算器暂未收录当前角色，请使用手动背包模式。');
  const weapon = weaponChange
    ? weapons.find(row => Number(row?.id) === weaponId) : null;
  if (weaponChange && !weapon) throw new Error('米游社计算器暂未收录当前武器，请使用手动背包模式。');

  function avatarItem(character, levelRange = [0, 0], talents = []) {
    const item = {
      avatar_id: Number(character.id),
      avatar_level_current: MYS_BREAKTHROUGH_LEVELS[levelRange[0]],
      avatar_level_target: MYS_BREAKTHROUGH_LEVELS[levelRange[1]],
      avatar_promote_level: levelRange[0],
      from_user_sync: false,
      skill_list: talents
    };
    if (Number.isSafeInteger(Number(character.element_attr_id)) && Number(character.element_attr_id) > 0) {
      item.element_attr_id = Number(character.element_attr_id);
    }
    return item;
  }

  function talentRequests(character) {
    if (!skillLevels.some(([a, b]) => b > a)) return [];
    const ordered = (Array.isArray(character?.skill_list) ? character.skill_list : [])
      .filter(skill => Number.isSafeInteger(Number(skill.group_id || skill.id))
        && Number(skill.group_id || skill.id) > 0 && Number(skill.max_level) >= 10);
    if (ordered.length < 3) throw new Error('当前角色天赋目录不完整，无法匹配普攻、战技和爆发。');
    return skillLevels.map(([current, target], index) => ({
      id: Number(ordered[index].group_id || ordered[index].id),
      level_current: current + 1,
      level_target: target + 1
    }));
  }

  const items = [];
  if (charChange) items.push(avatarItem(avatar, charLevels, talentRequests(avatar)));

  if (weaponChange) {
    const maxLevel = Number(weapon.max_level) || 90;
    if (MYS_BREAKTHROUGH_LEVELS[weaponLevels[1]] > maxLevel) {
      throw new Error('当前武器的目标突破等级超过米游社目录记录的最高等级。');
    }
    const weaponData = {
      id: weaponId,
      level_current: MYS_BREAKTHROUGH_LEVELS[weaponLevels[0]],
      level_target: MYS_BREAKTHROUGH_LEVELS[weaponLevels[1]]
    };
    const category = Number(weapon.weapon_cat_id);
    const sameCategory = avatar && Number(avatar.weapon_cat_id) === category;
    if (items.length && sameCategory) {
      items[0].weapon = weaponData;
    } else {
      const carrier = avatars.find(row => Number(row?.weapon_cat_id) === category
        && Number.isSafeInteger(Number(row?.id)) && Number(row.id) > 0);
      if (!carrier) throw new Error('官方角色目录缺少该武器类型，无法计算独立武器。');
      const item = avatarItem(carrier);
      item.weapon = weaponData;
      items.push(item);
    }
  }
  return items;
}

function mysParseDeficits(response) {
  const data = response?.data;
  if (data?.has_user_info !== true) throw new Error('米游社未返回该 UID 的库存参与计算结果。');
  if (!Array.isArray(data?.overall_consume)) throw new Error('官方计算结果缺少 overall_consume。');
  return data.overall_consume.map(row => {
    const id = Number(row?.id);
    const total = Number(row?.num);
    const lack = Number(row?.lack_num);
    if (!Number.isSafeInteger(id) || id <= 0
      || !Number.isSafeInteger(total) || total < 0
      || !Number.isSafeInteger(lack) || lack < 0 || lack > total) return null;
    return {id, name: String(row.name || '素材 ' + id), total, lack};
  }).filter(Boolean).sort((a,b) => a.id - b.id);
}


function mysHybridPlan(plan, avatars, weapons) {
  const charId = String(plan?.characterId || '');
  const weaponId = String(plan?.weaponId || '');
  if (!charId && !weaponId) throw new Error('请先选择角色或武器。');
  const charLevels = mysLevelPair(plan?.config, 'charAsc', 6);
  const weaponLevels = mysLevelPair(plan?.config, 'weapAsc', 6);
  const talents = ['talentA', 'talentE', 'talentQ']
    .map(key => mysLevelPair(plan?.config, key, 9));
  const activeCharacter = Boolean(charId) && (
    charLevels[0] < charLevels[1] || talents.some(([a,b]) => a < b)
  );
  const activeWeapon = Boolean(weaponId) && weaponLevels[0] < weaponLevels[1];
  if (!activeCharacter && !activeWeapon) throw new Error('请选择需要升级的角色或武器等级。');
  const knownCharacter = activeCharacter && avatars.some(row => String(row.id) === charId);
  const knownWeapon = activeWeapon && weapons.some(row => String(row.id) === weaponId);
  return {
    fallback: {character: activeCharacter && !knownCharacter, weapon: activeWeapon && !knownWeapon},
    official: {character: knownCharacter, weapon: knownWeapon},
    officialPlan: {
      characterId: knownCharacter ? charId : '',
      weaponId: knownWeapon ? weaponId : '',
      config: plan.config
    }
  };
}

async function mysAllCalculatorAvatars(cookie, headers) {
  const entries = [];
  const seen = new Set();
  const size = 200;
  for (let page = 1; page <= 10; page++) {
    const response = await mysCalcPost('/v1/avatar/list',
      {page, size, is_all: true, lang: 'zh-cn'}, cookie, headers);
    const list = response?.data?.list;
    if (!Array.isArray(list)) throw new Error('米游社角色目录格式错误。');
    let fresh = 0;
    for (const row of list) {
      const id = Number(row?.id);
      if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
      entries.push(row);
      seen.add(id);
      fresh++;
    }
    if (list.length < size) return entries;
    if (!fresh) throw new Error('米游社角色目录分页重复。');
    if (Number(response?.data?.total) > 0 && entries.length >= Number(response.data.total)) return entries;
  }
  throw new Error('米游社角色目录页数超过预期。');
}

function mysAvailableMaterials(response) {
  return (Array.isArray(response?.data?.available_material) ? response.data.available_material : [])
    .map(row => ({id: Number(row?.id), num: Number(row?.num)}))
    .filter(row => Number.isSafeInteger(row.id) && row.id > 0
      && Number.isSafeInteger(row.num) && row.num >= 0);
}


function mysBuildInventoryProbeItems(avatars, weapons) {
  const eligible = avatars.filter(character => {
    const id = Number(character?.id);
    return Number.isSafeInteger(id) && id > 0
      && ![10000005,10000007,10000117,10000118].includes(id)
      && character.name !== '旅行者'
      && Array.isArray(character.skill_list)
      && character.skill_list.some(skill => Number(skill?.max_level) >= 10
        && Number(skill?.group_id || skill?.id) > 0);
  });
  const byCategory = new Map();
  for (const weapon of weapons) {
    const category = Number(weapon?.weapon_cat_id);
    const id = Number(weapon?.id);
    if (!Number.isSafeInteger(category) || !Number.isSafeInteger(id) || id <= 0) continue;
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(weapon);
  }
  const cursor = new Map();
  return eligible.map(character => {
    const item = {
      avatar_id: Number(character.id),
      avatar_level_current: 1,
      avatar_level_target: 90,
      avatar_promote_level: 0,
      from_user_sync: false,
      skill_list: character.skill_list
        .filter(skill => Number(skill?.max_level) >= 10
          && Number(skill?.group_id || skill?.id) > 0)
        .map(skill => ({
          id: Number(skill.group_id || skill.id),
          level_current: 1,
          level_target: 10
        }))
    };
    const element = Number(character.element_attr_id);
    if (Number.isSafeInteger(element) && element > 0) item.element_attr_id = element;
    const cat = Number(character.weapon_cat_id);
    const matching = byCategory.get(cat) || [];
    if (matching.length) {
      const position = cursor.get(cat) || 0;
      const weapon = matching[position % matching.length];
      cursor.set(cat, position + 1);
      item.weapon = {
        id: Number(weapon.id),
        level_current: 1,
        level_target: Math.min(90, Number(weapon.max_level) || 90)
      };
    }
    return item;
  });
}

function mysProbeInventoryRows(response) {
  if (response?.data?.has_user_info !== true
    || !Array.isArray(response?.data?.overall_consume)) {
    throw new Error('米游社未返回带 UID 库存的材料计算结果。');
  }
  const remaining = new Map(mysAvailableMaterials(response).map(row => [row.id, row.num]));
  const result = new Map();
  for (const row of response.data.overall_consume) {
    const id = Number(row?.id);
    const total = Number(row?.num);
    const lack = Number(row?.lack_num);
    if (!Number.isSafeInteger(id) || id <= 0
      || !Number.isSafeInteger(total) || total < 0
      || !Number.isSafeInteger(lack) || lack < 0 || lack > total) continue;
    const covered = total - lack;
    const extra = remaining.get(id) || 0;
    const value = covered + extra;
    if (!Number.isSafeInteger(value)) continue;
    result.set(id, {id, num: value, minimum: !remaining.has(id) && lack === 0});
  }
  for (const [id, num] of remaining) {
    if (!result.has(id)) result.set(id, {id, num, minimum: false});
  }
  return [...result.values()];
}

async function mysProbeInventory(uid, region, avatars, weapons, cookie, headers) {
  const items = mysBuildInventoryProbeItems(avatars, weapons);
  if (!items.length) throw new Error('官方角色目录中没有可用于读取背包的养成项目。');
  const values = new Map();
  const merge = (response) => {
    for (const row of mysProbeInventoryRows(response)) {
      const old = values.get(row.id);
      if (!old || row.num > old.num || (row.num === old.num && old.minimum && !row.minimum)) {
        values.set(row.id, row);
      }
    }
  };
  const request = (batch) => mysCalcPost('/v3/batch_compute',
    {items: batch, uid, region, lang: 'zh-cn'}, cookie, headers);
  try {
    merge(await request(items));
    return {materials: [...values.values()], completedBatches: 1, totalBatches: 1};
  } catch (error) {
    if (items.length <= 30 || String(error?.message || error).includes('UID 库存')) throw error;
  }
  let completed = 0;
  const batches = [];
  for (let index = 0; index < items.length; index += 30) batches.push(items.slice(index, index + 30));
  const errors = [];
  for (const batch of batches) {
    try {
      merge(await request(batch));
      completed++;
    } catch (error) {
      errors.push(String(error?.message || error));
    }
  }
  if (completed === 0) {
    throw new Error('米游社材料探测失败：' + (errors[0] || '未知错误'));
  }
  return {
    materials: [...values.values()],
    completedBatches: completed,
    totalBatches: batches.length
  };
}

async function mysCalculate(uid, region, plan) {
  const roles = await mysRoles();
  if (!roles.some(role => role.uid === uid && role.region === region)) {
    throw new Error('所选 UID 与当前米游社账号不匹配，请重新读取 UID。');
  }
  const accounts = await mysReadAccounts();
  const activeId = accounts.activeId;
  const account = accounts.entries[activeId];
  const cookie = mysAccountCookie(account);
  const device = await mysFingerprint(await mysDevice());
  const headers = mysCalcHeaders(device);

  const avatars = await mysAllCalculatorAvatars(cookie, headers);
  const weapons = [];
  try {
    const result = await mysCalcPost('/v1/weapon/list',
      {page: 1, size: 1000, weapon_levels: [1, 2, 3, 4, 5], lang: 'zh-cn'}, cookie, headers);
    if (!Array.isArray(result?.data?.list)) throw new Error('官方武器目录数据格式错误。');
    weapons.push(...result.data.list);
  } catch (error) {
    if (plan?.weaponId) {
      throw new Error('官方武器目录读取失败，无法确认武器状态：' + String(error?.message || error));
    }
  }
  const hybrid = mysHybridPlan(plan, avatars, weapons);
  const usesOfficial = hybrid.official.character || hybrid.official.weapon;
  const usesNanoka = hybrid.fallback.character || hybrid.fallback.weapon;
  let materials = [];
  let available = [];
  let itemCount = 0;
  if (usesOfficial) {
    const items = mysCreatePlanItems(hybrid.officialPlan, avatars, weapons);
    const response = await mysCalcPost('/v3/batch_compute',
      {items, uid, region, lang: 'zh-cn'}, cookie, headers);
    materials = mysParseDeficits(response);
    available = mysAvailableMaterials(response);
    itemCount = items.length;
  }
  const probe = usesNanoka
    ? await mysProbeInventory(uid, region, avatars, weapons, cookie, headers)
    : {materials: [], completedBatches: 0, totalBatches: 0};
  const latest = await mysReadAccounts();
  if (latest.activeId !== activeId || latest.entries[activeId]?.stoken !== account.stoken) {
    throw new Error('查询期间米游社账号发生切换，请重新计算。');
  }
  return {
    uid, region, materials, available,
    inventoryProbe: probe.materials,
    probeCoverage: {completed: probe.completedBatches, total: probe.totalBatches},
    fallback: hybrid.fallback, official: hybrid.official, itemCount
  };
}
