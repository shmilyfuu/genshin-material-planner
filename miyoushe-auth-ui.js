import { chooseInventoryUid, syncAccountMaterials } from './app.js';

const mysEl = (tag, text = '', cls = '') => {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (cls) el.className = cls;
  return el;
};

async function mysSend(type, fields = {}) {
  const response = await chrome.runtime.sendMessage({type: 'mys-auth:' + type, ...fields});
  if (!response?.ok) throw new Error(response?.error || '米游社服务无响应。');
  return response;
}

function mysBuild() {
  const target = document.querySelector('.inventory-body');
  if (!target || document.getElementById('mysAuthCard')) return;

  const panel = mysEl('section', '', 'mys-auth');
  panel.id = 'mysAuthCard';
  panel.append(mysEl('h3', '米游社背包同步', 'mys-auth-title'));

  const controls = mysEl('div', '', 'mys-auth-controls');
  const account = mysEl('select');
  account.id = 'mysAccountSelect';
  account.setAttribute('aria-label', '米游社账号');
  const qrButton = mysEl('button', '添加账号', 'button button-secondary');
  const refreshButton = mysEl('button', '刷新凭证', 'button button-secondary');
  const verifyButton = mysEl('button', '读取 UID', 'button button-secondary');
  const syncButton = mysEl('button', '同步背包', 'button button-primary');
  const removeButton = mysEl('button', '移除账号', 'button button-danger');
  controls.append(account, qrButton, refreshButton, verifyButton, syncButton, removeButton);
  panel.append(controls);

  const qrArea = mysEl('div', '', 'mys-auth-qr');
  qrArea.hidden = true;
  qrArea.append(mysEl('p', '使用手机米游社扫描二维码，在手机上确认登录。'));
  const qrImage = mysEl('img');
  qrImage.alt = '米游社登录二维码';
  qrImage.width = 220;
  qrImage.height = 220;
  const pollButton = mysEl('button', '检查扫码状态', 'button button-secondary');
  qrArea.append(qrImage, pollButton);
  panel.append(qrArea);

  const uidSelect = mysEl('select');
  uidSelect.hidden = true;
  uidSelect.setAttribute('aria-label', '游戏 UID');
  panel.append(uidSelect);
  const status = mysEl('p', '正在读取本机账号…', 'mys-auth-status');
  status.setAttribute('role', 'status');
  panel.append(status);
  panel.append(mysEl('p', '材料按 UID 和材料 ID 保存；基础与最低阶材料采用计算参考值，高阶材料可在下方手动填写。', 'mys-auth-description'));
  target.insertBefore(panel, target.firstChild);

  let ticket = '';
  let roles = [];
  let currentId = '';

  const message = (value, kind = 'info') => {
    status.textContent = value;
    status.dataset.tone = kind;
  };

  const setAccounts = (accounts) => {
    account.replaceChildren();
    const entries = accounts?.entries || [];
    if (!entries.length) account.append(new Option('尚未添加账号', ''));
    else {
      for (const entry of entries) account.append(new Option(entry.label, entry.id));
      account.value = accounts.activeId || entries[0].id;
    }
    currentId = account.value;
    refreshButton.disabled = removeButton.disabled = verifyButton.disabled = !currentId;
    uidSelect.hidden = true;
    uidSelect.replaceChildren();
    roles = [];
    syncButton.disabled = true;
  };

  const perform = async (button, callback) => {
    button.disabled = true;
    try { await callback(); }
    catch (error) { message(String(error?.message || error), 'error'); }
    finally {
      button.disabled = button === syncButton ? roles.length === 0 : false;
    }
  };

  account.addEventListener('change', () => void perform(account, async () => {
    chooseInventoryUid('');
    const response = await mysSend('switch', {id: account.value});
    setAccounts(response.accounts);
    message('已切换账号，请读取对应 UID。');
  }));

  qrButton.addEventListener('click', () => void perform(qrButton, async () => {
    message('正在请求登录二维码…');
    const response = await mysSend('start-qr');
    ticket = response.qr.ticket;
    globalThis.qrcode.stringToBytes = globalThis.qrcode.stringToBytesFuncs['UTF-8'];
    const code = globalThis.qrcode(0, 'M');
    code.addData(response.qr.url, 'Byte');
    code.make();
    qrImage.src = code.createDataURL(5, 12);
    qrArea.hidden = false;
    message('请扫码并在手机上确认。');
  }));

  pollButton.addEventListener('click', () => void perform(pollButton, async () => {
    if (!ticket) throw new Error('请先生成二维码。');
    const response = await mysSend('poll-qr', {ticket});
    if (response.login.status !== 'Confirmed') {
      message(response.login.status === 'Scanned' ? '已扫码，等待确认。' : '等待扫码或确认。');
      return;
    }
    ticket = '';
    qrArea.hidden = true;
    chooseInventoryUid('');
    setAccounts(response.login.accounts);
    message(response.login.warning || '登录完成，点击读取 UID。', response.login.warning ? 'error' : 'success');
  }));

  refreshButton.addEventListener('click', () => void perform(refreshButton, async () => {
    message('正在刷新账号凭证…');
    const response = await mysSend('refresh', {id: account.value});
    setAccounts(response.accounts);
    chooseInventoryUid('');
    message('账号凭证已刷新。', 'success');
  }));

  verifyButton.addEventListener('click', () => void perform(verifyButton, async () => {
    message('正在读取国服原神 UID…');
    const response = await mysSend('roles');
    roles = response.roles;
    uidSelect.replaceChildren();
    for (const role of roles) {
      uidSelect.append(new Option((role.nickname || '旅行者') + ' · ' + role.uid, role.uid));
    }
    uidSelect.hidden = roles.length === 0;
    syncButton.disabled = roles.length === 0;
    chooseInventoryUid(roles[0]?.uid || '');
    message(roles.length ? '已选择 UID ' + roles[0].uid + '，可同步背包。' : '账号未返回国服原神 UID。', roles.length ? 'success' : 'error');
  }));

  uidSelect.addEventListener('change', () => {
    chooseInventoryUid(uidSelect.value);
    message('已切换到 UID ' + uidSelect.value + '。');
  });

  syncButton.addEventListener('click', () => void perform(syncButton, async () => {
    const selected = roles.find((role) => role.uid === uidSelect.value);
    if (!selected || !account.value || account.value !== currentId) {
      throw new Error('请先验证账号并选择 UID。');
    }
    message('正在读取米游社材料…');
    const response = await mysSend('materials', {uid: selected.uid, region: selected.region});
    const summary = await syncAccountMaterials(selected.uid, response.materials.materials);
    message('UID ' + selected.uid + ' · 已读取 ' + summary.received
      + ' 种材料 · 当前对象 ' + summary.applied + ' 项有计算参考值。', 'success');
  }));

  removeButton.addEventListener('click', () => void perform(removeButton, async () => {
    if (!account.value || !window.confirm('移除此米游社账号及其登录令牌？')) return;
    const response = await mysSend('remove', {id: account.value});
    chooseInventoryUid('');
    setAccounts(response.accounts);
    message('账号已移除。', 'success');
  }));

  void mysSend('accounts').then((response) => {
    setAccounts(response.accounts);
    message(response.accounts.entries.length ? '已恢复账号，点击读取 UID。' : '尚未添加米游社账号。');
  }).catch((error) => message(String(error?.message || error), 'error'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mysBuild, {once: true});
} else {
  mysBuild();
}
