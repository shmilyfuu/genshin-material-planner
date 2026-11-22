import test from 'node:test';
import assert from 'node:assert/strict';
import { mapInventoryMaterials } from '../miyoushe-inventory-map.mjs';

const characterProfile = { materials: {
  spec: { id: '100', name: '区域特产' },
  books: [{ id: '101', name: '绿书' }, { id: '102', name: '蓝书' }, { id: '103', name: '紫书' }],
  cult: [{ id: '201', name: '白色材料' }, { id: '2021', name: '绿色材料' }, { id: '203', name: '蓝色材料' }]
} };

test('使用接口直接返回的背包数量，抵扣数据独立显示', () => {
  const result = mapInventoryMaterials({
    characterProfile,
    officialMaterials: [
      { id: 202, total: 1000, lack: 300, estimatedOwned: 700, bagOwned: 620 },
      { id: 100, total: 168, lack: 0, estimatedOwned: 168, bagOwned: null },
      { id: 101, total: 9, lack: 4, estimatedOwned: 5, bagOwned: 2 }
    ],
    inventory: { gold: '200+300', books: ['5', '', ''] }
  });
  assert.equal(result.rows.find(x => x.id === 202).official, 620);
  assert.equal(result.rows.find(x => x.id === 202).effective, 700);
  assert.equal(result.rows.find(x => x.id === 100).status, 'derived');
  assert.equal(result.rows.find(x => x.id === 100).official, null);
  assert.equal(result.rows.find(x => x.id === 101).status, 'bag');
  assert.equal(result.rows.find(x => x.id === 101).current, '5');
  assert.equal(result.rows.find(x => x.id === 102).status, 'missing');
});

test('合并材料映射到第四个普通材料槽', () => {
  const weaponProfile = { materials: {
    matA: [{ id: 2021, name: '绿色材料' }, { id: 203, name: '蓝色材料' }, { id: 204, name: '紫色材料' }],
    matB: [{ id: 201 }, { id: 2021 }, { id: 203 }]
  } };
  const result = mapInventoryMaterials({
    characterProfile, weaponProfile,
    rules: { matAIntoCult: true, matBIntoCult: true },
    officialMaterials: [{ id: 204, total: 40, lack: 20, estimatedOwned: 20, bagOwned: 3 }]
  });
  assert.equal(result.rows.find(x => x.id === 204).index, 3);
  assert.equal(result.rows.find(x => x.id === 204).key, 'cult');
  assert.equal(result.rows.some(x => x.key === 'matA'), false);
  assert.equal(result.rows.some(x => x.key === 'matB'), false);
});

test('没有背包字段时维持仅抵扣状态，绝不将其转为库存', () => {
  const result = mapInventoryMaterials({
    characterProfile,
    officialMaterials: [{ id: 101, total: 10, lack: 8, estimatedOwned: 2, bagOwned: null }]
  });
  assert.equal(result.rows.find(x => x.id === 101).status, 'derived');
  assert.equal(result.rows.find(x => x.id === 101).official, null);
});
