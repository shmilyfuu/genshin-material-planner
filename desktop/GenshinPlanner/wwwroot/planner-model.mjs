import {cloneDefaultState} from './core.mjs';

export const goalKind = goal => goal?.kind || (goal?.source?.selectedCharacterId ? 'character' : 'weapon');
export const goalObjectId = goal => String(goalKind(goal)==='character'
  ? goal?.source?.selectedCharacterId || '' : goal?.source?.selectedWeaponId || '');
export const activeGoals = state => state.plans.filter(g=>g.enabled !== false && g.completed !== true && goalObjectId(g));
export const characterGoal = (state,id) => state.plans.find(g=>goalKind(g)==='character' && goalObjectId(g)===String(id));
export const weaponGoal = (state,instanceId) => state.plans.find(g=>goalKind(g)==='weapon' && g.weaponInstanceId===instanceId);
export const weaponInstance = (state,id) => state.weaponInstances.find(w=>w.id===id);
export const newId = prefix => prefix+'-'+Math.random().toString(36).slice(2,9)+Date.now().toString(36);

export function makeGoal(kind,row,{id=newId('goal'),instanceId='',current=null}={}){
  const defaults=cloneDefaultState();
  const source={...defaults.source};
  const config=structuredClone(defaults.config);
  if(kind==='character'){
    Object.assign(source,{selectedCharacterId:String(row.id),selectedCharacterName:row.name,
      selectedCharacterTag:row.sourceTag||'',selectedCharacterVersion:row.version||''});
    if(current){config.charAsc[0]=Math.max(0,Math.min(6,Number(current.ascension)||0));
      config.charAsc[1]=Math.max(config.charAsc[0],6);
      for(const [key,talent] of [['talentA','auto'],['talentE','skill'],['talentQ','burst']]){
        const level=Math.max(0,Math.min(9,(Number(current.talent?.[talent])||1)-1));
        config[key]=[level,9];
      }
    }
    else {config.charAsc=[0,6];for(const key of ['talentA','talentE','talentQ'])config[key]=[0,9];}
  }else{
    Object.assign(source,{selectedWeaponId:String(row.id),selectedWeaponName:row.name,
      selectedWeaponTag:row.sourceTag||'',selectedWeaponVersion:row.version||''});
    config.weapAsc=[Math.max(0,Math.min(6,Number(current?.ascension)||0)),6];
  }
  return {id,kind,weaponInstanceId:kind==='weapon'?instanceId:'',linkedWeaponInstanceId:'',
    source,config,enabled:true,completed:false};
}

export function makeWeaponInstance(row,fields={}){
  return {id:newId('weapon'),weaponId:String(row.id),key:String(fields.key||row.goodKey||''),
    level:Number(fields.level)||1,ascension:Number(fields.ascension)||0,
    refinement:Number(fields.refinement)||1,location:String(fields.location||''),
    lock:Boolean(fields.lock),scanned:Boolean(fields.scanned)};
}

export function initializePlanner(state){
  state.ownedCharacters ||= {};
  state.weaponInstances ||= [];
  if(state.plannerSchema===2){
    if(state.plans.length===1&&!goalObjectId(state.plans[0])){
      state.plans=[];state.activePlanId='';
    }
    return state;
  }
  const next=[];
  const existing=[];
  for(const old of state.plans||[]){
    const c=String(old.source?.selectedCharacterId||'');
    const w=String(old.source?.selectedWeaponId||'');
    if(!c&&!w)continue;
    let weaponGoalRecord=null;
    if(w){
      const instance={id:newId('weapon'),weaponId:w,key:'',level:1,ascension:Number(old.config?.weapAsc?.[0])||0,
        refinement:1,location:'',lock:false,scanned:false};
      existing.push(instance);
      const copy=structuredClone(old);
      copy.id=c?newId('goal'):copy.id;
      copy.kind='weapon';copy.weaponInstanceId=instance.id;copy.linkedWeaponInstanceId='';
      copy.completed=old.completed===true;
      copy.source.selectedCharacterId='';copy.source.selectedCharacterName='';
      copy.config.charAsc=[0,0];copy.config.talentA=[0,0];copy.config.talentE=[0,0];copy.config.talentQ=[0,0];
      weaponGoalRecord=copy;
    }
    if(c){
      const copy=structuredClone(old);copy.kind='character';copy.weaponInstanceId='';
      copy.linkedWeaponInstanceId=weaponGoalRecord?.weaponInstanceId||'';
      copy.completed=old.completed===true;
      copy.source.selectedWeaponId='';copy.source.selectedWeaponName='';
      copy.config.weapAsc=[0,0];next.push(copy);
    }
    if(weaponGoalRecord)next.push(weaponGoalRecord);
  }
  state.weaponInstances=[...state.weaponInstances,...existing];
  state.plans=next;
  state.activePlanId=next[0]?.id||'';
  state.plannerSchema=2;
  return state;
}

export function setLink(state,charGoalId,instanceId){
  const character=state.plans.find(g=>g.id===charGoalId && goalKind(g)==='character');
  if(!character)throw Error('角色培养目标不存在');
  if(instanceId && !weaponInstance(state,instanceId))throw Error('武器实例不存在');
  character.linkedWeaponInstanceId=instanceId||'';
  return character;
}

export function visibleRoster(state,tab,characters,weapons,sortByNewest){
  if(tab==='character'){
    return characters.map(row=>({...row,goal:characterGoal(state,row.id),owned:state.ownedCharacters?.[row.id]}))
      .sort((a,b)=>{
        const tier=r=>aR(r.goal)?0:r.owned||r.goal?.completed?1:2;
        const difference=tier(a)-tier(b);return difference||sortByNewest(a,b);
      });
  }
  const grouped=new Map();
  for(const item of state.weaponInstances){
    const w=weapons.find(row=>row.id===item.weaponId);
    if(!w)continue;
    const items=grouped.get(w.id)||[];items.push({...w,instance:item,goal:weaponGoal(state,item.id),owned:true});grouped.set(w.id,items);
  }
  const values=[];
  for(const row of weapons){
    const matched=grouped.get(row.id)||[];
    if(matched.length)values.push(...matched);
    else values.push({...row,instance:null,goal:null,owned:false});
  }
  const tier=r=>aR(r.goal)?0:r.owned||r.goal?.completed?1:2;
  return values.sort((a,b)=>tier(a)-tier(b)||Number(b.rarity)-Number(a.rarity)||sortByNewest(a,b)
    ||Number(b.instance?.level||0)-Number(a.instance?.level||0)
    ||String(a.instance?.id||'').localeCompare(String(b.instance?.id||'')));
}
function aR(g){return g && g.enabled!==false && g.completed!==true;}
