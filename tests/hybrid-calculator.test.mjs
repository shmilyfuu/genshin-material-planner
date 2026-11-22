import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNanokaDemand, evaluateNanokaDemand} from '../hybrid-calculator.mjs';

const none = [0,0];
const full = {
  charAsc: [0,6], weapAsc: [0,6],
  talentA: [...none], talentE: [...none], talentQ: [...none]
};
const char = {materials: {
  spec: {id: 10, name: '妖精绿艾'},
  boss: {id: 11}, weekly: {id: 12}, crown: {id: 13},
  charGems: [1,2,3,4].map((id, i) => ({id: 100 + id, rank: i + 2})),
  cult: [1,2,3].map((id, i) => ({id: 110200 + id, rank: i + 1})),
  books: [1,2,3].map((id, i) => ({id: 300 + id, rank: i + 2}))
}};
const weapon = {materials: {
  weapGems: [1,2,3,4].map((id,i)=>({id: 400+id, rank: i+2})),
  matA: [2,3,4].map((id,i)=>({id: 110200+id, rank: i+1})),
  matB: [1,2,3].map((id,i)=>({id: 110200+id, rank: i}))
}};
test('仅前瞻角色：Nanoka 的特产需求计算与 90 级一致', () => {
  const demand=buildNanokaDemand({config:full,characterProfile:char,parts:{character:true}});
  const spec=demand.groups.flatMap(g=>g.rows).find(row=>row.id===10);
  assert.equal(spec.count,168);
  assert.equal(demand.unrecognized.length,0);
  const evaluated=evaluateNanokaDemand(demand);
  assert.equal(evaluated.groups.flatMap(g=>g.rows).find(r=>r.id===10).lack,null);
});
test('角色与武器共用材料 ID 时合并需求，只计算一次库存', () => {
  const demand=buildNanokaDemand({config:full,characterProfile:char,weaponProfile:weapon,parts:{character:true,weapon:true}});
  const rows=demand.groups.flatMap(g=>g.rows);
  assert.equal(rows.filter(r=>r.id===202).length,1);
  assert.equal(rows.find(r=>r.id===202).count,420000+255000);
  assert.equal(rows.filter(r=>r.id===110202).length,1);
  assert.equal(rows.find(r=>r.id===110202).count,30+23+23);
  assert.equal(rows.find(r=>r.id===110203).count,36+27+27);
  assert.equal(rows.find(r=>r.id===110204).count,41);
  assert.equal(demand.groups.filter(g=>g.rows.some(r=>r.id===110202)).length,1);
});
test('可用量只视为已返回的剩余量，未知库存保留 null', () => {
  const d=buildNanokaDemand({config:full,characterProfile:char,parts:{character:true}});
  const x=evaluateNanokaDemand(d,{available:[{id:10,num:42}],manual:{'10':47}});
  assert.equal(x.groups.flatMap(g=>g.rows).find(r=>r.id===10).stock,47);
  assert.equal(x.groups.flatMap(g=>g.rows).find(r=>r.id===10).lack,121);
  assert.equal(x.groups.flatMap(g=>g.rows).find(r=>r.id===101).lack,null);
});
test('等级材料需全部有库存后才进行向上合成，按材料 ID 识别', () => {
  const d=buildNanokaDemand({config:full,weaponProfile:weapon,parts:{weapon:true}});
  const manual={'401':0,'402':0,'403':0,'404':0,'110201':47,'110202':36,'110203':11,'110204':0};
  const x=evaluateNanokaDemand(d,{manual});
  assert.ok(x.groups.some(g=>g.family && g.complete && g.rows.some(r=>r.id===110204)));
  assert.equal(x.groups.find(g=>g.rows.some(r=>r.id===110201)).rows.find(r=>r.id===110201).stock,47);
});
test('前瞻尚未实装材料如果缺少 ID，报告未识别数量', () => {
  const incomplete=structuredClone(char);
  incomplete.materials.spec=null;
  const d=buildNanokaDemand({config:full,characterProfile:incomplete,parts:{character:true}});
  assert.deepEqual(d.unrecognized.map(x=>x.count),[168]);
});


test('每个 UID 的实际库存分别保存，错误输入在恢复时剔除', async () => {
  const {normalizeState} = await import('../core.mjs');
  const state = normalizeState({
    hybridInventory: {
      '123456789': {'110201':47,'110202':36,'110203':-1},
      '987654321': {'110201':13}
    }
  });
  assert.equal(state.hybridInventory['123456789']['110201'],47);
  assert.equal(state.hybridInventory['987654321']['110201'],13);
  assert.equal(state.hybridInventory['123456789']['110203'],undefined);
});


test('前瞻角色自动读取米游社探测数量，按实际培养目标计算',()=>{
  const demand=buildNanokaDemand({config:full,characterProfile:char,parts:{character:true}});
  const result=evaluateNanokaDemand(demand,{inventoryProbe:[{id:10,num:47,minimum:false}]});
  const row=result.groups.flatMap(g=>g.rows).find(r=>r.id===10);
  assert.equal(row.stock,47);
  assert.equal(row.lack,121);
  assert.equal(row.source,'米游社推算');
});

test('探测材料填充整个合成系列后直接计算缺口',()=>{
  const demand=buildNanokaDemand({config:full,weaponProfile:weapon,parts:{weapon:true}});
  const inventoryProbe=[
    {id:401,num:5},{id:402,num:14},{id:403,num:14},{id:404,num:6},
    {id:110201,num:47},{id:110202,num:36},
    {id:110203,num:11},{id:110204,num:0}
  ];
  const calculated=evaluateNanokaDemand(demand,{inventoryProbe});
  assert.ok(calculated.groups.filter(g=>g.rows.some(r=>r.id===110201||r.id===401)).every(g=>g.complete));
});

test('混合官方和前瞻目标时优先使用官方计算后的剩余量',()=>{
  const demand=buildNanokaDemand({config:full,characterProfile:char,parts:{character:true}});
  const result=evaluateNanokaDemand(demand,{
    inventoryProbe:[{id:202,num:2500000},{id:10,num:47}],
    officialMaterials:[{id:202,total:100000,lack:0}],
    available:[{id:202,num:18000}],mixed:true
  });
  const rows=result.groups.flatMap(g=>g.rows);
  assert.equal(rows.find(r=>r.id===202).stock,18000);
  assert.equal(rows.find(r=>r.id===10).stock,47);
  assert.equal(rows.find(r=>r.id===202).source,'官方计算后可用');
});
