import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../miyoushe-material-test.js', import.meta.url), 'utf8');
function parse(data) {
  const sandbox = { MYS: { takumi: 'https://api-takumi.mihoyo.com' }, result: { data } };
  return vm.runInNewContext(source + '\nmysParseMaterials(result);', sandbox);
}
test('背包值与合成后的需求抵扣数分别读取', () => {
  const rows = parse({
    overall_consume: [{ id: 101, name: '材料', num: 30, lack_num: 12 }],
    available_material: [{ id: 101, name: '材料', num: 8 }]
  });
  assert.equal(rows[0].bagOwned, 8);
  assert.equal(rows[0].estimatedOwned, 18);
  assert.equal(rows[0].total, 30);
  assert.equal(rows[0].lack, 12);
});
test('接口不返回背包值时，不伪造库存数量', () => {
  const rows = parse({ overall_consume: [{ id: 102, num: 40, lack_num: 0 }] });
  assert.equal(rows[0].bagOwned, null);
  assert.equal(rows[0].estimatedOwned, 40);
});
test('接口背包记录为零与字段缺失区分', () => {
  const rows = parse({
    overall_consume: [{ id: 103, num: 20, lack_num: 20 }],
    available_material: [{ id: 103, num: 0 }, { id: 104, num: 6 }]
  });
  assert.equal(rows.find(x => x.id === 103).bagOwned, 0);
  assert.equal(rows.find(x => x.id === 104).bagOwned, 6);
  assert.equal(rows.find(x => x.id === 104).estimatedOwned, null);
});
