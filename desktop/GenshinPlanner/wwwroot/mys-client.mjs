import {buildInventoryRequests} from './mys-inventory.mjs';
import {readInventoryObservation,buildRecoveryCatalog,recoverMaterialFamily,recoverInventory,buildFamilyProbe} from './inventory-recovery.mjs';
import {buildDiagnosticCases,captureDiagnosticResponse,weaponMatchesFamily,DIAGNOSTIC_FAMILY_IDS,DIAGNOSTIC_KNOWN_NAMES} from './inventory-diagnostics.mjs';
'use strict';

function add32(a, b) {
  return (a + b) & 0xffffffff;
}

function cmn(q, a, b, x, s, t) {
  a = add32(add32(a, q), add32(x, t));
  return add32((a << s) | (a >>> (32 - s)), b);
}

function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }

function md5cycle(state, block) {
  let [a, b, c, d] = state;

  a = ff(a, b, c, d, block[0], 7, -680876936); d = ff(d, a, b, c, block[1], 12, -389564586); c = ff(c, d, a, b, block[2], 17, 606105819); b = ff(b, c, d, a, block[3], 22, -1044525330);
  a = ff(a, b, c, d, block[4], 7, -176418897); d = ff(d, a, b, c, block[5], 12, 1200080426); c = ff(c, d, a, b, block[6], 17, -1473231341); b = ff(b, c, d, a, block[7], 22, -45705983);
  a = ff(a, b, c, d, block[8], 7, 1770035416); d = ff(d, a, b, c, block[9], 12, -1958414417); c = ff(c, d, a, b, block[10], 17, -42063); b = ff(b, c, d, a, block[11], 22, -1990404162);
  a = ff(a, b, c, d, block[12], 7, 1804603682); d = ff(d, a, b, c, block[13], 12, -40341101); c = ff(c, d, a, b, block[14], 17, -1502002290); b = ff(b, c, d, a, block[15], 22, 1236535329);

  a = gg(a, b, c, d, block[1], 5, -165796510); d = gg(d, a, b, c, block[6], 9, -1069501632); c = gg(c, d, a, b, block[11], 14, 643717713); b = gg(b, c, d, a, block[0], 20, -373897302);
  a = gg(a, b, c, d, block[5], 5, -701558691); d = gg(d, a, b, c, block[10], 9, 38016083); c = gg(c, d, a, b, block[15], 14, -660478335); b = gg(b, c, d, a, block[4], 20, -405537848);
  a = gg(a, b, c, d, block[9], 5, 568446438); d = gg(d, a, b, c, block[14], 9, -1019803690); c = gg(c, d, a, b, block[3], 14, -187363961); b = gg(b, c, d, a, block[8], 20, 1163531501);
  a = gg(a, b, c, d, block[13], 5, -1444681467); d = gg(d, a, b, c, block[2], 9, -51403784); c = gg(c, d, a, b, block[7], 14, 1735328473); b = gg(b, c, d, a, block[12], 20, -1926607734);

  a = hh(a, b, c, d, block[5], 4, -378558); d = hh(d, a, b, c, block[8], 11, -2022574463); c = hh(c, d, a, b, block[11], 16, 1839030562); b = hh(b, c, d, a, block[14], 23, -35309556);
  a = hh(a, b, c, d, block[1], 4, -1530992060); d = hh(d, a, b, c, block[4], 11, 1272893353); c = hh(c, d, a, b, block[7], 16, -155497632); b = hh(b, c, d, a, block[10], 23, -1094730640);
  a = hh(a, b, c, d, block[13], 4, 681279174); d = hh(d, a, b, c, block[0], 11, -358537222); c = hh(c, d, a, b, block[3], 16, -722521979); b = hh(b, c, d, a, block[6], 23, 76029189);
  a = hh(a, b, c, d, block[9], 4, -640364487); d = hh(d, a, b, c, block[12], 11, -421815835); c = hh(c, d, a, b, block[15], 16, 530742520); b = hh(b, c, d, a, block[2], 23, -995338651);

  a = ii(a, b, c, d, block[0], 6, -198630844); d = ii(d, a, b, c, block[7], 10, 1126891415); c = ii(c, d, a, b, block[14], 15, -1416354905); b = ii(b, c, d, a, block[5], 21, -57434055);
  a = ii(a, b, c, d, block[12], 6, 1700485571); d = ii(d, a, b, c, block[3], 10, -1894986606); c = ii(c, d, a, b, block[10], 15, -1051523); b = ii(b, c, d, a, block[1], 21, -2054922799);
  a = ii(a, b, c, d, block[8], 6, 1873313359); d = ii(d, a, b, c, block[15], 10, -30611744); c = ii(c, d, a, b, block[6], 15, -1560198380); b = ii(b, c, d, a, block[13], 21, 1309151649);
  a = ii(a, b, c, d, block[4], 6, -145523070); d = ii(d, a, b, c, block[11], 10, -1120210379); c = ii(c, d, a, b, block[2], 15, 718787259); b = ii(b, c, d, a, block[9], 21, -343485551);

  state[0] = add32(state[0], a);
  state[1] = add32(state[1], b);
  state[2] = add32(state[2], c);
  state[3] = add32(state[3], d);
}

function md5block(bytes, offset) {
  const block = new Array(16).fill(0);
  for (let index = 0; index < 64; index += 1) {
    block[index >> 2] |= bytes[offset + index] << ((index % 4) * 8);
  }
  return block;
}

function md5(value) {
  const source = new TextEncoder().encode(String(value));
  const length = source.length;
  const paddedLength = (((length + 8) >> 6) + 1) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source);
  bytes[length] = 0x80;
  const bitLength = BigInt(length) * 8n;
  for (let index = 0; index < 8; index += 1) {
    bytes[paddedLength - 8 + index] = Number((bitLength >> BigInt(index * 8)) & 255n);
  }

  const state = [1732584193, -271733879, -1732584194, 271733878];
  for (let offset = 0; offset < paddedLength; offset += 64) md5cycle(state, md5block(bytes, offset));

  return state.map((word) => {
    let hex = '';
    for (let index = 0; index < 4; index += 1) hex += ((word >>> (index * 8)) & 255).toString(16).padStart(2, '0');
    return hex;
  }).join('');
}

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
const MYS_LIFECYCLE = crypto.randomUUID();
let native;
let sessionQr;
const storage={
  local:{
    async get(key){return {[key]:await native('mys.storage.load',{key})};},
    async set(record){for(const [key,value] of Object.entries(record))await native('mys.storage.save',{key,value});}
  },
  session:{
    async get(key){return {[key]:sessionQr};},
    async set(record){sessionQr=record[MYS.qrKey];},
    async remove(){sessionQr=null;}
  }
};
function mysRandom(length, chars = 'abcdefghijklmnopqrstuvwxyz0123456789') {
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => chars[value % chars.length]).join('');
}

async function mysDevice() {
  const stored = await storage.local.get(MYS.deviceKey);
  if (stored[MYS.deviceKey]?.id) return stored[MYS.deviceKey];
  const device = {
    id: crypto.randomUUID(),
    model: '23127PN0CC',
    name: 'Xiaomi 23127PN0CC',
    androidId: mysRandom(16, '0123456789abcdef'),
    oaid: crypto.randomUUID(),
    fp: ''
  };
  await storage.local.set({ [MYS.deviceKey]: device });
  return device;
}

async function mysJson(url, init) {
  const response=await native('mys.request',{url,method:init.method||'GET',headers:init.headers||{},body:init.body});
  const payload=response.payload;
  if (!response.ok || payload?.retcode !== 0) {
    throw new Error('HTTP '+response.status+'，米游社接口错误 '+(payload?.retcode ?? '未知')+'：'+String(payload?.message||'请求失败'));
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
      await storage.local.set({ [MYS.deviceKey]: device });
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

async function mysCookieRequest(url,cookie,init,requestContext=null){
  const headers={...init.headers,Cookie:cookie};
  if(requestContext){headers.Referer=requestContext.referrer;headers.Origin=requestContext.origin;}
  return mysJson(url,{...init,headers});
}

'use strict';

async function mysReadAccounts() {
  const result = await storage.local.get(MYS.accountKey);
  const data = result[MYS.accountKey];
  return data && typeof data === 'object' && data.entries && typeof data.entries === 'object'
    ? data : { activeId: '', entries: {} };
}

async function mysSaveAccounts(accounts) {
  await storage.local.set({ [MYS.accountKey]: accounts });
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
  await storage.session.set({
    [MYS.qrKey]: { ticket, deviceId: device.id, createdAt: Date.now() }
  });
  return { url, ticket };
}

async function mysPollQr(ticket) {
  const stored = await storage.session.get(MYS.qrKey);
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
  await storage.session.remove(MYS.qrKey);

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

function mysAccountCookie(account) {
  if (!account?.id || !account.mid || !account.cookieToken || !account.ltoken) {
    throw new Error('账号短期凭证缺失，请点击刷新凭证。');
  }
  return [
    'account_id_v2=' + account.id,
    'account_mid_v2=' + account.mid,
    'cookie_token_v2=' + account.cookieToken,
    'ltuid_v2=' + account.id,
    'ltmid_v2=' + account.mid,
    'ltoken_v2=' + account.ltoken
  ].join('; ');
}

async function mysRoles() {
  const accounts = await mysReadAccounts();
  const account = accounts.entries[accounts.activeId];
  if (!account) throw new Error('请先选择已登录账号。');
  if (!account.cookieToken || !account.ltoken) throw new Error('短期令牌缺失，请点击刷新凭证。');

  const cookie = mysAccountCookie(account);
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


async function mysAllWeapons(cookie,headers){
  const entries=[],seen=new Set(),size=100;
  for(let page=1;page<=30;page++){
    const response=await mysCalcPost('/v1/weapon/list',{page,size,weapon_levels:[1,2,3,4,5],lang:'zh-cn'},cookie,headers);
    const list=response?.data?.list;
    if(!Array.isArray(list))throw Error('米游社武器目录格式错误。');
    let fresh=0;
    for(const row of list){
      const id=Number(row?.id);
      if(!Number.isSafeInteger(id)||id<=0||seen.has(id))continue;
      entries.push(row);seen.add(id);fresh++;
    }
    if(Number(response?.data?.total)>0&&entries.length>=Number(response.data.total))return entries;
    if(list.length<size)return entries;
    if(!fresh)throw Error('米游社武器目录分页重复。');
  }
  throw Error('武器目录页数超过预期。');
}
async function syncInventory(uid,region,progress,loadProfile){
  const roles=await mysRoles();
  if(!roles.some(r=>r.uid===uid&&r.region===region))throw Error('所选 UID 与当前账号不匹配。');
  const accounts=await mysReadAccounts(),id=accounts.activeId,account=accounts.entries[id];
  const cookie=mysAccountCookie(account),device=await mysFingerprint(await mysDevice()),headers=mysCalcHeaders(device);
  progress?.('正在读取官方角色与武器目录…');
  const [avatars,weapons]=await Promise.all([mysAllCalculatorAvatars(cookie,headers),mysAllWeapons(cookie,headers)]);
  const plan=buildInventoryRequests(avatars,weapons);
  const profiles=new Map(),profileFailures=[],entries=[...avatars.map(row=>({kind:'character',row})),...weapons.map(row=>({kind:'weapon',row}))];
  let cursor=0,done=0;
  await Promise.all(Array.from({length:5},async()=>{
    while(cursor<entries.length){
      const {kind,row}=entries[cursor++];
      try{profiles.set(kind+':'+Number(row.id),await loadProfile(kind,row));}
      catch(e){profileFailures.push({kind,id:Number(row.id),name:String(row.name||''),error:String(e.message||e).slice(0,200)});}
      finally{done++;progress?.(`识别材料系列 ${done}/${entries.length}`);}
    }
  }));
  const catalog=buildRecoveryCatalog(avatars,weapons,profiles);
  if(!catalog.families.length)throw Error('未能识别材料系列，请刷新游戏资料后重试。');
  const observations=[],requestKeys=new Set(),probeErrors=[];
  let requests=0;
  const request=async items=>{
    const key=JSON.stringify(items);
    if(requestKeys.has(key))return;
    const response=await mysCalcPost('/v3/batch_compute',{items,uid,region,lang:'zh-cn'},cookie,headers);
    observations.push(readInventoryObservation(response));requestKeys.add(key);requests++;
  };
  let completed=0;
  for(const batch of plan.batches){
    progress?.(`读取基础需求 ${completed+1}/${plan.batches.length} · ${plan.characterCount} 名角色 / ${plan.weaponCount} 类武器`);
    try{await request(batch);}
    catch(e){
      if(batch.length<=30||/接口错误 -100|UID 库存/.test(e.message))throw e;
      for(let i=0;i<batch.length;i+=30)await request(batch.slice(i,i+30));
    }
    completed++;
  }
  // Use each family independently. Do not merge fulfilled demand across observations.
  // Prefer high-tier probes; only query lower tiers if the raw counts remain unresolved.
  for(const [index,group] of catalog.families.entries()){
    for(let tier=group.ids.length-1;tier>=0;tier--){
      const recovery=recoverMaterialFamily(group.ids,observations);
      if(recovery.complete||recovery.contradiction)break;
      if(recovery.lo[tier]===recovery.hi[tier])continue;
      const items=buildFamilyProbe(group,tier,avatars);
      if(!items.length||requestKeys.has(JSON.stringify(items)))continue;
      progress?.(`恢复材料库存 ${index+1}/${catalog.families.length} · 材料 ${group.ids[tier]}`);
      await new Promise(resolve=>setTimeout(resolve,500));
      try{await request(items);}
      catch(e){
        if(/接口错误 -100|UID 库存|HTTP 429|频繁|风控/.test(e.message))throw e;
        probeErrors.push({ids:group.ids,tier,error:String(e.message||e).slice(0,200)});
      }
    }
  }
  const recovered=recoverInventory(catalog,observations);
  const latest=await mysReadAccounts();
  if(latest.activeId!==id||latest.entries[id]?.stoken!==account.stoken)throw Error('查询期间登录账号发生变化。');
  if(!recovered.materials.length)throw Error('米游社未返回可确认的材料库存。');
  return {uid,region,replace:true,materials:recovered.materials,characterCount:plan.characterCount,weaponCount:plan.weaponCount,
    batches:requests,unresolved:recovered.unresolved,conflicts:recovered.conflicts,profileFailures,probeErrors};
}
async function diagnoseInventory(uid,region,progress,loadProfile){
  const roles=await mysRoles();
  if(!roles.some(r=>r.uid===uid&&r.region===region))throw Error('所选 UID 与当前账号不匹配。');
  const accounts=await mysReadAccounts(),id=accounts.activeId,account=accounts.entries[id];
  const cookie=mysAccountCookie(account),device=await mysFingerprint(await mysDevice()),headers=mysCalcHeaders(device);
  const report={schema:1,version:'0.4.4',startedAt:new Date().toISOString(),familyIds:[...DIAGNOSTIC_FAMILY_IDS],
    reference:{actualStockLowToHigh:[47,36,11,0],note:'此前测试时的库存，请与本次游戏实际背包核对。'},
    directory:{},cases:[]};
  const errorText=e=>String(e?.message||e).slice(0,500);
  try{
    progress?.('诊断：读取官方角色与武器目录…');
    const [avatars,weapons]=await Promise.all([mysAllCalculatorAvatars(cookie,headers),mysAllWeapons(cookie,headers)]);
    report.directory.characterCount=avatars.length;report.directory.weaponCount=weapons.length;
    // Check all official weapons against the current Nanoka detail data, using the existing local cache.
    const family=[],unresolved=[];let cursor=0,done=0;
    const candidates=weapons.filter(w=>Number(w.max_level||90)>40);
    const priority=new Set(DIAGNOSTIC_KNOWN_NAMES);
    candidates.sort((a,b)=>Number(priority.has(b.name))-Number(priority.has(a.name)));
    await Promise.all(Array.from({length:5},async()=>{
      while(cursor<candidates.length){
        const weapon=candidates[cursor++];
        try{
          const profile=await loadProfile(weapon);
          if(!profile?.materials?.weapGems?.every(Boolean)||profile.materials.weapGems.length!==4)throw Error('突破系列未识别');
          if(weaponMatchesFamily(profile))family.push({...weapon,familyDemand:profile.materials.weapGems.map(row=>Number(row.total))});
        }catch(e){unresolved.push({id:Number(weapon.id),name:String(weapon.name||''),error:errorText(e)});}
        finally{done++;progress?.(`诊断：核对武器突破系列 ${done}/${candidates.length}`);}
      }
    }));
    report.directory.scannedWeapons=candidates.length;
    report.directory.excludedLowLevel=weapons.length-candidates.length;
    family.sort((a,b)=>Number(a.id)-Number(b.id));
    report.directory.familyWeapons=family.map(w=>({id:Number(w.id),name:String(w.name||''),weaponCatId:Number(w.weapon_cat_id),maxLevel:Number(w.max_level)||90,demandLowToHigh:w.familyDemand}));
    report.directory.unresolved=unresolved;
    report.directory.coverageComplete=unresolved.length===0;
    const cases=buildDiagnosticCases(avatars,weapons,family);
    report.targetWeapon=cases[0].targetWeapon;
    const request=async items=>{
      const response=await mysCalcPost('/v3/batch_compute',{items,uid,region,lang:'zh-cn'},cookie,headers);
      return captureDiagnosticResponse(response);
    };
    for(const [index,test] of cases.entries()){
      progress?.(`诊断 ${index+1}/${cases.length}：${test.label}`);
      const entry={...test,request:{items:test.items,lang:'zh-cn'},requestedAt:new Date().toISOString()};
      delete entry.items;
      report.cases.push(entry);
      if(!test.items.length){entry.error='缺少可用角色载体';continue;}
      try{entry.response=await request(test.items);}
      catch(e){entry.error=errorText(e);}
      entry.finishedAt=new Date().toISOString();
      // Separate read-only diagnostic requests to reduce request bursts.
      if(index<cases.length-1)await new Promise(resolve=>setTimeout(resolve,1000));
    }
    const latest=await mysReadAccounts();
    if(latest.activeId!==id||latest.entries[id]?.stoken!==account.stoken)throw Error('诊断期间登录账号发生变化。');
  }catch(e){report.error=errorText(e);}
  report.finishedAt=new Date().toISOString();
  report.successfulCases=report.cases.filter(c=>c.response?.has_user_info===true&&Array.isArray(c.response?.overall_consume)).length;
  return report;
}
export function createMiyousheClient(bridge){
  native=bridge;
  return {accounts:async()=>mysPublicAccounts(await mysReadAccounts()),startQr:mysStartQr,pollQr:mysPollQr,
    refresh:mysRefresh,switchAccount:mysSwitch,remove:mysRemove,roles:mysRoles,syncInventory,diagnoseInventory};
}
