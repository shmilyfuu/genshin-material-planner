import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../miyoushe-material-test.js', import.meta.url), 'utf8');
function parse(data) {
  const sandbox = { MYS: { takumi: 'https://api-takumi.mihoyo.com' }, result: { data } };
  return vm.runInNewContext(source + '\nmysParseMaterials(result);', sandbox);
}
test('分开保留计算器的可用量与合成抵扣量', () => {
  const rows = parse({
    overall_consume: [{ id: 101, name: '材料', num: 30, lack_num: 12 }],
    available_material: [{ id: 101, name: '材料', num: 8 }]
  });
  assert.equal(rows[0].calculatorAvailable, 8);
  assert.equal(rows[0].coveredDemand, 18);
  assert.equal(rows[0].total, 30);
  assert.equal(rows[0].lack, 12);
});
test('未返回可用量时维持未知，避免推算出错误背包总量', () => {
  const rows = parse({ overall_consume: [{ id: 102, num: 40, lack_num: 0 }] });
  assert.equal(rows[0].calculatorAvailable, null);
  assert.equal(rows[0].coveredDemand, 40);
});
test('接口返回零与缺少数据分别解析', () => {
  const rows = parse({
    overall_consume: [{ id: 103, num: 20, lack_num: 20 }],
    available_material: [{ id: 103, num: 0 }, { id: 104, num: 6 }]
  });
  assert.equal(rows.find(x => x.id === 103).calculatorAvailable, 0);
  assert.equal(rows.find(x => x.id === 104).calculatorAvailable, 6);
  assert.equal(rows.find(x => x.id === 104).coveredDemand, null);
});
