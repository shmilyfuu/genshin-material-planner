export function createRosterFilter(tab='character'){
  return {tab,search:'',element:[],weapon:[],star:[]};
}

export function toggleRosterFilter(filter,key,value){
  if(!['element','weapon','star'].includes(key))throw Error('筛选类别无效');
  const selected=filter[key];
  const exists=selected.includes(value);
  filter[key]=exists?selected.filter(item=>item!==value):[...selected,value];
  return filter[key];
}

export function matchesRosterFilter(row,filter,weaponAliases={}){
  const weapon=weaponAliases[row.weaponType]||row.weaponType;
  return (!filter.search||row.name.toLowerCase().includes(filter.search.toLowerCase()))
    &&(!filter.star.length||filter.star.includes(Number(row.rarity)))
    &&(!filter.weapon.length||filter.weapon.includes(weapon))
    &&(filter.tab==='weapon'||!filter.element.length||filter.element.includes(row.element));
}
