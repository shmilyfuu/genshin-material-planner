import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatorAutofill} from '../miyoushe-inventory-map.mjs';
import {normalizeState} from '../core.mjs';

test('最低阶材料通过可用量和已抵扣量得到计算参考', () => {
  const item = {calculatorAvailable: 42, coveredDemand: 5, lack: 20};
  assert.equal(calculatorAutofill(item, 'weapGems', 0), '47');
  assert.equal(calculatorAutofill(item, 'weapGems', 1), null);
  assert.equal(calculatorAutofill(item, 'weapGems', 3), null);
});

test('有缺口且不合成的基础材料允许采用需求抵扣', () => {
  assert.equal(calculatorAutofill({calculatorAvailable: null, coveredDemand: 47, lack: 121}, 'spec'), '47');
  assert.equal(calculatorAutofill({calculatorAvailable: null, coveredDemand: 20, lack: 0}, 'spec'), null);
});

test('不同 UID 的材料按 ID 存储，原有手动配置保持独立', () => {
  const state=normalizeState({
    inv: {spec:'5',books:['3']},
    inventoryUid:'123456789',
    accountInventories:{
      '123456789': {manual:{'301':'9'},materials:{'301':{calculatorAvailable:30,coveredDemand:6,total:20,lack:2}}},
      '987654321': {manual:{'301':'17'},materials:{'301':{calculatorAvailable:40,coveredDemand:8,total:30,lack:4}}}
    }
  });
  assert.equal(state.inv.spec, '5');
  assert.equal(state.accountInventories['123456789'].manual['301'],'9');
  assert.equal(state.accountInventories['987654321'].manual['301'],'17');
  assert.equal(state.accountInventories['123456789'].materials['301'].coveredDemand,6);
  assert.equal(state.accountInventories['987654321'].materials['301'].calculatorAvailable,40);
});
