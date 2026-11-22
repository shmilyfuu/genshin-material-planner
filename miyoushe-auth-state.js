'use strict';

async function mysReadAccounts() {
  const result = await chrome.storage.local.get(MYS.accountKey);
  const data = result[MYS.accountKey];
  return data && typeof data === 'object' && data.entries && typeof data.entries === 'object'
    ? data : { activeId: '', entries: {} };
}

async function mysSaveAccounts(accounts) {
  await chrome.storage.local.set({ [MYS.accountKey]: accounts });
}

function mysPublicAccounts(accounts) {
  return {
    activeId: accounts.activeId,
    entries: Object.values(accounts.entries).map((entry) => ({
      id: entry.id,
      label: entry.label,
      lastLoginAt: entry.lastLoginAt || 0,
      lastRefreshAt: entry.lastRefreshAt || 0,
      hasStoken: Boolean(entry.stoken),
      hasCookie: Boolean(entry.cookieToken)
    }))
  };
}

async function mysStartQr() {
  const device = await mysFingerprint(await mysDevice());
  const body = '{}';
  const result = await mysJson(MYS.passport + '/account/ma-cn-passport/app/createQRLogin', {
    method: 'POST', headers: mysQrHeaders(device, body), body
  });
  const ticket = String(result?.data?.ticket || '');
  const url = String(result?.data?.url || '');
  if (!ticket || !url.startsWith('https://')) throw new Error('二维码接口返回内容不完整。');
  await chrome.storage.session.set({
    [MYS.qrKey]: { ticket, deviceId: device.id, createdAt: Date.now() }
  });
  return { url, ticket };
}

async function mysPollQr(ticket) {
  const stored = await chrome.storage.session.get(MYS.qrKey);
  const pending = stored[MYS.qrKey];
  if (!pending || pending.ticket !== ticket || Date.now() - pending.createdAt > 180000) {
    throw new Error('二维码已过期，请重新生成。');
  }

  const device = await mysDevice();
  if (device.id !== pending.deviceId) throw new Error('设备信息已改变，请重新扫码。');
  const body = JSON.stringify({ ticket });
  const result = await mysJson(MYS.passport + '/account/ma-cn-passport/app/queryQRLoginStatus', {
    method: 'POST', headers: mysQrHeaders(device, body), body
  });
  const status = String(result?.data?.status || 'Init');
  if (status !== 'Confirmed') return { status };

  const user = result.data?.user_info || {};
  const token = result.data?.tokens?.find((entry) => Number(entry.token_type) === 1);
  const id = String(user.aid || '');
  const mid = String(user.mid || '');
  const stoken = String(token?.token || '');
  if (!id || !mid || !stoken) throw new Error('确认成功，账号凭证数据不完整。');

  const accounts = await mysReadAccounts();
  accounts.entries[id] = {
    ...accounts.entries[id],
    id, mid, stoken,
    label: '米游社 ' + id,
    lastLoginAt: Date.now(),
    // A changed SToken may invalidate a previous short-lived cookie.
    cookieToken: '', ltoken: '', lastRefreshAt: 0
  };
  accounts.activeId = id;
  await mysSaveAccounts(accounts);
  await chrome.storage.session.remove(MYS.qrKey);

  let warning = '';
  try {
    await mysRefresh(id);
  } catch (error) {
    warning = String(error?.message || error);
  }
  return { status: 'Confirmed', warning, accounts: mysPublicAccounts(await mysReadAccounts()) };
}

async function mysRefresh(id) {
  const accounts = await mysReadAccounts();
  const account = accounts.entries[id];
  if (!account?.stoken || !account.mid) throw new Error('长期凭证缺失，请重新扫码登录。');
  if (!account.stoken.startsWith('v2_')) throw new Error('旧版凭证需要重新扫码登录。');

  const device = await mysFingerprint(await mysDevice());
  const [ltoken, cookieToken] = await Promise.all([
    mysExchange(device, account, 2),
    mysExchange(device, account, 4)
  ]);
  const latest = await mysReadAccounts();
  if (latest.entries[id]?.stoken !== account.stoken) throw new Error('账号凭证已发生变化。');
  latest.entries[id] = {
    ...latest.entries[id], ltoken, cookieToken, lastRefreshAt: Date.now()
  };
  await mysSaveAccounts(latest);
  return mysPublicAccounts(latest);
}

async function mysSwitch(id) {
  const accounts = await mysReadAccounts();
  if (!Object.hasOwn(accounts.entries, id)) throw new Error('指定账号不存在。');
  accounts.activeId = id;
  await mysSaveAccounts(accounts);
  return mysPublicAccounts(accounts);
}

async function mysRemove(id) {
  const accounts = await mysReadAccounts();
  if (!Object.hasOwn(accounts.entries, id)) throw new Error('指定账号不存在。');
  delete accounts.entries[id];
  if (accounts.activeId === id) accounts.activeId = Object.keys(accounts.entries)[0] || '';
  await mysSaveAccounts(accounts);
  return mysPublicAccounts(accounts);
}

async function mysRoles() {
  const accounts = await mysReadAccounts();
  const account = accounts.entries[accounts.activeId];
  if (!account) throw new Error('请先选择已登录账号。');
  if (!account.cookieToken || !account.ltoken) throw new Error('短期令牌缺失，请点击刷新凭证。');

  const cookie = [
    'account_id_v2=' + account.id,
    'account_mid_v2=' + account.mid,
    'cookie_token_v2=' + account.cookieToken,
    'ltuid_v2=' + account.id,
    'ltmid_v2=' + account.mid,
    'ltoken_v2=' + account.ltoken
  ].join('; ');
  const url = MYS.takumi + '/binding/api/getUserGameRolesByCookie?game_biz=hk4e_cn';
  const device = await mysDevice();
  const result = await mysCookieRequest(url, cookie, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'x-rpc-app_version': '2.106.2',
      'x-rpc-client_type': '5',
      'x-rpc-device_id': device.id,
      ...(device.fp ? { 'x-rpc-device_fp': device.fp } : {})
    }
  });
  if (!Array.isArray(result?.data?.list)) throw new Error('官方 UID 列表格式不符合预期。');
  return result.data.list
    .filter((entry) => entry.game_biz === 'hk4e_cn' || Number(entry.game_id) === 2)
    .map((entry) => ({
      uid: String(entry.game_uid || ''),
      nickname: String(entry.nickname || ''),
      region: String(entry.region || ''),
      regionName: String(entry.region_name || '')
    }))
    .filter((entry) => entry.uid);
}

async function mysAuthCommand(message) {
  switch (message.type) {
    case 'mys-auth:accounts':
      return { accounts: mysPublicAccounts(await mysReadAccounts()) };
    case 'mys-auth:start-qr':
      return { qr: await mysStartQr() };
    case 'mys-auth:poll-qr':
      return { login: await mysPollQr(String(message.ticket || '')) };
    case 'mys-auth:switch':
      return { accounts: await mysSwitch(String(message.id || '')) };
    case 'mys-auth:remove':
      return { accounts: await mysRemove(String(message.id || '')) };
    case 'mys-auth:refresh': {
      const accounts = await mysReadAccounts();
      return { accounts: await mysRefresh(String(message.id || accounts.activeId)) };
    }
    case 'mys-auth:roles':
      return { roles: await mysRoles() };
    default:
      throw new Error('未知登录操作。');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (typeof message?.type !== 'string' || !message.type.startsWith('mys-auth:')) return false;
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: '请求来源不受信任。' });
    return false;
  }
  mysAuthCommand(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});
