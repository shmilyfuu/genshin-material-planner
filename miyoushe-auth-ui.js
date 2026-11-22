import {
  chooseInventoryUid,
  getCalculationMode,
  getCalculationPlan,
  setOfficialCalculation
} from './app.js';

const mysEl = (tag, label = '', className = '') => {
  const element = document.createElement(tag);
  if (label) element.textContent = label;
  if (className) element.className = className;
  return element;
};

async function mysSend(type, fields = {}) {
  const response = await chrome.runtime.sendMessage({ type: 'mys-auth:' + type, ...fields });
  if (!response?.ok) throw new Error(response?.error || '米游社服务无响应。');
  return response;
}

function buildMiyoushePanel() {
  const target = document.querySelector('.inventory-body');
  if (!target || document.getElementById('mysAuthCard')) return;

  const panel = mysEl('section', '', 'mys-auth');
  panel.id = 'mysAuthCard';
  panel.hidden = getCalculationMode() !== 'official';

  const controls = mysEl('div', '', 'mys-auth-controls');
  const account = mysEl('select');
  account.id = 'mysAccountSelect';
  account.setAttribute('aria-label', '米游社账号');
  const addButton = mysEl('button', '添加账号', 'button button-secondary');
  const refreshButton = mysEl('button', '刷新凭证', 'button button-secondary');
  const verifyButton = mysEl('button', '读取 UID', 'button button-secondary');
  const calculateButton = mysEl('button', '计算缺口', 'button button-primary');
  const removeButton = mysEl('button', '移除账号', 'button button-danger');
  [addButton, refreshButton, verifyButton, calculateButton, removeButton].forEach(button => {
    button.type = 'button';
  });
  controls.append(account, addButton, refreshButton, verifyButton, calculateButton, removeButton);
  panel.append(controls);

  const qrArea = mysEl('div', '', 'mys-auth-qr');
  qrArea.hidden = true;
  qrArea.append(mysEl('p', '使用手机米游社扫描二维码，并确认登录。'));
  const image = mysEl('img');
  image.width = 220;
  image.height = 220;
  image.alt = '米游社登录二维码';
  const pollButton = mysEl('button', '检查扫码状态', 'button button-secondary');
  pollButton.type = 'button';
  qrArea.append(image, pollButton);
  panel.append(qrArea);

  const uidSelect = mysEl('select');
  uidSelect.hidden = true;
  uidSelect.setAttribute('aria-label', '原神 UID');
  panel.append(uidSelect);

  const status = mysEl('p', '正在读取本机账号…', 'mys-auth-status');
  status.setAttribute('role', 'status');
  panel.append(status);
  panel.append(mysEl('p',
    '官方目录已收录的目标使用米游社缺口；前瞻目标使用 Nanoka 需求。库存未知时可在结果中填写。',
    'mys-auth-description'));

  target.append(panel);
  let roles = [];
  let qrTicket = '';

  const message = (content, kind = 'info') => {
    status.textContent = content;
    status.dataset.tone = kind;
  };

  const refreshButtons = () => {
    const hasAccount = Boolean(account.value);
    const hasUid = Boolean(uidSelect.value && roles.some(role => role.uid === uidSelect.value));
    refreshButton.disabled = verifyButton.disabled = removeButton.disabled = !hasAccount;
    calculateButton.disabled = !hasAccount || !hasUid;
  };

  const showAccounts = (accounts) => {
    account.replaceChildren();
    const entries = accounts?.entries || [];
    if (!entries.length) {
      account.append(new Option('尚未添加账号', ''));
    } else {
      for (const entry of entries) {
        account.append(new Option(entry.label + (entry.hasCookie ? '' : ' · 待刷新'), entry.id));
      }
      account.value = accounts.activeId || entries[0].id;
    }
    roles = [];
    uidSelect.replaceChildren();
    uidSelect.hidden = true;
    refreshButtons();
  };

  const perform = async (button, fn) => {
    button.disabled = true;
    try {
      await fn();
    } catch (error) {
      message(String(error?.message || error), 'error');
    } finally {
      refreshButtons();
      if (button === addButton || button === pollButton || button === account) button.disabled = false;
    }
  };

  account.addEventListener('change', () => void perform(account, async () => {
    const response = await mysSend('switch', {id: account.value});
    showAccounts(response.accounts);
    chooseInventoryUid('');
    message('账号已切换，请读取对应的游戏 UID。');
  }));

  addButton.addEventListener('click', () => void perform(addButton, async () => {
    message('正在生成登录二维码…');
    const response = await mysSend('start-qr');
    qrTicket = response.qr.ticket;
    const qr = globalThis.qrcode;
    if (typeof qr !== 'function') throw new Error('二维码组件加载失败。');
    qr.stringToBytes = qr.stringToBytesFuncs['UTF-8'];
    const code = qr(0, 'M');
    code.addData(response.qr.url, 'Byte');
    code.make();
    image.src = code.createDataURL(5, 12);
    qrArea.hidden = false;
    message('请扫码并在手机上确认。');
  }));

  pollButton.addEventListener('click', () => void perform(pollButton, async () => {
    if (!qrTicket) throw new Error('请先生成二维码。');
    const response = await mysSend('poll-qr', {ticket: qrTicket});
    if (response.login.status !== 'Confirmed') {
      const descriptions = {Init: '等待扫码。', Scanned: '已扫码，等待手机确认。', Expired: '二维码已过期，请重新生成。'};
      message(descriptions[response.login.status] || '等待扫码确认。');
      return;
    }
    qrTicket = '';
    qrArea.hidden = true;
    chooseInventoryUid('');
    showAccounts(response.login.accounts);
    message(response.login.warning || '登录完成，请读取 UID。',
      response.login.warning ? 'error' : 'success');
  }));

  refreshButton.addEventListener('click', () => void perform(refreshButton, async () => {
    message('正在刷新凭证…');
    const response = await mysSend('refresh', {id: account.value});
    showAccounts(response.accounts);
    chooseInventoryUid('');
    message('凭证已刷新，请重新读取 UID。', 'success');
  }));

  verifyButton.addEventListener('click', () => void perform(verifyButton, async () => {
    message('正在获取国服原神 UID…');
    const response = await mysSend('roles');
    roles = response.roles;
    uidSelect.replaceChildren();
    for (const role of roles) {
      uidSelect.append(new Option((role.nickname || '旅行者') + ' · ' + role.uid, role.uid));
    }
    uidSelect.hidden = roles.length === 0;
    chooseInventoryUid(roles[0]?.uid || '');
    message(roles.length
      ? '已选择 UID ' + roles[0].uid + '，设置培养目标后点击“计算缺口”。'
      : '该账号没有返回原神 UID。', roles.length ? 'success' : 'error');
  }));

  uidSelect.addEventListener('change', () => {
    chooseInventoryUid(uidSelect.value);
    refreshButtons();
    message('已选择 UID ' + uidSelect.value + '。');
  });

  calculateButton.addEventListener('click', () => void perform(calculateButton, async () => {
    const role = roles.find(item => item.uid === uidSelect.value);
    if (!role) throw new Error('请先读取 UID。');
    if (getCalculationMode() !== 'official') throw new Error('请选择米游社计算模式。');
    const plan = getCalculationPlan();
    message('正在计算当前培养目标的材料缺口…');
    const response = await mysSend('calculate', {uid: role.uid, region: role.region, plan});
    const summary = setOfficialCalculation(role.uid, plan, response.calculation);
    message('计算完成 · 官方缺口 ' + summary.officialMissing + ' 项 · '
      + 'Nanoka 需求 ' + summary.fallbackCount + ' 项'
      + (summary.probeCoverage.total
          ? ' · 自动探测 ' + summary.inventoryCount + ' 种材料'
          + (summary.probeCoverage.completed < summary.probeCoverage.total
              ? '（部分批次失败）' : '')
          : '')
      + (summary.unresolved ? ' · 数据待补充 ' + summary.unresolved + ' 项' : '') + '。', 'success');
  }));

  removeButton.addEventListener('click', () => void perform(removeButton, async () => {
    if (!account.value || !window.confirm('移除此米游社账号及登录令牌？')) return;
    const response = await mysSend('remove', {id: account.value});
    showAccounts(response.accounts);
    chooseInventoryUid('');
    message('账号已移除。', 'success');
  }));

  void mysSend('accounts').then(response => {
    showAccounts(response.accounts);
    message(response.accounts.entries.length ? '已恢复保存的米游社账号。' : '尚未添加米游社账号。');
  }).catch(error => message(String(error?.message || error), 'error'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', buildMiyoushePanel, {once: true});
} else {
  buildMiyoushePanel();
}
