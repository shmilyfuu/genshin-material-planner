'use strict';

const MYS = {
  passport: 'https://passport-api.mihoyo.com',
  takumi: 'https://api-takumi.mihoyo.com',
  accountKey: 'mysAuthAccounts',
  deviceKey: 'mysAuthDevice',
  qrKey: 'mysAuthQr',
  appId: 'bll8iq97cem8',
  appVersion: '2.90.1',
  sdkVersion: '2.44.0',
  exchangeSalt: 'JwYDpKvLj6MrMqqYU6jTKF17KNO2PXoS',
  x4Salt: 'xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs'
};
const MYS_RULE_ID = 731001;
const MYS_LIFECYCLE = crypto.randomUUID();
let mysHeaderQueue = Promise.resolve();
const mysHeaderReady = chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [MYS_RULE_ID] }).catch(() => {});
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});

function mysRandom(length, chars = 'abcdefghijklmnopqrstuvwxyz0123456789') {
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => chars[value % chars.length]).join('');
}

async function mysDevice() {
  const stored = await chrome.storage.local.get(MYS.deviceKey);
  if (stored[MYS.deviceKey]?.id) return stored[MYS.deviceKey];
  const device = {
    id: crypto.randomUUID(),
    model: '23127PN0CC',
    name: 'Xiaomi 23127PN0CC',
    androidId: mysRandom(16, '0123456789abcdef'),
    oaid: crypto.randomUUID(),
    fp: ''
  };
  await chrome.storage.local.set({ [MYS.deviceKey]: device });
  return device;
}

async function mysJson(url, init) {
  let response;
  try {
    response = await fetch(url, { credentials: 'omit', cache: 'no-store', ...init });
  } catch (error) {
    throw new Error('网络请求失败：' + String(error?.message || error));
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('接口返回格式错误（HTTP ' + response.status + '）。');
  }
  if (!response.ok || payload?.retcode !== 0) {
    throw new Error('米游社接口错误 ' + (payload?.retcode ?? response.status) + '：' + String(payload?.message || '请求失败'));
  }
  return payload;
}

async function mysFingerprint(device) {
  if (device.fp) return device;
  const fields = {
    oaid: device.oaid, board: 'pineapple', brand: 'Xiaomi',
    manufacturer: 'Xiaomi', model: device.model, osVersion: '14',
    sdkVersion: '34', packageName: 'com.mihoyo.hyperion', packageVersion: '2.106.2'
  };
  try {
    const payload = await mysJson('https://public-data-api.mihoyo.com/device-fp/api/getFp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: device.androidId, seed_id: crypto.randomUUID(),
        seed_time: String(Date.now()), platform: '2',
        device_fp: mysRandom(13, '0123456789abcdef'),
        app_name: 'bbs_cn', ext_fields: JSON.stringify(fields),
        bbs_device_id: device.id
      })
    });
    const fp = String(payload?.data?.device_fp || '');
    if (String(payload?.data?.code) === '200' && /^[a-f0-9]{13}$/i.test(fp)) {
      device.fp = fp;
      await chrome.storage.local.set({ [MYS.deviceKey]: device });
    }
  } catch {
    // A valid server-issued fingerprint is optional; omit the header when unavailable.
  }
  return device;
}

function mysDeviceHeaders(device) {
  return {
    'x-rpc-device_id': device.id,
    'x-rpc-device_model': device.model,
    'x-rpc-device_name': device.name,
    ...(device.fp ? { 'x-rpc-device_fp': device.fp } : {})
  };
}

function mysSignature(body, mode) {
  const t = String(Math.floor(Date.now() / 1000));
  const r = mode === 'exchange' ? mysRandom(6) : String(100000 + Math.floor(Math.random() * 100001));
  const salt = mode === 'exchange' ? MYS.exchangeSalt : MYS.x4Salt;
  return t + ',' + r + ',' + md5('salt=' + salt + '&t=' + t + '&r=' + r + '&b=' + body + '&q=');
}

function mysQrHeaders(device, body) {
  return {
    'Accept': '*/*',
    'Content-Type': 'application/json; charset=UTF-8',
    'User-Agent': 'Mozilla/5.0 miHoYoBBS/' + MYS.appVersion + ' Capture/2.2.0',
    'DS': mysSignature(body, 'x4'),
    'x-rpc-client_type': '3',
    'x-rpc-app_version': MYS.appVersion,
    'x-rpc-app_id': MYS.appId,
    'x-rpc-sdk_version': MYS.appVersion,
    'x-rpc-account_version': MYS.appVersion,
    'x-rpc-game_biz': 'bbs_cn',
    ...mysDeviceHeaders(device)
  };
}

async function mysExchange(device, account, target) {
  const body = JSON.stringify({
    dst_token_type: target,
    src_token: { token: account.stoken, token_type: 1 },
    mid: account.mid
  });
  const payload = await mysJson(MYS.passport + '/account/ma-cn-session/app/exchange', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; ' + device.model + ') AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.129 Mobile Safari/537.36 miHoYoBBS/2.106.2',
      'DS': mysSignature(body, 'exchange'),
      'x-rpc-app_id': MYS.appId,
      'x-rpc-app_version': '2.106.2',
      'x-rpc-client_type': '2',
      'x-rpc-game_biz': 'bbs_cn',
      'x-rpc-sdk_version': MYS.sdkVersion,
      'x-rpc-account_version': MYS.sdkVersion,
      'x-rpc-lifecycle_id': MYS_LIFECYCLE,
      ...mysDeviceHeaders(device)
    },
    body
  });
  const token = String(payload?.data?.token?.token || '');
  if (!token) throw new Error('令牌接口未返回有效凭证。');
  return token;
}

function mysQuoteRegex(value) {
  return Array.from(String(value), (char) => '.*+?^$()[]{}|\\'.includes(char) ? '\\' + char : char).join('');
}

async function mysCookieRequest(url, cookie, init) {
  const run = async () => {
    await mysHeaderReady;
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [MYS_RULE_ID],
      addRules: [{
        id: MYS_RULE_ID,
        priority: 10,
        action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Cookie', operation: 'set', value: cookie }] },
        condition: { regexFilter: '^' + mysQuoteRegex(url) + '$', resourceTypes: ['xmlhttprequest'] }
      }]
    });
    try {
      return await mysJson(url, init);
    } finally {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [MYS_RULE_ID] });
    }
  };
  const pending = mysHeaderQueue.then(run, run);
  mysHeaderQueue = pending.catch(() => {});
  return pending;
}
