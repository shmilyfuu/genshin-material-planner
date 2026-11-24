import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDiagnosticCases,captureDiagnosticResponse,weaponMatchesFamily,DIAGNOSTIC_FAMILY_IDS} from '../wwwroot/inventory-diagnostics.mjs';
const avatars=Array.from({length:24},(_,i)=>({id:10000020+i,weapon_cat_id:i<12?10:12}));
const snow={id:14437,name:'凝雪沉心',weapon_cat_id:10,max_level:90,familyDemand:[3,9,9,4]};
const star={id:14525,name:'秘星典谕',weapon_cat_id:10,max_level:90,familyDemand:[5,14,14,6]};
const bow={id:15437,name:'柔风游弦',weapon_cat_id:12,max_level:90,familyDemand:[3,9,9,4]};
test('银昼未收录时，直接选择已验证的凝雪沉心，按真实四星需求构造诊断',()=>{
 const cases=buildDiagnosticCases(avatars,[snow,star,bow],[snow,star,bow]);
 assert.equal(cases.length,11);
 assert.equal(cases[0].targetWeapon.id,14437);
 assert.deepEqual(cases[0].expectedDemand,[3,9,9,4]);
 assert.deepEqual(cases[1].expectedDemand,[6,18,18,8]);
 assert.equal(cases[0].items.length,1);
 assert.equal(cases[1].items.length,2);
 assert.equal(cases[2].items.length,3);
 assert.deepEqual(cases.filter(c=>c.id.endsWith('-high')).map(c=>[c.items[0].weapon.level_current,c.items[0].weapon.level_target]),[[1,21],[21,51],[51,71],[71,90]]);
 assert.ok(cases.filter(c=>c.id.endsWith('-high')).every(c=>c.targetReached&&c.expectedDemand>=c.targetDemand));
 for(const c of cases){assert.equal(new Set(c.items.map(x=>x.avatar_id)).size,c.items.length);assert.ok(c.items.every(x=>x.avatar_level_current===1&&x.avatar_level_target===1));}
});
test('同系列候选可跨武器类型达到高需求，载体不足明确记录',()=>{
 const cases=buildDiagnosticCases(avatars,[snow,bow],[snow,bow]);
 const high=cases.find(x=>x.id==='D-green-high');
 assert.equal(high.items.length,17);assert.equal(high.expectedDemand,51);assert.equal(high.targetReached,true);
 assert.ok(high.items.some(x=>x.weapon.id===bow.id));
 const small=buildDiagnosticCases(avatars.slice(0,2),[snow],[snow]).find(x=>x.id==='D-green-high');
 assert.equal(small.items.length,2);assert.equal(small.expectedDemand,6);assert.equal(small.targetReached,false);
});
test('凝雪沉心未收录时可使用其他已验证武器，不依赖前瞻武器',()=>{
 const cases=buildDiagnosticCases(avatars,[star],[star]);
 assert.equal(cases[0].targetWeapon.id,star.id);assert.deepEqual(cases[0].expectedDemand,[5,14,14,6]);
 assert.throws(()=>buildDiagnosticCases(avatars,[star],[]),/官方目录/);
});
test('材料家族以完整四档 ID 匹配',()=>{
 assert.equal(weaponMatchesFamily({materials:{weapGems:DIAGNOSTIC_FAMILY_IDS.map(id=>({id}))}}),true);
 assert.equal(weaponMatchesFamily({materials:{weapGems:[{id:114093}]}}),false);
});
test('记录原始材料字段，排除账号和凭证字段',()=>{
 const response={retcode:0,data:{has_user_info:true,uid:'123456789',cookie:'secret',overall_consume:[{id:114096,num:6,lack_num:3,extra:0}],available_material:[{id:114093,num:42}]}};
 const result=captureDiagnosticResponse(response);
 assert.deepEqual(result.overall_consume,response.data.overall_consume);
 assert.deepEqual(result.available_material,response.data.available_material);
 assert.equal(result.familyRows[3].overall[0].lack_num,3);
 assert.equal(result.familyRows[0].available[0].num,42);
 assert.ok(!JSON.stringify(result).includes('secret'));assert.ok(!JSON.stringify(result).includes('123456789'));
});
