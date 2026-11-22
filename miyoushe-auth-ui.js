import { previewCurrentInventory } from './app.js';

const mysEl = (tag, text = '', cls = '') => {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (cls) el.className = cls;
  return el;
};

async function mysSend(type, fields = {}) {
  const response = await chrome.runtime.sendMessage({ type: 'mys-auth:' + type, ...fields });
  if (!response?.ok) throw new Error(response?.error || '登录服务无响应。');
  return response;
}

function mysBuild() {
  const layout = document.querySelector('main.layout');
  if (!layout || document.getElementById('mysAuthCard')) return;

  const card = mysEl('section', '', 'card mys-auth');
  card.id = 'mysAuthCard';
  card.append(mysEl('h2', '米游社账号', 'mys-auth-title'));
  card.append(mysEl('p', '国服 · 手动登录验证 · 已登录账号保存在本机 Chrome 配置文件中', 'mys-auth-description'));

  const controls = mysEl('div', '', 'mys-auth-controls');
  const account = mysEl('select');
  account.setAttribute('aria-label', '米游社账号');
  account.id = 'mysAccountSelect';
  const qrButton = mysEl('button', '添加账号（扫码）', 'button button-primary');
  const refreshButton = mysEl('button', '刷新凭证', 'button button-secondary');
  const verifyButton = mysEl('button', '验证账号与 UID', 'button button-secondary');
  const materialsButton = mysEl('button', '测试读取材料', 'button button-secondary');
  const removeButton = mysEl('button', '移除账号', 'button button-danger');
  [qrButton, refreshButton, verifyButton, materialsButton, removeButton].forEach((button) => { button.type = 'button'; });
  controls.append(account, qrButton, refreshButton, verifyButton, materialsButton, removeButton);
  card.append(controls);

  const qrArea = mysEl('div', '', 'mys-auth-qr');
  qrArea.hidden = true;
  qrArea.append(mysEl('p', '使用手机米游社扫描二维码，并在手机上确认登录。'));
  const qrImage = mysEl('img');
  qrImage.alt = '米游社扫码登录';
  qrImage.width = 220;
  qrImage.height = 220;
  const pollButton = mysEl('button', '检查扫码状态', 'button button-secondary');
  pollButton.type = 'button';
  qrArea.append(qrImage, pollButton);
  card.append(qrArea);

  const status = mysEl('p', '正在读取本机账号…', 'mys-auth-status');
  status.setAttribute('role', 'status');
  card.append(status);
  const roles = mysEl('div', '', 'mys-auth-roles');
  roles.hidden = true;
  card.append(roles);
  const uidSelect = mysEl('select');
  uidSelect.setAttribute('aria-label', '选择原神 UID');
  uidSelect.hidden = true;
  card.append(uidSelect);
  const materialsArea = mysEl('section', '', 'mys-material-results');
  materialsArea.hidden = true;
  card.append(materialsArea);
  const note = mysEl('p', '保存的登录令牌属于敏感凭证。请仅在个人可信的 Chrome 配置文件中使用。', 'mys-auth-description');
  card.append(note);

  const target = layout.querySelector('.target-card');
  layout.insertBefore(card, target || layout.firstChild);

  let ticket = '';
  let currentAccounts = { activeId: '', entries: [] };
  let verifiedRoles = [];
  materialsButton.disabled = true;

  const message = (text, kind = 'info') => {
    status.textContent = text;
    status.dataset.tone = kind;
  };

  const setAccounts = (value) => {
    currentAccounts = value;
    account.replaceChildren();
    const entries = value?.entries || [];
    if (!entries.length) {
      const option = new Option('尚未添加账号', '');
      account.append(option);
    } else {
      for (const entry of entries) {
        const option = new Option(entry.label + (entry.hasCookie ? '' : ' · 待刷新'), entry.id);
        account.append(option);
      }
      account.value = value.activeId || entries[0].id;
    }
    refreshButton.disabled = removeButton.disabled = verifyButton.disabled = entries.length === 0;
    roles.hidden = true;
    uidSelect.hidden = true;
    verifiedRoles = [];
    materialsButton.disabled = true;
    materialsArea.hidden = true;
    materialsArea.replaceChildren();
  };

  const action = async (button, task) => {
    button.disabled = true;
    try {
      await task();
    } catch (error) {
      message(String(error?.message || error), 'error');
    } finally {
      button.disabled = button === materialsButton ? verifiedRoles.length === 0 : false;
    }
  };

  account.addEventListener('change', () => void action(account, async () => {
    const response = await mysSend('switch', { id: account.value });
    setAccounts(response.accounts);
    message('已切换账号。点击“验证账号与 UID”可检查当前会话。');
  }));

  qrButton.addEventListener('click', () => void action(qrButton, async () => {
    message('正在向米游社请求二维码…');
    const response = await mysSend('start-qr');
    ticket = response.qr.ticket;
    const factory = globalThis.qrcode;
    if (typeof factory !== 'function') throw new Error('本地二维码组件加载失败。');
    factory.stringToBytes = factory.stringToBytesFuncs['UTF-8'];
    const code = factory(0, 'M');
    code.addData(response.qr.url, 'Byte');
    code.make();
    qrImage.src = code.createDataURL(5, 12);
    qrArea.hidden = false;
    message('二维码已生成，请使用手机米游社扫码。');
  }));

  pollButton.addEventListener('click', () => void action(pollButton, async () => {
    if (!ticket) throw new Error('请先生成二维码。');
    const response = await mysSend('poll-qr', { ticket });
    const result = response.login;
    if (result.status !== 'Confirmed') {
      const texts = { Init: '等待扫码。', Scanned: '已扫码，请在手机上确认。', Expired: '二维码已过期，请重新生成。' };
      message(texts[result.status] || '扫码状态：' + result.status);
      return;
    }
    ticket = '';
    qrArea.hidden = true;
    setAccounts(result.accounts);
    message(result.warning
      ? '账号已保存，令牌转换暂未成功：' + result.warning
      : '登录成功，账号已保存。可点击“验证账号与 UID”。',
    result.warning ? 'error' : 'success');
  }));

  refreshButton.addEventListener('click', () => void action(refreshButton, async () => {
    message('正在刷新当前账号的短期凭证…');
    const response = await mysSend('refresh', { id: account.value });
    setAccounts(response.accounts);
    message('当前账号令牌已刷新。', 'success');
  }));

  verifyButton.addEventListener('click', () => void action(verifyButton, async () => {
    message('正在验证米游社账号并读取国服原神 UID…');
    const response = await mysSend('roles');
    roles.replaceChildren();
    roles.hidden = false;
    if (!response.roles.length) {
      roles.append(mysEl('p', '该米游社账号没有返回已绑定的国服原神角色。'));
    } else {
      for (const role of response.roles) {
        roles.append(mysEl('p', (role.nickname || '旅行者') + ' · ' + role.uid + (role.regionName ? ' · ' + role.regionName : '')));
      }
    }
    verifiedRoles = response.roles;
    uidSelect.replaceChildren();
    for (const role of verifiedRoles) {
      uidSelect.append(new Option((role.nickname || '旅行者') + ' · ' + role.uid, role.uid));
    }
    uidSelect.hidden = verifiedRoles.length <= 1;
    materialsButton.disabled = verifiedRoles.length === 0;
    materialsArea.hidden = true;
    materialsArea.replaceChildren();
    message('账号验证完成，返回 ' + response.roles.length + ' 个国服原神 UID。', 'success');
  }));

  materialsButton.addEventListener('click', () => void action(materialsButton, async () => {
    const selected = verifiedRoles.find((role) => role.uid === uidSelect.value);
    if (!selected) throw new Error('请先验证账号并选择原神 UID。');
    message('正在查询米游社养成计算器材料…');
    const response = await mysSend('materials', { uid: selected.uid, region: selected.region });
    const result = response.materials;
    materialsArea.replaceChildren();
    const summary = mysEl('p', 'UID ' + result.uid + ' · 测试 ' + result.avatarCount + ' 名角色、' + result.weaponCount + ' 把武器 · 返回 ' + result.materials.length + ' 种材料');
    const note = mysEl('p', '背包返回数量来自 available_material，仅覆盖接口本次返回的材料。需求抵扣包含合成换算，只用于养成计算；数据可能存在同步延迟。', 'mys-auth-description');
    materialsArea.append(summary, note);
    if (result.weaponWarning) {
      materialsArea.append(mysEl('p', '武器目录读取异常：' + result.weaponWarning, 'mys-auth-description'));
    }
    const scroll = mysEl('div', '', 'mys-material-list');
    const table = mysEl('table', '', 'mys-material-table');
    const head = mysEl('thead');
    const headRow = mysEl('tr');
    ['材料', '背包返回', '需求抵扣', '本次需求', '仍缺'].forEach((label) => headRow.append(mysEl('th', label)));
    head.append(headRow);
    table.append(head);
    const body = mysEl('tbody');
    for (const item of result.materials) {
      const row = mysEl('tr');
      [
        item.name,
        item.bagOwned === null ? '—' : String(item.bagOwned),
        item.estimatedOwned === null ? '—' : String(item.estimatedOwned),
        item.total === null ? '—' : String(item.total),
        item.lack === null ? '—' : String(item.lack)
      ].forEach((value) => row.append(mysEl('td', value)));
      body.append(row);
    }
    table.append(body);
    scroll.append(table);
    materialsArea.append(scroll);
    const mapped = previewCurrentInventory(result.materials);
    const section = mysEl('section', '', 'mys-material-mapping');
    section.append(mysEl('h3', '当前养成对象材料核对'));
    if (!mapped.rows.length) {
      section.append(mysEl('p', '请先选择角色或武器，再次读取材料可查看 ID 对应关系。', 'mys-auth-description'));
    } else {
      section.append(mysEl('p',
        '接口背包 ' + mapped.available + ' 项 · 仅有抵扣数据 ' + mapped.lowerBounds
        + ' 项 · 未返回 ' + mapped.missing + ' 项', 'mys-auth-description'));
      const wrap = mysEl('div', '', 'mys-material-list');
      const table = mysEl('table', '', 'mys-material-table');
      const head = mysEl('thead');
      const header = mysEl('tr');
      ['材料', '当前输入', '接口背包', '需求抵扣', '状态'].forEach((label) => header.append(mysEl('th', label)));
      head.append(header);
      table.append(head);
      const body = mysEl('tbody');
      for (const row of mapped.rows) {
        const tr = mysEl('tr');
        const reference = row.official === null ? '—' : String(row.official);
        const effective = row.effective === null ? '—' : String(row.effective);
        const status = row.status === 'missing' ? '未返回'
          : row.status === 'derived' ? '仅抵扣数据' : '背包记录';
        [row.name, row.current || '—', reference, effective, status]
          .forEach((value) => tr.append(mysEl('td', value)));
        body.append(tr);
      }
      table.append(body);
      wrap.append(table);
      section.append(wrap);
    }
    materialsArea.append(section);
    materialsArea.hidden = false;
    message('材料验证完成，返回 ' + result.materials.length + ' 种材料。', 'success');
  }));

  removeButton.addEventListener('click', () => void action(removeButton, async () => {
    if (!account.value || !window.confirm('移除此米游社账号及本地保存的令牌？')) return;
    const response = await mysSend('remove', { id: account.value });
    setAccounts(response.accounts);
    message('账号及本机保存的令牌已清理。', 'success');
  }));

  void mysSend('accounts').then((response) => {
    setAccounts(response.accounts);
    message(response.accounts.entries.length ? '已恢复本机保存的账号。' : '尚未添加米游社账号。');
  }).catch((error) => message(String(error?.message || error), 'error'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mysBuild, { once: true });
} else {
  mysBuild();
}
