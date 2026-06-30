'use strict';

const MYS_SESSION_KEY = 'miyousheImportSession';
const MYS_DEVICE_KEY = 'miyousheImportDevice';
const MYS_SELECTED_UID_KEY = 'miyousheImportSelectedUid';
const MYS_APP_VERSION = '2.95.1';
const MYS_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) miHoYoBBS/${MYS_APP_VERSION}`;
const MYS_X4_SALT = 'xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs';
const MYS_RSA_MODULUS = BigInt('0xc3bde91d3cc1cddc06219bfbe4b494fe609afb708e4372c34aa9db31e43657d200ee585b888f377006eb6b2183cd9912751bcc9b0c817ba035b6784a66e6c31b2fdcecf44c5709dbeaae7e75a842dbaa3d17c6d3132296821c5488e743df3e94c557d5edfe19b2570a24a0e5c59401200a7f900a01ace766c5a1832dca2fb111');
const MYS_RSA_EXPONENT = 65537n;
const MYS_RSA_SIZE = 128;

const MYS_ENDPOINTS = Object.freeze({
  deviceFp: 'https://public-data-api.mihoyo.com/device-fp/api/getFp',
  passwordLogin: 'https://passport-api.mihoyo.com/account/ma-cn-passport/app/loginByPassword',
  createQr: 'https://passport-api.mihoyo.com/account/ma-cn-passport/app/createQRLogin',
  queryQr: 'https://passport-api.mihoyo.com/account/ma-cn-passport/app/queryQRLoginStatus',
  getLToken: 'https://passport-api.mihoyo.com/account/auth/api/getLTokenBySToken',
  getCookieToken: 'https://passport-api.mihoyo.com/account/auth/api/getCookieAccountInfoBySToken',
  rolesByCookie: 'https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie?game_biz=hk4e_cn',
  characterList: 'https://api-takumi-record.mihoyo.com/game_record/app/genshin/api/character/list',
  characterDetail: 'https://api-takumi-record.mihoyo.com/game_record/app/genshin/api/character/detail'
});

let requestRuleChain = Promise.resolve();

function randomId(length, alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789') {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

function randomUuid() {
  return crypto.randomUUID().toLowerCase();
}

async function getDeviceProfile() {
  const stored = await chrome.storage.local.get(MYS_DEVICE_KEY);
  if (stored[MYS_DEVICE_KEY]?.deviceId) return stored[MYS_DEVICE_KEY];

  const profile = {
    deviceId: randomUuid(),
    seedId: randomUuid(),
    createdAt: Date.now()
  };
  await chrome.storage.local.set({ [MYS_DEVICE_KEY]: profile });
  return profile;
}

function bytesToBigInt(bytes) {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function bigIntToBytes(value, length) {
  const output = new Uint8Array(length);
  for (let index = length - 1; index >= 0; index -= 1) {
    output[index] = Number(value & 255n);
    value >>= 8n;
  }
  return output;
}

function modPow(base, exponent, modulus) {
  let result = 1n;
  base %= modulus;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus;
    exponent >>= 1n;
    base = (base * base) % modulus;
  }
  return result;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function rsaPkcs1Encrypt(value) {
  const message = new TextEncoder().encode(String(value));
  if (message.length > MYS_RSA_SIZE - 11) throw new Error('账号或密码长度超过登录接口限制。');

  const paddingLength = MYS_RSA_SIZE - message.length - 3;
  const padding = new Uint8Array(paddingLength);
  for (let index = 0; index < padding.length; index += 1) {
    let byte = 0;
    while (byte === 0) {
      const candidate = new Uint8Array(1);
      crypto.getRandomValues(candidate);
      byte = candidate[0];
    }
    padding[index] = byte;
  }

  const encoded = new Uint8Array(MYS_RSA_SIZE);
  encoded[0] = 0;
  encoded[1] = 2;
  encoded.set(padding, 2);
  encoded[2 + paddingLength] = 0;
  encoded.set(message, 3 + paddingLength);

  const encrypted = modPow(bytesToBigInt(encoded), MYS_RSA_EXPONENT, MYS_RSA_MODULUS);
  return bytesToBase64(bigIntToBytes(encrypted, MYS_RSA_SIZE));
}

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

function createDs(body = '', query = '') {
  const t = Math.floor(Date.now() / 1000);
  const r = String(100000 + Math.floor(Math.random() * 100000));
  const digest = md5(`salt=${MYS_X4_SALT}&t=${t}&r=${r}&b=${body}&q=${query}`);
  return `${t},${r},${digest}`;
}

function apiError(payload, fallback) {
  const code = payload?.retcode ?? payload?.status ?? payload?.code;
  const message = payload?.message || payload?.msg || payload?.data?.msg || fallback;
  const error = new Error(code === undefined ? message : `${message}（${code}）`);
  error.code = code;
  error.payload = payload;
  return error;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`米游社接口返回了无法解析的数据（HTTP ${response.status}）。`);
  }
  if (!response.ok) throw apiError(payload, `米游社接口请求失败（HTTP ${response.status}）`);
  return { payload, response };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function withRequestHeaders(url, headers, task) {
  const run = async () => {
    const ruleId = 800000 + Math.floor(Math.random() * 100000);
    const requestHeaders = Object.entries(headers)
      .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
      .map(([header, value]) => ({ header, operation: 'set', value: String(value) }));

    const rule = {
      id: ruleId,
      priority: 1000,
      action: { type: 'modifyHeaders', requestHeaders },
      condition: {
        regexFilter: `^${escapeRegex(url)}$`,
        resourceTypes: ['xmlhttprequest']
      }
    };

    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId], addRules: [rule] });
    try {
      return await task();
    } finally {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] }).catch(() => {});
    }
  };

  const result = requestRuleChain.then(run, run);
  requestRuleChain = result.catch(() => {});
  return result;
}
