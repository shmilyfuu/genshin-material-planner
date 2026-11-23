// 原神精通/炼武秘境开放日。各数组依次对应周一/四、周二/五、周三/六；周日全部开放。
// 数据：原神 BWIKI「消耗计算器」秘境周期表，2026-11-24 核对。
// https://wiki.biligame.com/ys/消耗计算器
export const DOMAIN_SERIES={
  talent:[
    ['自由','繁荣','浮世','诤言','公平','角逐','月光','慈爱'],
    ['抗争','勤劳','风雅','巧思','正义','焚燔','乐园','坚忍'],
    ['诗文','黄金','天光','笃行','秩序','纷争','浪迹','荣光']
  ],
  weapon:[
    ['高塔孤王','孤云寒林','远海夷地','谧林涓露','悠古弦音','贡祭炽心','奇巧秘器','苍星军势'],
    ['凛风奔狼','雾海云间','鸣神御灵','绿洲花园','纯圣露滴','谵妄圣主','长夜燧火','藏窖灵浆'],
    ['狮牙斗士','漆黑陨铁','今昔剧画','烈日威权','无垢之海','神合秘烟','终北遗嗣','凛雪帝皇']
  ]
};
const SERIES_ALIASES={
  weapon:{'高塔之王':'高塔孤王','神秘烟霭':'神合秘烟'}
};

export function weeklyMaterialDay(name,kind){
  const seriesByDay=DOMAIN_SERIES[kind];
  if(!seriesByDay)return null;
  const text=String(name||'').normalize('NFKC');
  if(!text)return null;
  for(const [index,series] of seriesByDay.entries()){
    for(const key of series){
      if(text.includes(key))return index+1;
    }
  }
  for(const [alias,canonical] of Object.entries(SERIES_ALIASES[kind]||{})){
    if(text.includes(alias))return weeklyMaterialDay(canonical,kind);
  }
  return null;
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
