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
