const talentPatterns = [
 [/自由|自由的/,1],[/抗争/,2],[/诗文/,3],
 [/繁荣/,1],[/勤劳/,2],[/黄金/,3],
 [/浮世/,1],[/风雅/,2],[/天光/,3],
 [/诤言/,1],[/巧思/,2],[/笃行/,3],
 [/公平/,1],[/正义/,2],[/秩序/,3],
 [/角逐/,1],[/焚燔/,2],[/纷争/,3]
];
const weaponPatterns = [
 [/高塔孤王|高塔之王/,1],[/凛风奔狼/,2],[/狮牙斗士/,3],
 [/孤云寒林/,1],[/雾海云间/,2],[/漆黑陨铁/,3],
 [/远海夷地/,1],[/鸣神御灵/,2],[/今昔剧画/,3],
 [/谧林涓露/,1],[/绿洲花园/,2],[/烈日威权/,3],
 [/悠古弦音/,1],[/纯圣露滴/,2],[/无垢之海/,3],
 [/谵妄圣主/,1],[/神秘烟霭/,2],[/贡祭炽心/,3]
];
export function weeklyMaterialDay(name,kind){
  const patterns=kind==='weapon'?weaponPatterns:talentPatterns;
  const row=patterns.find(([pattern])=>pattern.test(String(name||'')));
  return row?row[1]:null;
}
export function calendarForEntries(entries, deficits){
  const days=[[],[],[],[],[],[],[]];const unknown=[];
  const shortages=new Map(deficits.groups.flatMap(g=>g.rows).filter(r=>r.lack>0).map(r=>[String(r.id),r]));
  const seen=new Set();
  for(const entry of entries){
    for(const [kind,list] of [['talent',entry.characterProfile?.materials?.books],['weapon',entry.weaponProfile?.materials?.weapGems]]){
      for(const item of list||[]){
        if(!item||!shortages.has(String(item.id))||seen.has(String(item.id)))continue;
        seen.add(String(item.id));
        const day=weeklyMaterialDay(item.name,kind);
        const row={id:String(item.id),name:item.name,kind,lack:shortages.get(String(item.id)).lack};
        if(!day){unknown.push(row);continue;}
        days[day-1].push(row);days[day+2].push(row);days[6].push(row);
      }
    }
  }
  return {days,unknown};
}
