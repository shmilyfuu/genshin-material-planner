const familyIds=[114093,114094,114095,114096];
const knownNames=['银昼','凝雪沉心','柔风游弦','戍望谣歌','秘星典谕'];
const skipped=new Set([10000117,10000118,10000005,10000007]);
export const DIAGNOSTIC_FAMILY_IDS=Object.freeze(familyIds);
export const DIAGNOSTIC_KNOWN_NAMES=Object.freeze(knownNames);
const idOf=value=>Number(value);
export function weaponMatchesFamily(profile){
  const gems=profile?.materials?.weapGems;
  return Array.isArray(gems)&&gems.length===4&&gems.every((row,i)=>idOf(row?.id)===familyIds[i]);
}
export function buildDiagnosticCases(avatars,weapons,family){
  const unique=new Map();
  for(const avatar of avatars){
    const id=idOf(avatar.id),category=idOf(avatar.weapon_cat_id);
    if(!Number.isSafeInteger(id)||id<=0||!category||skipped.has(id)||avatar.name==='旅行者'||unique.has(id))continue;
    unique.set(id,avatar);
  }
  const carriers=[...unique.values()];
  const officialIds=new Set(weapons.map(w=>idOf(w.id)));
  const verified=new Map(family.filter(w=>officialIds.has(idOf(w.id))&&Array.isArray(w.familyDemand)
    &&w.familyDemand.length===4&&w.familyDemand.every(n=>Number.isSafeInteger(n)&&n>0)).map(w=>[idOf(w.id),w]));
  const valid=[...verified.values()].filter(w=>carriers.some(c=>idOf(c.weapon_cat_id)===idOf(w.weapon_cat_id)));
  const target=valid.find(w=>idOf(w.id)===14437)
    ||valid.find(w=>String(w.name).trim()==='银昼')||valid[0];
  if(!target)throw Error('官方目录中没有已确认凛雪帝皇系列且具有可用角色载体的武器。');
  function createItems(specs){
    const used=new Set(),items=[],omitted=[];
    for(const spec of specs){
      const weapon=spec.weapon;
      const carrier=carriers.find(row=>idOf(row.weapon_cat_id)===idOf(weapon.weapon_cat_id)&&!used.has(idOf(row.id)));
      if(!carrier){omitted.push({weaponId:idOf(weapon.id),name:weapon.name,reason:'同类型独立角色载体不足'});continue;}
      used.add(idOf(carrier.id));
      const item={avatar_id:idOf(carrier.id),avatar_level_current:1,avatar_level_target:1,avatar_promote_level:0,from_user_sync:false,skill_list:[],weapon:{id:idOf(weapon.id),level_current:spec.current,level_target:Math.min(spec.target,Number(weapon.max_level)||90)}};
      const element=idOf(carrier.element_attr_id);if(Number.isSafeInteger(element)&&element>0)item.element_attr_id=element;
      items.push(item);
    }
    return {items,omitted};
  }
  const full=weapon=>({weapon,current:1,target:90});
  function make(id,label,specs,extra={}){
    return {id,label,...extra,requestedCopies:specs.length,...createItems(specs)};
  }
  const cases=[
    make('A','单把'+target.name+' 1→90',[full(target)],{expectedDemand:[...target.familyDemand],targetWeapon:{id:idOf(target.id),name:target.name}}),
    make('B','两把'+target.name+' 1→90',[full(target),full(target)],{expectedDemand:target.familyDemand.map(n=>n*2),targetWeapon:{id:idOf(target.id),name:target.name}}),
    make('C','同系列武器集中培养',[...verified.values()].map(full))
  ];
  const stages=[
    {key:'green',name:'绿色',current:1,target:21,desired:50},
    {key:'blue',name:'蓝色',current:21,target:51,desired:56},
    {key:'purple',name:'紫色',current:51,target:71,desired:42},
    {key:'gold',name:'金色',current:71,target:90,desired:12}
  ];
  for(let i=0;i<stages.length;i++){
    const stage=stages[i],spec={weapon:target,current:stage.current,target:stage.target};
    const meta={materialId:familyIds[i],targetDemand:stage.desired,levelRange:[stage.current,stage.target],expectedPerCopy:target.familyDemand[i]};
    cases.push(make('D-'+stage.key+'-single',stage.name+' 单把阶段验证',[spec],meta));
    // Use independent carrier slots across weapon categories to reach the requested demand.
    const byCategory=new Map();
    for(const weapon of valid){
      const cat=idOf(weapon.weapon_cat_id),old=byCategory.get(cat);
      if(!old||weapon.familyDemand[i]>old.familyDemand[i])byCategory.set(cat,weapon);
    }
    const slots=carriers.map(c=>byCategory.get(idOf(c.weapon_cat_id))).filter(Boolean)
      .sort((a,b)=>b.familyDemand[i]-a.familyDemand[i]||idOf(a.id)-idOf(b.id));
    const specs=[];let expected=0;
    for(const weapon of slots){
      if(expected>=stage.desired||specs.length>=30)break;
      specs.push({weapon,current:stage.current,target:stage.target});
      expected+=weapon.familyDemand[i];
    }
    cases.push(make('D-'+stage.key+'-high',stage.name+' 集中需求',specs,{...meta,expectedDemand:expected,targetReached:expected>=stage.desired}));
  }
  return cases;
}
export function captureDiagnosticResponse(response){
  const data=response?.data;
  const copy=rows=>Array.isArray(rows)?structuredClone(rows):null;
  const overall=copy(data?.overall_consume),available=copy(data?.available_material);
  return {retcode:response?.retcode??null,has_user_info:data?.has_user_info??null,
    overall_consume:overall,available_material:available,
    familyRows:familyIds.map(id=>({id,overall:overall?.filter(row=>idOf(row?.id)===id)??[],available:available?.filter(row=>idOf(row?.id)===id)??[]}))};
}
