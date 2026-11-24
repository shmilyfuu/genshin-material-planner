// Release dates are calendar days in UTC. Banner start days are fallback evidence.
export function validReleaseDate(value){
  const date=String(value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return '';
  const ms=Date.parse(date+'T00:00:00Z');
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===date?date:'';
}
export function releaseName(value){
  return String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
}
export function indexBannerReleases(events){
  const index={character:{},weapon:{}};
  for(const event of Array.isArray(events)?events:[]){
    const type=Number(event.Type),kind=type===302?'weapon':(type===301||type===400?'character':'');
    if(!kind)continue;
    const ms=Date.parse(event.From);
    if(!Number.isFinite(ms))continue;
    const date=new Date(ms).toISOString().slice(0,10);
    for(const id of [...(event.UpOrangeList||[]),...(event.UpPurpleList||[])]){
      if(!/^\d+$/.test(String(id)))continue;
      if(!index[kind][id]||date<index[kind][id])index[kind][id]=date;
    }
  }
  return index;
}
export function mergeBannerReleases(...sources){
  const index={character:{},weapon:{}};
  for(const source of sources){
    for(const kind of ['character','weapon']){
      for(const [id,value] of Object.entries(source?.[kind]||{})){
        const date=validReleaseDate(value);
        if(date&&/^\d+$/.test(id)&&(!index[kind][id]||date<index[kind][id]))index[kind][id]=date;
      }
    }
  }
  return index;
}
export function indexReleaseRows(rows){
  const index={};
  for(const row of rows){
    const name=releaseName(row.name),date=validReleaseDate(row.date);
    if(name&&date&&(!index[name]||date<index[name]))index[name]=date;
  }
  return index;
}
export function parseReleaseTable(html){
  const doc=new DOMParser().parseFromString(String(html||''),'text/html');
  const rows=[];
  for(const table of doc.querySelectorAll('table')){
    const headers=[...table.querySelectorAll('thead th')];
    const columns=(headers.length?headers:[...table.querySelectorAll('tr:first-child th')]).map(el=>el.textContent.trim().toLowerCase());
    const name=columns.indexOf('name'),date=columns.indexOf('release date');
    if(name<0||date<0)continue;
    for(const tr of table.querySelectorAll('tr')){
      const cells=[...tr.querySelectorAll('td')];
      if(cells.length>Math.max(name,date))rows.push({name:cells[name].textContent.trim(),date:cells[date].textContent.trim()});
    }
  }
  return indexReleaseRows(rows);
}
export function attachReleaseDates(rows,kind,datesByName,bannerIndex){
  return rows.map(row=>{
    const date=validReleaseDate(datesByName?.[releaseName(row.en)]);
    const banner=validReleaseDate(bannerIndex?.[kind]?.[row.id]);
    // A later first featured banner cannot override an earlier release.
    const releaseDate=date&&banner?(date<banner?date:banner):date||banner;
    return {...row,releaseDate};
  });
}
export function compareRosterRelease(a,b){
  if(Boolean(a.sourceTag)!==Boolean(b.sourceTag))return a.sourceTag?-1:1;
  const ad=validReleaseDate(a.releaseDate),bd=validReleaseDate(b.releaseDate);
  return bd.localeCompare(ad)||Number(b.rarity||0)-Number(a.rarity||0)
    ||Number(b.id)-Number(a.id)||String(a.name||'').localeCompare(String(b.name||''),'zh-CN');
}
