import test from 'node:test';
import assert from 'node:assert/strict';
import { mapInventoryMaterials } from '../miyoushe-inventory-map.mjs';

const characterProfile = { materials: {
  spec: { id: '100', name: '区域特产' },
  books: [{ id: '101', name: '绿书' }, { id: '102', name: '蓝书' }, { id: '103', name: '紫书' }],
  cult: [{ id: '201', name: '白色材料' }, { id: '2021', name: '绿色材料' }, { id: '203', name: '蓝色材料' }]
} };
test('按材料 ID 匹配并区分精度', () => {
  const result = mapInventoryMaterials({
    characterProfile,
    officialMaterials: [
      { id: 202, total: 1000, lack: 300, estimatedOwned: 700 },
      { id: 100, total: 168, lack: 0, estimatedOwned: 168 },
      { id: 101, total: 9, lack: 4, estimatedOwned: 5 }
    ],
    inventory: { gold: '200+300', books: ['5', '', ''] }
  });
  assert.equal(result.rows.find(x => x.id === 202).official, 700);
  assert.equal(result.rows.find(x => x.id === 100).status, 'lowerBound');
  assert.equal(result.rows.find(x => x.id === 101).status, 'estimate');
  assert.equal(result.rows.find(x => x.id === 101).current, '5');
  assert.equal(result.rows.find(x => x.id === 102).status, 'missing');
});
test('合并材料准确映射到第四个普通材料槽', () => {
  const weaponProfile = { materials: {
    matA: [{ id: 2021, name: '绿色材料' }, { id: 203, name: '蓝色材料' }, { id: 204, name: '紫色材料' }],
    matB: [{ id: 201 }, { id: 2021 }, { id: 203 }]
  } };
  const result = mapInventoryMaterials({
    characterProfile, weaponProfile,
    rules: { matAIntoCult: true, matBIntoCult: true },
    officialMaterials: [{ id: 204, total: 40, lack: 20, estimatedOwned: 20 }]
  });
  assert.deepEqual(result.rows.find(x => x.id === 204).index, 3);
  assert.equal(result.rows.find(x => x.id === 204).key, 'cult');
  assert.equal(result.rows.some(x => x.key === 'matA'), false);
  assert.equal(result.rows.some(x => x.key === 'matB'), false);
});
test('不完整响应不能被当作零库存', () => {
  const result = mapInventoryMaterials({
    characterProfile,
    officialMaterials: [{ id: 101, total: 2, lack: 8, estimatedOwned: -6 }]
  });
  assert.equal(result.rows.find(x => x.id === 101).status, 'missing');
  assert.equal(result.rows.find(x => x.id === 101).official, null);
});
