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

  const characters = await mysCalcPost('/v1/avatar/list',
    {page: 1, size: 200, is_all: true, lang: 'zh-cn'}, cookie, headers);
  if (!Array.isArray(characters?.data?.list)) throw new Error('官方角色目录数据格式错误。');
  // The current calculation requires only the selected character and a compatible weapon carrier.
  const avatars = characters.data.list;
  const weapons = [];
  if (plan?.weaponId && plan?.config?.weapAsc?.[1] > plan?.config?.weapAsc?.[0]) {
    const result = await mysCalcPost('/v1/weapon/list',
      {page: 1, size: 1000, weapon_levels: [1, 2, 3, 4, 5], lang: 'zh-cn'}, cookie, headers);
    if (!Array.isArray(result?.data?.list)) throw new Error('官方武器目录数据格式错误。');
    weapons.push(...result.data.list);
  }
  const items = mysCreatePlanItems(plan, avatars, weapons);
  const response = await mysCalcPost('/v3/batch_compute',
    {items, uid, region, lang: 'zh-cn'}, cookie, headers);
  const materials = mysParseDeficits(response);
  const latest = await mysReadAccounts();
  if (latest.activeId !== activeId || latest.entries[activeId]?.stoken !== account.stoken) {
    throw new Error('查询期间米游社账号发生切换，请重新计算。');
  }
  return {uid, region, materials, itemCount: items.length};
}
