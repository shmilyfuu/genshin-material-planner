import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWeaponDetail } from '../hakushin.mjs';

// Silverdawn (15517): source item IDs and the 90/90 totals published by the game database.
const families = [
  [[112146, 15, 1], [112147, 23, 2], [112148, 27, 3]],
  [[112158, 23, 2], [112159, 27, 3], [112160, 41, 4]],
  [[114093, 5, 2], [114094, 14, 3], [114095, 14, 4], [114096, 6, 5]]
];
const fixture = (groups = families) => ({
  name: '银昼',
  materials: {
    ascensions: groups.flatMap((family, g) => family.map(([id, count, rank], i) => ({
      cost: (g + 1) * 1000, mats: [{ id, name: '素材' + id, rank, count }]
    })))
  }
});
test('银昼的三组材料不交叉；23 与 27 均按系列 ID 归类', () => {
  const p = parseWeaponDetail(fixture(), {id:'15517',rarity:5});
  assert.deepEqual(p.materials.weapGems.map(x=>Number(x.id)), [114093,114094,114095,114096]);
  assert.deepEqual(p.materials.matA.map(x=>Number(x.id)), [112158,112159,112160]);
  assert.deepEqual(p.materials.matB.map(x=>Number(x.id)), [112146,112147,112148]);
  assert.deepEqual(p.warnings,[]);
});
test('颠倒阶段顺序并拆分同一物品的数量后仍按系列正确归类', () => {
  const raw = fixture();
  raw.materials.ascensions = raw.materials.ascensions.reverse();
  const source = raw.materials.ascensions.find(s=>s.mats[0].id===112147);
  source.mats[0].count = 11;
  raw.materials.ascensions.push({ mats:[{ id:112147, name:'素材112147', rank:2, count:12 }]});
  const p = parseWeaponDetail(raw, {id:'15517',rarity:5});
  assert.deepEqual(p.materials.matB.map(x=>Number(x.id)),[112146,112147,112148]);
});
test('不完整系列显示缺失提示，防止错误串入其他组材料', () => {
  const raw=fixture([families[0],families[2]]);
  const p=parseWeaponDetail(raw,{id:'15517',rarity:5});
  assert.deepEqual(p.materials.matA,[null,null,null]);
  assert.ok(p.warnings.includes('武器素材 A 识别不完整'));
  assert.deepEqual(p.materials.matB.map(x=>Number(x.id)),[112146,112147,112148]);
});
