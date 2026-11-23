const talentPatterns = [
  [/自由|自由的/,1],[/抗争/,2],[/诗文/,3],
  [/繁荣/,1],[/勤劳/,2],[/黄金/,3],
  [/浮世/,1],[/风雅/,2],[/天光/,3],
  [/诤言/,1],[/巧思/,2],[/笃行/,3],
  [/公平/,1],[/正义/,2],[/秩序/,3],
  [/角逐/,1],[/焚燔/,2],[/纷争/,3],
  [/月光/,1],[/乐园/,2],[/浪迹/,3]
];
const weaponPatterns = [
  [/高塔孤王|高塔之王/,1],[/凛风奔狼/,2],[/狮牙斗士/,3],
  [/孤云寒林/,1],[/雾海云间/,2],[/漆黑陨铁/,3],
  [/远海夷地/,1],[/鸣神御灵/,2],[/今昔剧画/,3],
  [/谧林涓露/,1],[/绿洲花园/,2],[/烈日威权/,3],
  [/悠古弦音/,1],[/纯圣露滴/,2],[/无垢之海/,3],
  [/贡祭炽心/,1],[/谵妄圣主/,2],[/神合秘烟|神秘烟霭/,3],
  [/奇巧秘器/,1],[/长夜燧火/,2],[/终北遗嗣/,3]
];
export function weeklyMaterialDay(name,kind){
  const patterns=kind==='weapon'?weaponPatterns:talentPatterns;
  const row=patterns.find(([pattern])=>pattern.test(String(name||'')));
  return row?row[1]:null;
}

export function calendarForEntries(entries,deficits){
  const days=Array.from({length:7},()=>[]);
  const unknown=[];
  const demand=new Map(deficits.groups.flatMap(group=>group.rows)
    .map(row=>[String(row.id),row]));
  const seen=new Set();
  for(const entry of entries){
    for(const [kind,raw] of [['talent',entry.characterProfile?.materials?.books],
      ['weapon',entry.weaponProfile?.materials?.weapGems]]){
      const family=(raw||[]).filter(item=>item?.id);
      if(!family.length)continue;
      const required=family.filter(item=>(demand.get(String(item.id))?.count||0)>0);
      if(!required.length)continue;
      const key=kind+':'+family.map(item=>String(item.id)).join(',');
      if(seen.has(key))continue;
      seen.add(key);
      const icon=family[family.length-1];
      const lack=family.reduce((total,item)=>total+(demand.get(String(item.id))?.lack||0),0);
      const row={id:String(icon.id),name:String(icon.name||''),kind,lack,highlight:lack>0};
      const day=family.map(item=>weeklyMaterialDay(item.name,kind)).find(Boolean);
      if(!day){unknown.push(row);continue;}
      for(const index of [day-1,day+2,6])days[index].push(row);
    }
  }
  for(const rows of days)rows.sort((a,b)=>Number(b.highlight)-Number(a.highlight)
    ||b.lack-a.lack||a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name,'zh-CN'));
  return {days,unknown};
}
