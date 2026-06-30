export const STATUS_CLASS = Object.freeze({
  info: 'mys-status-info',
  success: 'mys-status-success',
  error: 'mys-status-error'
});

export function send(message) {
  return chrome.runtime.sendMessage(message);
}

export function setStatus(element, message, tone = 'info') {
  element.textContent = message;
  element.className = `mys-status ${STATUS_CLASS[tone] || STATUS_CLASS.info}`;
}

export function createElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function levelStage(level) {
  const value = Number(level) || 1;
  if (value <= 1) return 0;
  if (value <= 20) return 1;
  if (value <= 40) return 2;
  if (value <= 50) return 3;
  if (value <= 60) return 4;
  if (value <= 70) return 5;
  return 6;
}

function talentStage(level) {
  return Math.max(0, Math.min(9, (Number(level) || 1) - 1));
}

function changeSelect(select, value) {
  if (!select) return false;
  const target = String(value);
  if (![...select.options].some((option) => option.value === target)) return false;
  select.value = target;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function findOptionValue(select, id, name) {
  if (!select) return '';
  const idValue = String(id || '');
  if (idValue && [...select.options].some((option) => option.value === idValue)) return idValue;
  const normalizedName = String(name || '').trim();
  const matched = [...select.options].find((option) => option.textContent.replace(/\s*·.*$/, '').trim() === normalizedName);
  return matched?.value || '';
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function applyCharacter(character, status) {
  if (!character) return;
  const characterSelect = document.getElementById('characterSelect');
  const characterValue = findOptionValue(characterSelect, character.id, character.name);
  if (!characterValue) {
    setStatus(status, `当前数据列表中未找到角色“${character.name || character.id}”，未修改规划器。`, 'error');
    return;
  }

  changeSelect(characterSelect, characterValue);
  await wait(600);
  changeSelect(document.querySelector('select[aria-label="角色等级当前等级"]'), levelStage(character.level));

  const fightSkills = (character.skills || []).filter((skill) => skill.type === 1).slice(0, 3);
  const labels = ['普攻（A）当前等级', '战技（E）当前等级', '爆发（Q）当前等级'];
  labels.forEach((label, index) => {
    if (fightSkills[index]) changeSelect(document.querySelector(`select[aria-label="${label}"]`), talentStage(fightSkills[index].level));
  });

  let weaponApplied = false;
  if (character.weapon) {
    const weaponSelect = document.getElementById('weaponSelect');
    const weaponValue = findOptionValue(weaponSelect, character.weapon.id, character.weapon.name);
    if (weaponValue) {
      changeSelect(weaponSelect, weaponValue);
      await wait(500);
      changeSelect(document.querySelector('select[aria-label="武器等级当前等级"]'), levelStage(character.weapon.level));
      weaponApplied = true;
    }
  }

  setStatus(status, weaponApplied
    ? `已把 ${character.name} 的当前等级、战斗天赋和装备武器写入规划器。`
    : `已把 ${character.name} 的当前等级和战斗天赋写入规划器；装备武器未匹配。`, 'success');
}
