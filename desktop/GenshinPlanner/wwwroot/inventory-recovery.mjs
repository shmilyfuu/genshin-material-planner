const idOf=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:0;};
const quantity=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
const familyFields={charGems:4,books:3,cult:3,weapGems:4,matA:3,matB:3};
const directFields=['spec','boss','weekly','crown'];
const skipped=new Set([10000117,10000118,10000005,10000007]);
export function readInventoryObservation(response){
  const data=response?.data;
  if(data?.has_user_info!==true||!Array.isArray(data.overall_consume)||!data.overall_consume.length)throw Error('米游社未返回带 UID 库存的材料计算结果。');
  const demand=new Map(),available=new Map();
  for(const row of data.overall_consume){
    const id=idOf(row?.id),num=quantity(row?.num),lack=quantity(row?.lack_num);
    if(!id||num===null||lack===null||lack>num||demand.has(id))throw Error('材料需求字段无效或重复。');
    demand.set(id,{num,lack});
  }
  for(const row of Array.isArray(data.available_material)?data.available_material:[]){
    const id=idOf(row?.id),num=quantity(row?.num);
    if(!id||num===null||available.has(id))throw Error('剩余材料字段无效或重复。');
    // A positive row is direct stock minus direct demand. Absence is not evidence of zero.
    if(num>0)available.set(id,num);
  }
  return {demand,available};
}
export function buildRecoveryCatalog(avatars,weapons,profiles){
  const families=new Map(),direct=new Set([202]),membership=new Map(),conflicts=new Set();
  const records=[];
  for(const [kind,rows] of [['character',avatars],['weapon',weapons]])for(const row of rows){
    const profile=profiles.get(kind+':'+idOf(row.id));
    if(!profile)continue;
    const materials=profile.materials||{};
    for(const field of directFields){const id=idOf(materials[field]?.id);if(id)direct.add(id);}
    for(const [field,size] of Object.entries(familyFields)){
      const list=materials[field];
      if(!Array.isArray(list)||list.length!==size||list.some(m=>!idOf(m?.id)))continue;
      const ids=list.map(m=>idOf(m.id));
      // Full consecutive IDs and ascending rarity prevent accidental links between families.
      if(!list.every((m,i)=>i===0||(ids[i]===ids[i-1]+1&&Number(m.rank)===Number(list[i-1].rank)+1)))continue;
      const key=ids.join(',');
      let group=families.get(key);
      if(!group){group={ids,sources:[]};families.set(key,group);}
      for(const id of ids){const old=membership.get(id);if(old&&old!==key){conflicts.add(old);conflicts.add(key);}else membership.set(id,key);}
      group.sources.push({kind,row,field,totals:list.map(m=>Number(m.total)||0)});
    }
    records.push({kind,row});
  }
  for(const key of conflicts)families.delete(key);
  for(const id of membership.keys())direct.delete(id);
  return {families:[...families.values()],direct,records};
}
function boundsFor(ids,observations){
  const n=ids.length,lo=Array(n).fill(0),hi=Array(n).fill(Infinity);
  let contradiction=false,changed=false;
  const constrain=(i,min,max)=>{
    const l=Math.max(lo[i],min,0),h=Math.min(hi[i],max);
    if(l>h||!Number.isFinite(l)){contradiction=true;return;}
    if(l!==lo[i]||h!==hi[i]){lo[i]=l;hi[i]=h;changed=true;}
  };
  const relevant=observations.filter(o=>ids.some(id=>o.demand.has(id)||o.available.has(id)));
  // First collect direct surplus evidence independently of virtual crafting.
  for(const o of relevant)for(let i=0;i<n;i++){
    const id=ids[i],d=o.demand.get(id)?.num||0,r=o.available.get(id);
    if(r!==undefined)constrain(i,d+r,d+r);
  }
  // Propagate lower/upper bounds on raw stock and the upward contribution.
  for(let pass=0;pass<n*4+4&&!contradiction;pass++){
    changed=false;
    for(const o of relevant){
      let carryLo=0,carryHi=0;
      for(let i=0;i<n;i++){
        const row=o.demand.get(ids[i]),d=row?.num||0;
        if(row){
          const fulfilled=d-row.lack;
          constrain(i,Math.max(0,fulfilled-carryHi),row.lack>0?fulfilled-carryLo:Infinity);
          if(row.lack>0&&(lo[i]+carryLo>fulfilled||hi[i]+carryHi<fulfilled))contradiction=true;
          if(row.lack===0&&hi[i]+carryHi<d)contradiction=true;
        }
        carryLo=Math.floor(Math.max(0,lo[i]+carryLo-d)/3);
        carryHi=Math.floor(Math.max(0,hi[i]+carryHi-d)/3);
      }
    }
    if(!changed)break;
  }
  return {ids,lo,hi,contradiction,observed:relevant.length>0};
}
export function recoverMaterialFamily(ids,observations){
  const result=boundsFor(ids,observations);
  const rows=result.contradiction||!result.observed?[]:ids.flatMap((id,i)=>{
    const exact=result.lo[i]===result.hi[i];
    return exact||result.lo[i]>0?[{id,num:result.lo[i],minimum:!exact}]:[];
  });
  return {...result,rows,complete:!result.contradiction&&result.observed&&result.lo.every((v,i)=>v===result.hi[i])};
}
export function recoverInventory(catalog,observations){
  const materials=[],unresolved=[],conflicts=[];
  const classified=new Set();
  for(const group of catalog.families){
    group.ids.forEach(id=>classified.add(id));
    const result=recoverMaterialFamily(group.ids,observations);
    if(result.contradiction)conflicts.push(group.ids);
    materials.push(...result.rows);
    unresolved.push(...group.ids.filter(id=>!result.rows.some(r=>r.id===id)));
  }
  for(const id of catalog.direct){
    if(classified.has(id))continue;
    classified.add(id);
    const result=recoverMaterialFamily([id],observations);
    materials.push(...result.rows);
    if(result.contradiction)conflicts.push([id]);
    if(!result.rows.length)unresolved.push(id);
  }
  for(const o of observations)for(const id of [...o.demand.keys(),...o.available.keys()])if(!classified.has(id)){classified.add(id);unresolved.push(id);}
  return {materials,unresolved:[...new Set(unresolved)],conflicts};
}
function baseItem(row){
  const item={avatar_id:idOf(row.id),avatar_level_current:1,avatar_level_target:1,avatar_promote_level:0,from_user_sync:false,skill_list:[]};
  if(idOf(row.element_attr_id))item.element_attr_id=idOf(row.element_attr_id);
  return item;
}
const stages=[[1,21],[21,51],[51,71],[71,90]];
const talentStages=[[1,2],[2,6],[6,10]];
export function buildFamilyProbe(group,tier,avatars){
  const candidates=group.sources.filter(s=>s.totals[tier]>0);
  const eligible=avatars.filter(a=>idOf(a.id)&&!skipped.has(idOf(a.id))&&a.name!=='旅行者');
  const used=new Set(),items=[];
  // Prefer sources with an isolated tier demand (weapon domains, talent books, gems).
  const priority=s=>['weapGems','books','charGems'].includes(s.field)?2:1;
  const sorted=[...candidates].sort((a,b)=>priority(b)-priority(a)||b.totals[tier]-a.totals[tier]);
  for(const source of sorted.filter(s=>s.kind==='character')){
    const row=source.row,id=idOf(row.id);
    if(used.has(id)||!eligible.some(a=>idOf(a.id)===id))continue;
    const item=baseItem(row);
    if(source.field==='books'){
      const [start,end]=talentStages[tier],seen=new Set();
      item.skill_list=(row.skill_list||[]).flatMap(skill=>{
        const id=idOf(skill.group_id||skill.id);
        if(!id||seen.has(id)||Number(skill.max_level)<end)return [];
        seen.add(id);return [{id,level_current:start,level_target:end}];
      });
      if(!item.skill_list.length)continue;
    }else if(source.field==='charGems'){
      const [start,end]=stages[tier];
      item.avatar_level_current=start;item.avatar_level_target=end;
      item.avatar_promote_level=[0,1,3,5][tier];
    }else{
      // Character drops can be isolated imperfectly; retain actual observed demands.
      item.avatar_level_target=90;
      const seen=new Set();
      item.skill_list=(row.skill_list||[]).flatMap(skill=>{const id=idOf(skill.group_id||skill.id);if(!id||seen.has(id)||Number(skill.max_level)<10)return [];seen.add(id);return [{id,level_current:1,level_target:10}];});
    }
    items.push(item);used.add(id);if(items.length>=30)return items;
  }
  const weaponSources=sorted.filter(s=>s.kind==='weapon');
  for(const row of eligible){
    const id=idOf(row.id);if(used.has(id))continue;
    const source=weaponSources.find(s=>idOf(s.row.weapon_cat_id)===idOf(row.weapon_cat_id));
    if(!source)continue;
    const item=baseItem(row),max=Number(source.row.max_level)||90;
    const [start,end]=source.field==='weapGems'?stages[tier]:[1,90];
    if(max<=start)continue;
    item.weapon={id:idOf(source.row.id),level_current:start,level_target:Math.min(max,end)};
    items.push(item);used.add(id);if(items.length>=30)break;
  }
  return items;
}
