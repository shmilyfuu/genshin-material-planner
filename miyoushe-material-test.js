'use strict';

const MYS_CALC_ROOT = MYS.takumi + '/event/e20200928calculate';
const MYS_CALC_CONTEXT = {
  origin: 'https://act.mihoyo.com',
  referrer: 'https://act.mihoyo.com/ys/event/calculator/index.html'
};

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
  const steps = {
    '/v1/avatar/list': '读取角色目录',
    '/v1/weapon/list': '读取武器目录',
    '/v3/batch_compute': '计算养成材料'
  };
  try {
    return await mysCookieRequest(MYS_CALC_ROOT + path, cookie, {
      method: 'POST', headers, body: JSON.stringify(body)
    }, MYS_CALC_CONTEXT);
  } catch (error) {
    throw new Error((steps[path] || '材料接口') + '（' + path + '）失败：'
      + String(error?.message || error));
  }
}

function mysCalcSample(characters, weapons, limit = 20) {
  const available = characters.filter((character) =>
    Number.isInteger(Number(character.id)) &&
    Number(character.id) > 0 &&
    Array.isArray(character.skill_list) &&
    character.skill_list.some((skill) => Number(skill.max_level) >= 10) &&
    ![10000005, 10000007, 10000117, 10000118].includes(Number(character.id)) &&
    character.name !== '旅行者'
  );
  const buckets = new Map();
  for (const character of available) {
    const category = Number(character.weapon_cat_id) || 0;
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push(character);
  }
  const selected = [];
  const categories = [...buckets.keys()].sort((a, b) => a - b);
  while (selected.length < limit && categories.some((category) => buckets.get(category).length)) {
    for (const category of categories) {
      if (selected.length >= limit) break;
      const character = buckets.get(category).shift();
      if (character) selected.push(character);
    }
  }
  const weaponsByCategory = new Map();
  for (const weapon of weapons) {
    const category = Number(weapon.weapon_cat_id) || 0;
    if (!weaponsByCategory.has(category)) weaponsByCategory.set(category, []);
    weaponsByCategory.get(category).push(weapon);
  }
  const weaponPositions = new Map();
  let weaponsIncluded = 0;
  const items = selected.map((character) => {
    const item = {
      avatar_id: Number(character.id),
      avatar_level_current: 1,
      avatar_level_target: 90,
      avatar_promote_level: 0,
      element_attr_id: character.element_attr_id,
      from_user_sync: false,
      skill_list: character.skill_list
        .filter((skill) => Number(skill.max_level) >= 10 && Number(skill.group_id || skill.id) > 0)
        .map((skill) => ({ id: Number(skill.group_id || skill.id), level_current: 1, level_target: 10 }))
    };
    const category = Number(character.weapon_cat_id) || 0;
    const matching = weaponsByCategory.get(category) || [];
    if (matching.length) {
      const offset = weaponPositions.get(category) || 0;
      const weapon = matching[offset % matching.length];
      weaponPositions.set(category, offset + 1);
      item.weapon = {
        id: Number(weapon.id), level_current: 1,
        level_target: Math.min(90, Number(weapon.max_level) || 90)
      };
      weaponsIncluded++;
    }
    return item;
  });
  return { items, weaponsIncluded };
}

async function mysMaterials(uid, region) {
  const roles = await mysRoles();
  const role = roles.find((entry) => entry.uid === uid && entry.region === region);
  if (!role) throw new Error('所选 UID 与当前米游社账号不匹配，请重新验证账号。');
  const accounts = await mysReadAccounts();
  const accountId = accounts.activeId;
  const account = accounts.entries[accountId];
  const cookie = mysAccountCookie(account);
  const device = await mysFingerprint(await mysDevice());
  const headers = mysCalcHeaders(device);

  const avatarResponse = await mysCalcPost('/v1/avatar/list', {
    page: 1, size: 200, is_all: true, lang: 'zh-cn'
  }, cookie, headers);
  const avatars = avatarResponse?.data?.list;
  if (!Array.isArray(avatars)) throw new Error('官方角色目录格式异常。');

  // Weapon lookup is optional for this read-only validation.
  let weapons = [];
  let weaponWarning = '';
  try {
    const response = await mysCalcPost('/v1/weapon/list', {
      page: 1, size: 1000, weapon_levels: [1, 2, 3, 4, 5], lang: 'zh-cn'
    }, cookie, headers);
    if (!Array.isArray(response?.data?.list)) throw new Error('武器目录格式异常');
    weapons = response.data.list.filter((weapon) => Number(weapon.id) > 0);
  } catch (error) {
    weaponWarning = String(error?.message || error);
  }

  const sample = mysCalcSample(avatars, weapons);
  if (!sample.items.length) throw new Error('官方角色目录中缺少可用于测试的养成项目。');
  const result = await mysCalcPost('/v3/batch_compute', {
    items: sample.items, uid, region, lang: 'zh-cn'
  }, cookie, headers);
  if (result?.data?.has_user_info === false) {
    throw new Error('官方计算结果未包含该 UID 的背包信息，请确认米游社养成计算器能读取该 UID 的数据。');
  }
  const consume = result?.data?.overall_consume;
  if (!Array.isArray(consume)) throw new Error('官方计算结果缺少 overall_consume 材料列表。');

  const materials = consume.map((material) => {
    const total = Number(material.num);
    const lack = Number(material.lack_num);
    const id = Number(material.id);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(total) || !Number.isFinite(lack)
      || total < 0 || lack < 0 || lack > total) return null;
    return {
      id,
      name: String(material.name || ('素材 ' + id)),
      total,
      lack,
      estimatedOwned: total - lack
    };
  }).filter(Boolean).sort((a, b) => a.id - b.id);
  if (!materials.length) throw new Error('官方计算结果中没有可验证的材料数据。');

  const latest = await mysReadAccounts();
  if (latest.activeId !== accountId || latest.entries[accountId]?.stoken !== account.stoken) {
    throw new Error('读取期间账号发生切换，请重新查询。');
  }
  return {
    uid,
    region,
    avatarCount: sample.items.length,
    weaponCount: sample.weaponsIncluded,
    weaponWarning,
    materials
  };
}
