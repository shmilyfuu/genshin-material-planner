import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../miyoushe-calculator.js', import.meta.url), 'utf8');
function build(plan, avatars, weapons) {
  return vm.runInNewContext(script + '\nmysCreatePlanItems(plan, avatars, weapons);', {
    MYS: {takumi: 'https://api-takumi.mihoyo.com'}, plan, avatars, weapons
  });
}
function parse(data) {
  return vm.runInNewContext(script + '\nmysParseDeficits({data: response});', {
    MYS: {takumi: 'https://api-takumi.mihoyo.com'}, response: data
  });
}
const character = (id, cat = 1) => ({
  id, weapon_cat_id: cat, name: '角色' + id, element_attr_id: 2,
  skill_list: [
    {group_id: 1101, max_level: 10},
    {group_id: 1102, max_level: 10},
    {group_id: 1103, max_level: 10}
  ]
});
const weapon = (id, cat = 1) => ({id, weapon_cat_id: cat, max_level: 90});
const settings = (extra = {}) => ({
  charAsc: [0, 6], weapAsc: [0, 6],
  talentA: [0, 9], talentE: [0, 7], talentQ: [0, 0], ...extra
});

test('角色单独培养使用对应突破和三项天赋的当前目标等级', () => {
  const items = build({characterId: '10000111', weaponId: '', config: settings()},
    [character(10000111)], []);
  assert.equal(items.length, 1);
  assert.equal(items[0].avatar_id, 10000111);
  assert.equal(items[0].avatar_level_current, 1);
  assert.equal(items[0].avatar_level_target, 81);
  assert.equal(items[0].avatar_promote_level, 0);
  assert.equal(items[0].skill_list[0].level_target, 10);
  assert.equal(items[0].skill_list[1].level_target, 8);
  assert.equal(items[0].skill_list[2].level_target, 1);
});

test('角色与同类型武器合并成单条官方计算项', () => {
  const items = build({characterId: '10000111', weaponId: '15517', config: settings()},
    [character(10000111)], [weapon(15517)]);
  assert.equal(items.length, 1);
  assert.equal(items[0].weapon.id, 15517);
  assert.equal(items[0].weapon.level_target, 81);
});

test('独立武器使用等级不变的同类型角色，不引入角色养成消耗', () => {
  const items = build({characterId: '', weaponId: '15517', config: settings()},
    [character(10000111)], [weapon(15517)]);
  assert.equal(items.length, 1);
  assert.equal(items[0].avatar_level_current, 1);
  assert.equal(items[0].avatar_level_target, 1);
  assert.equal(items[0].skill_list.length, 0);
  assert.equal(items[0].weapon.level_target, 81);
});

test('不同武器类型分离为两条计算项，避免装备类型不符', () => {
  const items = build({characterId: '10000111', weaponId: '15517', config: settings()},
    [character(10000111, 2), character(10000112, 1)], [weapon(15517, 1)]);
  assert.equal(items.length, 2);
  assert.equal(items[0].avatar_id, 10000111);
  assert.equal(items[1].avatar_id, 10000112);
  assert.equal(items[1].avatar_level_target, 1);
});

test('没有培养变化时不发送计算请求', () => {
  assert.throws(() => build({characterId: '10000111', config: settings({
    charAsc: [0, 0], weapAsc: [0, 0],
    talentA: [0, 0], talentE: [0, 0], talentQ: [0, 0]
  })}, [character(10000111)], []), /请选择需要升级/);
});

test('只提升角色时无需查询尚未实装的预览武器', () => {
  const items = build({characterId: '10000111', weaponId: '15599', config: settings({
    weapAsc: [0, 0]
  })}, [character(10000111)], []);
  assert.equal(items.length, 1);
  assert.equal(items[0].weapon, undefined);
});

test('官方结果直接取 lack_num，包含合成后的剩余缺口', () => {
  const rows = parse({
    has_user_info: true,
    overall_consume: [
      {id: 112146, name: '材料A', num: 23, lack_num: 8},
      {id: 114093, name: '材料B', num: 5, lack_num: 0}
    ]
  });
  assert.equal(rows.length, 2);
  assert.equal(rows.find(x=>x.id===112146).lack, 8);
  assert.equal(rows.find(x=>x.id===114093).lack, 0);
});
test('缺少 UID 计算数据时拒绝显示官方缺口', () => {
  assert.throws(() => parse({has_user_info: false, overall_consume: []}), /UID/);
});

test('官方仅缺少某角色或武器时给出明确错误', () => {
  assert.throws(() => build({characterId:'10000199', config:settings()},
    [character(10000111)],[]), /暂未收录当前角色/);
});
