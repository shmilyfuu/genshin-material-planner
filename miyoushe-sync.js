function gameRecordHeaders(session, body) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    DS: createDs(body, ''),
    'x-rpc-app_version': MYS_APP_VERSION,
    'x-rpc-client_type': '5',
    'x-rpc-device_id': session.deviceId,
    'x-rpc-device_fp': session.deviceFp
  };
}

async function getCharacterList(session, role) {
  const body = JSON.stringify({ sort_type: 1, role_id: role.uid, server: role.region });
  const { payload } = await requestWithCookies(MYS_ENDPOINTS.characterList, session, 'record', {
    method: 'POST',
    headers: gameRecordHeaders(session, body),
    body,
    origin: 'https://webstatic.mihoyo.com',
    referer: 'https://webstatic.mihoyo.com/'
  });
  if (payload.retcode !== 0 || !Array.isArray(payload.data?.list)) throw apiError(payload, '无法读取原神角色列表');
  return payload.data.list;
}

async function getCharacterDetails(session, role, characters) {
  const ids = characters.map((row) => Number(row.id)).filter(Number.isFinite);
  const batches = [];
  for (let index = 0; index < ids.length; index += 20) batches.push(ids.slice(index, index + 20));
  const details = [];
  for (const characterIds of batches) {
    const body = JSON.stringify({ sort_type: 1, character_ids: characterIds, role_id: role.uid, server: role.region });
    const { payload } = await requestWithCookies(MYS_ENDPOINTS.characterDetail, session, 'record', {
      method: 'POST',
      headers: gameRecordHeaders(session, body),
      body,
      origin: 'https://webstatic.mihoyo.com',
      referer: 'https://webstatic.mihoyo.com/'
    });
    if (payload.retcode !== 0 || !Array.isArray(payload.data?.list)) throw apiError(payload, '无法读取原神角色详情');
    details.push(...payload.data.list);
  }
  return details;
}

function normalizeCharacter(detail) {
  const base = detail.base || detail;
  const weapon = detail.weapon || base.weapon || null;
  const skills = Array.isArray(detail.skills) ? detail.skills : [];
  return {
    id: String(base.id || ''),
    name: base.name || '',
    level: Number(base.level || 0),
    constellation: Number(base.actived_constellation_num || 0),
    element: base.element || '',
    skills: skills.map((skill) => ({
      id: String(skill.skill_id || skill.id || ''),
      name: skill.name || '',
      type: Number(skill.skill_type || 0),
      level: Number(skill.level || 0)
    })),
    weapon: weapon ? {
      id: String(weapon.id || ''),
      name: weapon.name || '',
      level: Number(weapon.level || 0),
      refinement: Number(weapon.affix_level || 0),
      rarity: Number(weapon.rarity || 0),
      type: weapon.type || ''
    } : null
  };
}

async function syncRole(uid) {
  const session = await getSession();
  if (!session) throw new Error('请先登录米游社账号。');
  const roles = await loadGameRoles(session);
  const role = roles.find((row) => row.uid === String(uid)) || roles[0];
  if (!role) throw new Error('当前米游社账号没有绑定国服原神角色。');
  session.selectedUid = role.uid;
  await saveSession(session);
  await chrome.storage.local.set({ [MYS_SELECTED_UID_KEY]: role.uid });

  const characters = await getCharacterList(session, role);
  const details = await getCharacterDetails(session, role, characters);
  return {
    role,
    characters: details.map(normalizeCharacter),
    limitations: {
      fullWeaponInventory: false,
      fullMaterialInventory: false,
      note: '当前阶段已读取角色、天赋和角色当前装备武器；完整武器背包与材料背包仍在验证。'
    },
    syncedAt: Date.now()
  };
}

async function handleMiyousheMessage(message) {
  switch (message.type) {
    case 'miyoushe:status': {
      const session = await getSession();
      let roles = [];
      if (session) {
        try { roles = await loadGameRoles(session); } catch { roles = []; }
      }
      const selected = await chrome.storage.local.get(MYS_SELECTED_UID_KEY);
      return { ok: true, session: publicSession(session), roles, selectedUid: selected[MYS_SELECTED_UID_KEY] || '' };
    }
    case 'miyoushe:open-official-login':
      return { ok: true, result: await openOfficialLoginPage() };
    case 'miyoushe:import-official-login':
      return { ok: true, session: await importOfficialLoginSession() };
    case 'miyoushe:qr-create':
      return { ok: true, qr: await createQrLogin() };
    case 'miyoushe:qr-query':
      return { ok: true, result: await queryQrLogin(String(message.ticket || '')) };
    case 'miyoushe:roles': {
      const session = await getSession();
      if (!session) throw new Error('请先登录米游社账号。');
      return { ok: true, roles: await loadGameRoles(session) };
    }
    case 'miyoushe:sync':
      return { ok: true, data: await syncRole(message.uid) };
    case 'miyoushe:logout':
      await chrome.storage.session.remove(MYS_SESSION_KEY);
      return { ok: true };
    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type?.startsWith('miyoushe:')) return false;
  handleMiyousheMessage(message)
    .then((response) => sendResponse(response || { ok: false, error: '未知米游社操作。' }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: String(error?.message || error),
        code: error?.code ?? null,
        needsDeviceVerification: Boolean(error?.needsDeviceVerification),
        verifyHeaderAvailable: Boolean(error?.verifyHeader)
      });
    });
  return true;
});
