import {characterGoal,weaponGoal,newId} from './planner-model.mjs';

export function goodKey(name){return String(name||'').replace(/[^a-zA-Z0-9 ]/g,'').split(/\s+/)
  .filter(Boolean).map(s=>s[0].toUpperCase()+s.slice(1)).join('');}
function catalogLookup(rows){
  const map=new Map();
  for(const row of rows){
    for(const name of [row.goodKey,row.en,row.englishName]){
      const key=goodKey(name);if(key)map.set(key.toLowerCase(),row);
    }
  }
  return map;
}
export function validateGOOD(data){
  if(!data||data.format!=='GOOD'||Number(data.version)!==3)throw Error('请选择 GGScanner 导出的 GOOD v3 JSON。');
  if(!Array.isArray(data.characters)&&!Array.isArray(data.weapons))throw Error('GOOD 文件缺少角色或武器列表。');
  return data;
}

// The GOOD format does not contain persistent weapon instance IDs. Match only unique
// item identities; identical copies retain their local IDs and require confirmation
// if a training goal could be associated with a different physical copy.
export function importGOOD(state,raw,{characters=[],weapons=[],confirmAmbiguous=false}={}){
  const data=validateGOOD(raw);
  const lookupCharacter=catalogLookup(characters),lookupWeapon=catalogLookup(weapons);
  const warnings=[];const unmatched=[];const ambiguous=[];
  const updatedChars=[];const newWeapons=[];const updatedWeapons=[];
  if(!state.ownedCharacters)state.ownedCharacters={};
  if(!state.weaponInstances)state.weaponInstances=[];
  for(const c of data.characters||[]){
    const match=lookupCharacter.get(String(c.key||'').toLowerCase());
    if(!match){unmatched.push('角色 '+c.key);continue;}
    const clean={key:c.key,level:Number(c.level)||1,ascension:Number(c.ascension)||0,
      constellation:Number(c.constellation)||0,talent:{auto:Number(c.talent?.auto)||1,
      skill:Number(c.talent?.skill)||1,burst:Number(c.talent?.burst)||1},
      element:String(c.element||'')};
    state.ownedCharacters[match.id]=clean;
    const target=characterGoal(state,match.id);
    if(target){
      target.config.charAsc[0]=Math.min(target.config.charAsc[1],Math.max(0,Math.min(6,clean.ascension)));
      for(const [part,field] of [['talentA','auto'],['talentE','skill'],['talentQ','burst']]){
        target.config[part][0]=Math.min(target.config[part][1],Math.max(0,Math.min(9,clean.talent[field]-1)));
      }
    }
    updatedChars.push(match.id);
  }
  const incoming=[];
  for(const w of data.weapons||[]){
    const match=lookupWeapon.get(String(w.key||'').toLowerCase());
    if(!match){unmatched.push('武器 '+w.key);continue;}
    incoming.push({weaponId:match.id,key:String(w.key),level:Number(w.level)||1,
      ascension:Number(w.ascension)||0,refinement:Number(w.refinement)||1,
      location:String(w.location||''),lock:!!w.lock,scanned:true});
  }
  const existing=state.weaponInstances;
  const fingerprint=w=>[w.weaponId,w.level,w.ascension,w.refinement,w.location].join('|');
  const note=w=>ambiguous.push(`${w.key} Lv.${w.level} R${w.refinement}`);
  const add=w=>{const item={id:newId('weapon'),...w};existing.push(item);newWeapons.push(item.id);};
  const update=(old,w)=>{
    Object.assign(old,w);
    const target=weaponGoal(state,old.id);
    if(target)target.config.weapAsc[0]=Math.min(target.config.weapAsc[1],Math.max(0,Math.min(6,Math.trunc(w.ascension))));
    updatedWeapons.push(old.id);
  };
  for(const weaponId of new Set(incoming.map(w=>w.weaponId))){
    const old=existing.filter(w=>w.weaponId===weaponId);
    const fresh=incoming.filter(w=>w.weaponId===weaponId);
    const unused=new Set(old),pending=new Set(fresh);
    // Reserve all exact identities before considering changes of level or equipment.
    for(const key of new Set(fresh.map(fingerprint))){
      const a=old.filter(w=>unused.has(w)&&fingerprint(w)===key);
      const b=fresh.filter(w=>pending.has(w)&&fingerprint(w)===key);
      if(!a.length)continue;
      if(a.length===1&&b.length===1){update(a[0],b[0]);}
      else{
        b.forEach(note);
        if(confirmAmbiguous)for(let i=0;i<Math.min(a.length,b.length);i++)update(a[i],b[i]);
        for(let i=a.length;i<b.length;i++)add(b[i]);
      }
      a.forEach(w=>unused.delete(w));b.forEach(w=>pending.delete(w));
    }
    for(const location of new Set([...pending].map(w=>w.location).filter(Boolean))){
      const a=[...unused].filter(w=>w.location===location),b=[...pending].filter(w=>w.location===location);
      if(a.length===1&&b.length===1){update(a[0],b[0]);unused.delete(a[0]);pending.delete(b[0]);}
    }
    if(unused.size===1&&pending.size===1){update([...unused][0],[...pending][0]);pending.clear();}
    if(!unused.size){for(const w of pending)add(w);}
    else if(pending.size){
      for(const w of pending)note(w);
      // The count is known, but the identities of changed copies are not.
      const shortage=Math.max(0,fresh.length-existing.filter(w=>w.weaponId===weaponId).length);
      for(const w of [...pending].slice(0,shortage))add(w);
    }
  }
  // Adopt a scanned equipment relationship only when a character already has a
  // cultivation goal and has not explicitly linked a weapon instance.
  const charNames=new Map();
  for(const row of characters){
    for(const text of [row.goodKey,row.en,row.englishName]){
      const key=goodKey(text);if(key)charNames.set(key.toLowerCase(),String(row.id));
    }
  }
  for(const item of existing){
    if(!item.location)continue;
    const charId=charNames.get(goodKey(item.location).toLowerCase());
    const target=charId?characterGoal(state,charId):null;
    if(target&&!target.linkedWeaponInstanceId)target.linkedWeaponInstanceId=item.id;
  }
  if(ambiguous.length)warnings.push('部分重复武器无法确定原实例，已保留现有记录：'+[...new Set(ambiguous)].join('、'));
  if(unmatched.length)warnings.push('未匹配的 GOOD 标识：'+unmatched.join('、'));
  return {characters:updatedChars.length,newWeapons:newWeapons.length,
    updatedWeapons:updatedWeapons.length,ambiguous,unmatched,warnings,
    uid:String(data.metadata?.uid||''),source:String(data.source||'')};
}
