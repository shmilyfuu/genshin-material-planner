import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../miyoushe-material-test.js', import.meta.url), 'utf8');
const sample = (characters, weapons = []) =>
  vm.runInNewContext(source + '\nmysCalcSample(characters, weapons)', {
    MYS: {takumi: 'https://api-takumi.mihoyo.com'}, characters, weapons
  });

const character = (id, weapon_cat_id = 1) => ({
  id, weapon_cat_id, name: id === 10000137 ? '瓦列里' : '角色' + id,
  skill_list: [{group_id: 12001, max_level: 10}]
});

test('遍历全部角色，包含以前第 20 位以后漏检的瓦列里', () => {
  const characters = Array.from({length: 25}, (_, i) => character(10000020 + i));
  characters.push(character(10000137));
  const result = sample(characters, [{id: 15517, weapon_cat_id: 1, max_level: 90}]);
  assert.equal(result.items.length, 26);
  assert.ok(result.items.some((item) => item.avatar_id === 10000137));
  assert.equal(result.weaponsIncluded, 26);
});

test('特殊旅行者与缺少技能数据的项目不参与计算', () => {
  const chars = [character(10000005), character(10000007), character(10000137),
    {id: 10000150, name: '缺少技能数据', skill_list: []}];
  const r = sample(chars);
  assert.deepEqual(Array.from(r.items, (item) => item.avatar_id), [10000137]);
});
