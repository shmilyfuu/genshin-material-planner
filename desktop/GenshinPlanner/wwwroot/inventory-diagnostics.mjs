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
  const target=weapons.find(w=>String(w.name).trim()==='银昼');
  if(!target)throw Error('官方武器目录未找到银昼。');
  const verified=new Map(family.map(w=>[idOf(w.id),w]));
  if(!verified.has(idOf(target.id)))throw Error('银昼突破材料未匹配凛雪帝皇系列。');
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
    make('A','单把银昼 1→90',[full(target)],{expectedDemand:[5,14,14,6]}),
    make('B','两把银昼 1→90',[full(target),full(target)],{expectedDemand:[10,28,28,12]}),
    make('C','同系列武器集中培养',[...verified.values()].map(full))
  ];
  const stages=[
    {key:'green',name:'绿色',current:1,target:21,perCopy:5,desired:50},
    {key:'blue',name:'蓝色',current:21,target:51,perCopy:14,desired:56},
    {key:'purple',name:'紫色',current:51,target:71,perCopy:14,desired:42},
    {key:'gold',name:'金色',current:71,target:90,perCopy:6,desired:12}
  ];
  for(let i=0;i<stages.length;i++){
    const stage=stages[i],spec={weapon:target,current:stage.current,target:stage.target};
    const meta={materialId:familyIds[i],targetDemand:stage.desired,levelRange:[stage.current,stage.target],expectedPerCopy:stage.perCopy};
    cases.push(make('D-'+stage.key+'-single',stage.name+' 单把阶段验证',[spec],meta));
    cases.push(make('D-'+stage.key+'-high',stage.name+' 集中需求',Array.from({length:Math.ceil(stage.desired/stage.perCopy)},()=>spec),meta));
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
