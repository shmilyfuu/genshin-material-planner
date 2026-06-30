import { applyCharacter, send, setStatus } from './miyoushe-ui-helpers.js';
import { createMiyoushePanel } from './miyoushe-ui-view.js';

let lastSyncData = null;
let qrTicket = '';

function setBusy(button, busy, busyText) {
  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.defaultText;
}

function startController() {
  const ui = createMiyoushePanel();
  if (!ui) return;

  async function loadRolesAndStatus(sessionLabel = '') {
    const response = await send({ type: 'miyoushe:status' });
    if (!response?.ok || !response.session?.loggedIn) {
      setStatus(ui.status, response?.error || '尚未检测到有效登录会话。', 'error');
      return false;
    }
    setStatus(ui.status, `已登录：${sessionLabel || response.session.accountLabel}`, 'success');
    ui.logoutButton.hidden = false;
    ui.renderRoles(response.roles, response.selectedUid || response.session.selectedUid);
    return true;
  }

  ui.qrButton.addEventListener('click', async () => {
    setBusy(ui.qrButton, true, '正在生成…');
    const response = await send({ type: 'miyoushe:qr-create' });
    setBusy(ui.qrButton, false, '');
    if (!response?.ok) {
      setStatus(ui.status, response?.error || '二维码登录初始化失败。', 'error');
      return;
    }
    qrTicket = response.qr.ticket;
    try {
      const qrFactory = globalThis.qrcode;
      if (typeof qrFactory !== 'function') throw new Error('二维码组件未加载。');
      qrFactory.stringToBytes = qrFactory.stringToBytesFuncs['UTF-8'];
      const qr = qrFactory(0, 'M');
      qr.addData(response.qr.url, 'Byte');
      qr.make();
      ui.qrImage.src = qr.createDataURL(5, 20);
      ui.qrBox.hidden = false;
      setStatus(ui.status, '二维码已生成，请使用手机米游社扫码。');
    } catch (error) {
      setStatus(ui.status, `二维码生成失败：${String(error?.message || error)}`, 'error');
    }
  });

  ui.qrCheckButton.addEventListener('click', async () => {
    if (!qrTicket) return;
    setBusy(ui.qrCheckButton, true, '正在检查…');
    const response = await send({ type: 'miyoushe:qr-query', ticket: qrTicket });
    setBusy(ui.qrCheckButton, false, '');
    if (!response?.ok) {
      setStatus(ui.status, response?.error || '扫码状态检查失败。', 'error');
      return;
    }
    if (response.result?.status !== 'Confirmed') {
      setStatus(ui.status, `当前扫码状态：${response.result?.status || '等待扫码'}`);
      return;
    }
    ui.qrBox.hidden = true;
    await loadRolesAndStatus(response.result.session?.accountLabel || '');
  });

  ui.syncButton.addEventListener('click', async () => {
    setBusy(ui.syncButton, true, '正在同步…');
    setStatus(ui.status, '正在读取角色列表、天赋与装备武器…');
    const response = await send({ type: 'miyoushe:sync', uid: ui.roleSelect.value });
    setBusy(ui.syncButton, false, '');
    if (!response?.ok) {
      setStatus(ui.status, response?.error || '米游社数据同步失败。', 'error');
      return;
    }
    lastSyncData = response.data;
    ui.renderSyncData(lastSyncData);
    setStatus(ui.status, '角色数据读取完成。请先预览，再决定是否应用到规划器。', 'success');
  });

  ui.characterSelect.addEventListener('change', () => ui.renderCharacterDetail(lastSyncData));
  ui.applyButton.addEventListener('click', () => {
    const character = lastSyncData?.characters?.find((item) => item.id === ui.characterSelect.value);
    void applyCharacter(character, ui.status);
  });

  ui.logoutButton.addEventListener('click', async () => {
    await send({ type: 'miyoushe:logout' });
    ui.logoutButton.hidden = true;
    ui.roleArea.hidden = true;
    ui.resultArea.hidden = true;
    lastSyncData = null;
    setStatus(ui.status, '已清除本次浏览器会话中的米游社登录令牌。');
  });

  void loadRolesAndStatus().catch(() => {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startController, { once: true });
} else {
  startController();
}
