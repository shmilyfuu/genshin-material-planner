const skipped=new Set([10000117,10000118,10000005,10000007]);
function idOf(value){const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:0;}
function unique(rows){const map=new Map();for(const row of rows||[]){const id=idOf(row?.id);if(id&&!map.has(id))map.set(id,row);}return [...map.values()];}
function baseItem(row,target){
  const item={avatar_id:idOf(row.id),avatar_level_current:1,avatar_level_target:target,avatar_promote_level:0,from_user_sync:false,skill_list:[]};
  const element=idOf(row.element_attr_id);if(element)item.element_attr_id=element;
  return item;
}
export function buildInventoryRequests(avatars,weapons){
  const eligible=unique(avatars).filter(row=>!skipped.has(idOf(row.id))&&row.name!=='旅行者');
  const allWeapons=unique(weapons);
  if(!eligible.length||!allWeapons.length)throw Error('官方角色或武器目录为空。');
  const chars=eligible.map(row=>{
    const item=baseItem(row,90),seen=new Set();
    item.skill_list=(row.skill_list||[]).flatMap(skill=>{
      const id=idOf(skill.group_id||skill.id);
      if(!id||Number(skill.max_level)<10||!Number.isFinite(Number(skill.max_level))||seen.has(id))return [];
      seen.add(id);return [{id,level_current:1,level_target:10}];
    });
    return item;
  });
  const carriers=new Map();
  for(const row of eligible){
    const category=idOf(row.weapon_cat_id);if(!category)continue;
    if(!carriers.has(category))carriers.set(category,[]);
    carriers.get(category).push(row);
  }
  const batches=[chars],pending=[...allWeapons];
  while(pending.length){
    const used=new Set(),batch=[];
    for(let i=0;i<pending.length&&batch.length<30;){
      const weapon=pending[i],category=idOf(weapon.weapon_cat_id);
      const group=carriers.get(category);
      if(!group?.length)throw Error('武器 '+String(weapon.name||weapon.id)+' 缺少对应类型的角色载体。');
      const carrier=group.find(row=>!used.has(idOf(row.id)));
      if(!carrier){i++;continue;}
      const item=baseItem(carrier,1),max=Number(weapon.max_level);
      item.weapon={id:idOf(weapon.id),level_current:1,level_target:Number.isInteger(max)&&max>1?Math.min(90,max):90};
      used.add(item.avatar_id);batch.push(item);pending.splice(i,1);
    }
    if(!batch.length)throw Error('武器目录无法完整组装。');
    batches.push(batch);
  }
  return {batches,characterCount:chars.length,weaponCount:allWeapons.length};
}
export function readInventoryRows(response){
  const data=response?.data;
  if(data?.has_user_info!==true||!Array.isArray(data.overall_consume))throw Error('米游社未返回带 UID 库存的材料计算结果。');
  if(!data.overall_consume.length)throw Error('米游社返回空材料结果。');
  const rows=[];
  for(const row of data.overall_consume){
    const id=idOf(row?.id),total=Number(row?.num),lack=Number(row?.lack_num);
    if(!id||row.num==null||row.lack_num==null||!Number.isSafeInteger(total)||!Number.isSafeInteger(lack)||total<0||lack<0||lack>total)continue;
    rows.push({id,num:total-lack,minimum:lack===0});
  }
  if(!rows.length)throw Error('材料返回字段无效。');
  return rows;
}
export function mergeInventoryRows(values,rows){
  for(const row of rows){
    const previous=values.get(row.id);
    if(!previous||row.num>previous.num||(row.num===previous.num&&previous.minimum&&!row.minimum))values.set(row.id,row);
  }
  return values;
}
