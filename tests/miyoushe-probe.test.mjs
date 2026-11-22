import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../miyoushe-calculator.js',import.meta.url),'utf8');
function call(expression,variables={}){
  return vm.runInNewContext(code+'\n'+expression,{MYS:{takumi:'https://api-takumi.mihoyo.com'},...variables});
}
const role=(id)=>({
  id,name:'角色'+id,weapon_cat_id:1,element_attr_id:2,
  skill_list:[{group_id:1101,max_level:10},{group_id:1102,max_level:10}]
});
test('完整角色目录包含第20名以后的瓦列里',()=>{
  const avatars=Array.from({length:25},(_,i)=>role(10000020+i));
  avatars.push(role(10000137));
  const rows=call('mysBuildInventoryProbeItems(avatars,weapons)',{
    avatars,weapons:[{id:15517,weapon_cat_id:1,max_level:90}]
  });
  assert.equal(rows.length,26);
  assert.ok(Array.from(rows).some(row=>row.avatar_id===10000137));
  assert.ok(Array.from(rows).every(row=>row.weapon.id===15517));
});
test('已抵扣数量加可用量形成库存参考，保留实测47与36',()=>{
  const response={data:{
    has_user_info:true,
    overall_consume:[
      {id:101,num:168,lack_num:121},
      {id:20201,num:14,lack_num:0},
      {id:20202,num:36,lack_num:22},
      {id:20203,num:47,lack_num:42}
    ],
    available_material:[{id:20202,num:22},{id:20203,num:42}]
  }};
  const rows=call('mysProbeInventoryRows(response)',{response});
  assert.equal(Array.from(rows).find(r=>r.id===101).num,47);
  assert.equal(Array.from(rows).find(r=>r.id===20202).num,36);
  assert.equal(Array.from(rows).find(r=>r.id===20203).num,47);
});
test('真实返回零与接口未返回区分，缺少 UID 信息时报错',()=>{
  const response={data:{has_user_info:true,overall_consume:[],
    available_material:[{id:111,num:0}]}};
  const rows=call('mysProbeInventoryRows(response)',{response});
  assert.equal(Array.from(rows).find(r=>r.id===111).num,0);
  assert.equal(Array.from(rows).some(r=>r.id===222),false);
  assert.throws(()=>call('mysProbeInventoryRows(response)',{
    response:{data:{has_user_info:false,overall_consume:[]}}
  }),/UID/);
});
test('旅行者和缺少技能列表的角色不加入探测',()=>{
  const avatars=[role(10000005),role(10000007),role(10000137),
    {id:10000200,skill_list:[]}];
  const rows=call('mysBuildInventoryProbeItems(avatars,[])',{avatars});
  assert.deepEqual(Array.from(rows,r=>r.avatar_id),[10000137]);
});
