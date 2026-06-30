let currentQrDeviceId = '';

async function createQrLogin() {
  const device = await getDeviceProfile();
  currentQrDeviceId = randomId(53);
  const body = '{}';
  const { payload } = await fetchJson(MYS_ENDPOINTS.createQr, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-rpc-app_id': 'ddxf5dufpuyo',
      'x-rpc-client_type': '3',
      'x-rpc-device_id': currentQrDeviceId
    },
    body
  });
  if (payload.retcode !== 0 || !payload.data?.url || !payload.data?.ticket) throw apiError(payload, '无法创建米游社二维码登录');
  return { url: payload.data.url, ticket: payload.data.ticket, deviceId: device.deviceId };
}

async function queryQrLogin(ticket) {
  if (!ticket) throw new Error('二维码登录票据不存在。');
  if (!currentQrDeviceId) throw new Error('二维码登录设备标识不存在，请重新生成二维码。');
  const body = JSON.stringify({ ticket });
  const { payload } = await fetchJson(MYS_ENDPOINTS.queryQr, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-rpc-app_id': 'ddxf5dufpuyo',
      'x-rpc-client_type': '3',
      'x-rpc-device_id': currentQrDeviceId
    },
    body
  });
  if (payload.retcode !== 0) throw apiError(payload, '查询二维码状态失败');
  const status = String(payload.data?.status || 'Pending');
  if (status.toLowerCase() !== 'confirmed') return { status };

  const token = payload.data.tokens?.find((row) => Number(row.token_type) === 1)?.token;
  if (!token || !payload.data.user_info?.aid) throw new Error('二维码已确认，但返回数据缺少登录令牌。');
  const device = await getDeviceProfile();
  const deviceFp = await obtainDeviceFp(device);
  const session = {
    stuid: String(payload.data.user_info.aid),
    mid: String(payload.data.user_info.mid || ''),
    stoken: String(token),
    deviceId: device.deviceId,
    deviceFp,
    accountLabel: payload.data.user_info.email || payload.data.user_info.mobile || `米游社 ${payload.data.user_info.aid}`,
    createdAt: Date.now()
  };
  await enrichSessionTokens(session);
  await chrome.storage.session.set({ [MYS_SESSION_KEY]: session });
  return { status: 'Confirmed', session: publicSession(session) };
}

function publicSession(session) {
  if (!session) return null;
  return {
    loggedIn: Boolean(session.stoken && session.cookieToken),
    accountLabel: session.accountLabel || `米游社 ${session.stuid || ''}`,
    accountId: session.stuid || '',
    selectedUid: session.selectedUid || '',
    createdAt: session.createdAt || 0
  };
}

async function getSession() {
  const stored = await chrome.storage.session.get(MYS_SESSION_KEY);
  return stored[MYS_SESSION_KEY] || null;
}

async function saveSession(session) {
  await chrome.storage.session.set({ [MYS_SESSION_KEY]: session });
}
