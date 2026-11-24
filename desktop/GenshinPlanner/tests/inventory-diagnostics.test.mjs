import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDiagnosticCases,captureDiagnosticResponse,weaponMatchesFamily,DIAGNOSTIC_FAMILY_IDS} from '../wwwroot/inventory-diagnostics.mjs';
const avatars=Array.from({length:12},(_,i)=>({id:10000020+i,weapon_cat_id:1}));
const silver={id:11599,name:'银昼',weapon_cat_id:1,max_level:90},other={id:11499,name:'戍望谣歌',weapon_cat_id:1,max_level:90};
test('诊断包含 A B C 和四档单把与高需求测试，武器实例独立载体',()=>{
 const cases=buildDiagnosticCases(avatars,[silver,other],[silver,other]);
 assert.equal(cases.length,11);
 assert.equal(cases[0].items.length,1);
 assert.equal(cases[1].items.length,2);
 assert.equal(cases[2].items.length,2);
 assert.deepEqual(cases.filter(c=>c.id.endsWith('-high')).map(c=>c.items.length),[10,4,3,2]);
 assert.deepEqual(cases.filter(c=>c.id.endsWith('-high')).map(c=>[c.items[0].weapon.level_current,c.items[0].weapon.level_target]),[[1,21],[21,51],[51,71],[71,90]]);
 for(const c of cases){assert.equal(new Set(c.items.map(x=>x.avatar_id)).size,c.items.length);assert.ok(c.items.every(x=>x.avatar_level_current===1&&x.avatar_level_target===1));}
});
test('载体不足时记录遗漏，避免声称达到测试需求',()=>{
 const cases=buildDiagnosticCases(avatars.slice(0,2),[silver],[silver]);
 const high=cases.find(x=>x.id==='D-green-high');
 assert.equal(high.requestedCopies,10);assert.equal(high.items.length,2);assert.equal(high.omitted.length,8);
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
