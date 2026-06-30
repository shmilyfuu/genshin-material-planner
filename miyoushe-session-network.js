function cookieHeader(session, kind = 'all') {
  const pairs = [];
  const cookieMap = session.cookieMap || {};
  const appendCookie = (name, fallback = '') => {
    const value = cookieMap[name] || fallback;
    if (value) pairs.push(`${name}=${value}`);
  };

  if (kind === 'stoken' || kind === 'all') {
    appendCookie('stuid', session.stuid);
    appendCookie('stoken_v2');
    appendCookie('stoken', session.stoken);
    appendCookie('mid', session.mid);
  }
  if (kind === 'record' || kind === 'all') {
    appendCookie('account_id_v2');
    appendCookie('account_id', session.accountId);
    appendCookie('account_mid_v2');
    appendCookie('cookie_token_v2');
    appendCookie('cookie_token', session.cookieToken);
    appendCookie('ltuid_v2');
    appendCookie('ltuid', session.ltuid);
    appendCookie('ltoken_v2');
    appendCookie('ltoken', session.ltoken);
  }
  return [...new Set(pairs)].join('; ');
}

async function requestWithCookies(url, session, kind, options = {}) {
  const headers = {
    Cookie: cookieHeader(session, kind),
    Origin: options.origin || 'https://webstatic.mihoyo.com',
    Referer: options.referer || 'https://webstatic.mihoyo.com/',
    'User-Agent': MYS_USER_AGENT
  };
  return withRequestHeaders(url, headers, () => fetchJson(url, { ...options, credentials: 'omit' }));
}

async function obtainDeviceFp(device) {
  if (device.deviceFp) return device.deviceFp;
  const body = {
    device_id: device.deviceId,
    seed_id: device.seedId,
    seed_time: String(Date.now()),
    platform: '4',
    device_fp: randomId(13),
    app_name: 'bbs_cn',
    ext_fields: JSON.stringify({ userAgent: MYS_USER_AGENT }),
    bbs_device_id: device.deviceId
  };
  const { payload } = await fetchJson(MYS_ENDPOINTS.deviceFp, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (payload.retcode !== 0 || !payload.data?.device_fp) throw apiError(payload, '无法获取米游社设备指纹');
  device.deviceFp = payload.data.device_fp;
  await chrome.storage.local.set({ [MYS_DEVICE_KEY]: device });
  return device.deviceFp;
}

async function enrichSessionTokens(session) {
  const stokenCookie = cookieHeader(session, 'stoken');
  if (!stokenCookie) throw new Error('登录结果缺少 SToken。');

  const commonHeaders = {
    'Content-Type': 'application/json',
    Accept: '*/*',
    'x-rpc-app_id': 'bll8iq97cem8',
    'x-rpc-app_version': MYS_APP_VERSION,
    'x-rpc-client_type': '2',
    'x-rpc-device_id': session.deviceId,
    'x-rpc-device_fp': session.deviceFp,
    'x-rpc-game_biz': 'bbs_cn',
    'x-rpc-sdk_version': '2.16.0'
  };

  const ltokenResult = await requestWithCookies(MYS_ENDPOINTS.getLToken, session, 'stoken', {
    method: 'GET',
    headers: commonHeaders,
    origin: 'https://app.mihoyo.com',
    referer: 'https://app.mihoyo.com/'
  });
  const ltokenData = ltokenResult.payload.data || {};
  if (ltokenResult.payload.retcode !== 0 || !(ltokenData.ltoken || ltokenData.ltoken_v2)) {
    throw apiError(ltokenResult.payload, '无法获取 LToken');
  }
  session.ltoken = ltokenData.ltoken || ltokenData.ltoken_v2;
  session.ltuid = session.stuid;

  const cookieResult = await requestWithCookies(MYS_ENDPOINTS.getCookieToken, session, 'stoken', {
    method: 'GET',
    headers: commonHeaders,
    origin: 'https://app.mihoyo.com',
    referer: 'https://app.mihoyo.com/'
  });
  const cookieData = cookieResult.payload.data || {};
  if (cookieResult.payload.retcode !== 0 || !(cookieData.cookie_token || cookieData.cookie_token_v2)) {
    throw apiError(cookieResult.payload, '无法获取 Cookie Token');
  }
  session.cookieToken = cookieData.cookie_token || cookieData.cookie_token_v2;
  session.accountId = cookieData.uid || cookieData.account_id || session.stuid;
  return session;
}
