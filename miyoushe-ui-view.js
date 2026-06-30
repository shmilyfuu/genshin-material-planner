import { createElement } from './miyoushe-ui-helpers.js';

export function createMiyoushePanel() {
  const existing = document.getElementById('miyousheCard');
  if (existing) return null;

  const card = createElement('section', 'card mys-card');
  card.id = 'miyousheCard';

  const header = createElement('div', 'mys-head');
  const headerCopy = createElement('div');
  headerCopy.append(
    createElement('h2', '', '米游社数据同步（实验）'),
    createElement('p', 'mys-subtitle', '国服 · 手动同步 · 独立测试扩展')
  );
  const logoutButton = createElement('button', 'button button-secondary', '退出登录');
  logoutButton.type = 'button';
  logoutButton.hidden = true;
  header.append(headerCopy, logoutButton);

  const notice = createElement(
    'p',
    'mys-notice',
    '第一阶段先用扫码登录验证国服米游社会话与角色接口；登录令牌仅保存在当前浏览器会话。账号密码直登与短信验证将在接口验证通过后继续接入。'
  );

  const loginActions = createElement('div', 'mys-actions');
  const qrButton = createElement('button', 'button button-primary', '扫码登录米游社');
  qrButton.type = 'button';
  loginActions.append(qrButton);

  const qrBox = createElement('div', 'mys-qr-box');
  qrBox.hidden = true;
  const qrImage = createElement('img', 'mys-qr-image');
  qrImage.alt = '米游社扫码登录二维码';
  const qrCheckButton = createElement('button', 'button button-secondary', '检查扫码状态');
  qrCheckButton.type = 'button';
  qrBox.append(
    createElement('p', '', '请使用手机米游社扫描下方二维码。这个地址用于生成二维码，不能直接在浏览器中打开。'),
    qrImage,
    qrCheckButton
  );

  const status = createElement('p', 'mys-status mys-status-info', '尚未登录。');

  const roleArea = createElement('div', 'mys-role-area');
  roleArea.hidden = true;
  const roleLabel = createElement('label');
  const roleSelect = createElement('select');
  roleSelect.id = 'mysRoleSelect';
  roleLabel.append(createElement('span', '', '原神角色'), roleSelect);
  const syncButton = createElement('button', 'button button-primary', '同步角色数据');
  syncButton.type = 'button';
  roleArea.append(roleLabel, syncButton);

  const resultArea = createElement('div', 'mys-result-area');
  resultArea.hidden = true;
  const resultSummary = createElement('p', 'mys-result-summary');
  const characterLabel = createElement('label');
  const characterSelect = createElement('select');
  characterSelect.id = 'mysCharacterSelect';
  characterLabel.append(createElement('span', '', '已读取角色'), characterSelect);
  const characterDetail = createElement('div', 'mys-character-detail');
  const applyButton = createElement('button', 'button button-secondary', '应用选中角色到当前规划');
  applyButton.type = 'button';
  const limitation = createElement('p', 'mys-limitation');
  resultArea.append(resultSummary, characterLabel, characterDetail, applyButton, limitation);

  card.append(header, notice, loginActions, qrBox, status, roleArea, resultArea);
  const layout = document.querySelector('main.layout');
  const targetCard = layout?.querySelector('.target-card');
  if (layout) layout.insertBefore(card, targetCard || layout.firstChild);

  function renderRoles(roles, selectedUid = '') {
    roleSelect.replaceChildren();
    for (const role of roles || []) {
      const option = document.createElement('option');
      option.value = role.uid;
      option.textContent = `${role.nickname || '旅行者'} · ${role.uid}${role.regionName ? ` · ${role.regionName}` : ''}`;
      if (role.uid === selectedUid) option.selected = true;
      roleSelect.append(option);
    }
    roleArea.hidden = roleSelect.options.length === 0;
  }

  function renderCharacterDetail(data) {
    const character = data?.characters?.find((item) => item.id === characterSelect.value);
    characterDetail.replaceChildren();
    if (!character) return null;
    const fightSkills = (character.skills || []).filter((skill) => skill.type === 1).slice(0, 3);
    characterDetail.append(
      createElement('strong', '', `${character.name} · Lv.${character.level} · ${character.constellation}命`),
      createElement('p', '', `战斗天赋：${fightSkills.map((skill) => `Lv.${skill.level}`).join(' / ') || '未返回'}`),
      createElement('p', '', character.weapon
        ? `装备武器：${character.weapon.name || character.weapon.id} · Lv.${character.weapon.level} · 精炼${character.weapon.refinement}`
        : '装备武器：未返回')
    );
    return character;
  }

  function renderSyncData(data) {
    characterSelect.replaceChildren();
    for (const character of data.characters || []) {
      const option = document.createElement('option');
      option.value = character.id;
      option.textContent = `${character.name || character.id} · Lv.${character.level}`;
      characterSelect.append(option);
    }
    resultSummary.textContent = `已从 ${data.role.nickname || data.role.uid}（${data.role.uid}）读取 ${data.characters.length} 名角色。`;
    limitation.textContent = data.limitations?.note || '';
    resultArea.hidden = false;
    return renderCharacterDetail(data);
  }

  return {
    card, logoutButton, qrButton, qrBox, qrImage, qrCheckButton,
    status, roleArea, roleSelect, syncButton, resultArea, characterSelect, applyButton,
    renderRoles, renderCharacterDetail, renderSyncData
  };
}
