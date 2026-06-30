const MYS_LOGIN_URL = 'https://user.mihoyo.com/#/login/password';
const MYS_COOKIE_NAMES = new Set([
  'stuid', 'stoken', 'stoken_v2', 'mid',
  'ltuid', 'ltoken', 'ltuid_v2', 'ltoken_v2',
  'account_id', 'account_id_v2', 'account_mid_v2',
  'cookie_token', 'cookie_token_v2', 'login_ticket', 'login_uid'
]);

async function openOfficialLoginPage() {
  const tab = await chrome.tabs.create({ url: MYS_LOGIN_URL, active: true });
  return { tabId: tab.id || 0 };
}

async function importOfficialLoginSession() {
  const cookies = await chrome.cookies.getAll({ domain: '.mihoyo.com' });
  const cookieMap = {};
  for (const cookie of cookies) {
    if (MYS_COOKIE_NAMES.has(cookie.name) && cookie.value) cookieMap[cookie.name] = cookie.value;
  }

  const accountId = cookieMap.account_id_v2 || cookieMap.account_id || cookieMap.ltuid_v2 || cookieMap.ltuid || cookieMap.stuid || cookieMap.login_uid || '';
  const cookieToken = cookieMap.cookie_token_v2 || cookieMap.cookie_token || '';
  const ltoken = cookieMap.ltoken_v2 || cookieMap.ltoken || '';
  if (!accountId || (!cookieToken && !ltoken)) {
    throw new Error('未检测到可用的米游社登录会话。请在官方页面完成登录后再点击“读取登录状态”。');
  }

  const device = await getDeviceProfile();
  const deviceFp = await obtainDeviceFp(device);
  const session = {
    stuid: cookieMap.stuid || accountId,
    mid: cookieMap.mid || cookieMap.account_mid_v2 || '',
    stoken: cookieMap.stoken_v2 || cookieMap.stoken || '',
    accountId,
    cookieToken,
    ltuid: cookieMap.ltuid_v2 || cookieMap.ltuid || accountId,
    ltoken,
    cookieMap,
    deviceId: device.deviceId,
    deviceFp,
    accountLabel: `米游社 ${accountId}`,
    createdAt: Date.now()
  };
  await chrome.storage.session.set({ [MYS_SESSION_KEY]: session });
  return publicSession(session);
}
