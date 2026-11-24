const BASE = 'https://static.nanoka.cc';
const GI_ASSET_BASE = `${BASE}/assets/gi`;

function assetName(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  if (/^https?:\/\//i.test(source)) {
    try {
      const pathname = new URL(source).pathname;
      return (pathname.split('/').pop() || '').replace(/\.(?:webp|png|jpe?g|avif)$/i, '');
    } catch {
      return '';
    }
  }
  return (source.replace(/\\/g, '/').split('/').pop() || '').replace(/\.(?:webp|png|jpe?g|avif)$/i, '');
}

export function iconUrl(icon) {
  if (!icon) return '';
  if (/^https?:\/\//i.test(icon)) return icon;
  const name = assetName(icon);
  return name ? `${GI_ASSET_BASE}/${name}.webp` : '';
}

export function itemIconUrl(id) {
  const value = String(id ?? '').trim();
  return value ? `${GI_ASSET_BASE}/UI_ItemIcon_${value}.webp` : '';
}

export async function requestHakushin(path, options = {}) {
  if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('扩展后台不可用');
  const response = await chrome.runtime.sendMessage({ type: 'hakushin:fetch', path, ...options });
  if (!response?.ok) throw new Error(response?.error || '数据请求失败');
  return response;
}

export function readManifestVersions(manifest) {
  const gi = manifest?.gi || manifest?.data?.gi || {};
  const live = [gi.live_version, gi.liveVersion, gi.live].find((entry) => typeof entry === 'string' && entry.trim()) || '';
  const latest = [gi.latest_version, gi.latestVersion, gi.latest].find((entry) => typeof entry === 'string' && entry.trim()) || '';
  if (!live && !latest) throw new Error('清单中缺少原神版本号');
  return { live, latest: latest || live };
}

function normalizeRarity(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const source = String(value || '').trim();
  if (/^\d+$/.test(source)) return Number(source);
  if (source.includes('ORANGE')) return 5;
  if (source.includes('PURPLE')) return 4;
  if (source.includes('BLUE')) return 3;
  if (source.includes('GREEN')) return 2;
  if (source.includes('WHITE')) return 1;
  const match = source.match(/([1-5])$/);
  return match ? Number(match[1]) : 0;
}

function normalizeListEntry(id, row, kind) {
  const rawType = row?.type || row?.weapon || row?.route || row?.weapon_type || row?.weapontype || row?.subtype || '';
  return {
    id: String(id),
    name: String(row?.zh || row?.name || row?.names?.zh || id),
    en: String(row?.en || row?.names?.en || ''),
    goodKey: String(row?.en || row?.names?.en || ''),
    icon: iconUrl(row?.icon),
    rarity: normalizeRarity(row?.rank ?? row?.rarity ?? 0),
    element: kind === 'character' ? String(row?.element || '') : '',
    weaponType: String(rawType || ''),
    sourceTag: '',
    version: ''
  };
}


export function newestFirst(a,b){
  if(Boolean(a.sourceTag)!==Boolean(b.sourceTag))return a.sourceTag?-1:1;
  const va=String(a.version||'').split('.').map(Number),vb=String(b.version||'').split('.').map(Number);
  if(a.version&&b.version){
    for(let i=0;i<Math.max(va.length,vb.length);i++){
      const d=(vb[i]||0)-(va[i]||0);if(d)return d;
    }
  }
  const ai=Number(a.id),bi=Number(b.id);
  if(Number.isSafeInteger(ai)&&Number.isSafeInteger(bi)&&ai!==bi)return bi-ai;
  return a.name.localeCompare(b.name,'zh-CN');
}
export function normalizeCharacterList(raw) {
  const source = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  if (!source || typeof source !== 'object') return [];
  return Object.entries(source)
    .map(([id, value]) => normalizeListEntry(id, value || {}, 'character'))
    .filter((row) => row.name)
    .sort(newestFirst);
}

export function normalizeWeaponList(raw) {
  const source = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  if (!source || typeof source !== 'object') return [];
  return Object.entries(source)
    .map(([id, value]) => normalizeListEntry(id, value || {}, 'weapon'))
    .filter((row) => row.name)
    .sort(newestFirst);
}

export function mergeSourceLists(liveList, latestList, _tagForLive = '', tagForLatest = '前瞻') {
  const map = new Map();
  const liveIds = new Set(liveList.map((row) => row.id));
  for (const row of liveList) {
    map.set(row.id, { ...row, sourceTag: '' });
  }
  for (const row of latestList) {
    const isPreviewOnly = !liveIds.has(row.id);
    map.set(row.id, { ...row, sourceTag: isPreviewOnly ? tagForLatest : '' });
  }
  return [...map.values()].sort(newestFirst);
}

function aggregateMaterialInfos(infos) {
  const map = new Map();
  for (const info of Array.isArray(infos) ? infos : []) {
    const mats = info?.mats || info?.materials || [];
    for (const mat of mats) {
      const id = String(mat?.id ?? '');
      if (!id) continue;
      const current = map.get(id) || {
        id,
        name: String(mat?.name || id),
        rank: Number(mat?.rank ?? mat?.rarity ?? 0),
        total: 0,
        icon: itemIconUrl(id)
      };
      current.total += Number(mat?.count || 0);
      map.set(id, current);
    }
  }
  return [...map.values()];
}

function tierSeries(items, totals, minRank = 0) {
  const candidates = items
    .filter((item) => totals.includes(item.total) && item.rank >= minRank)
    .sort((a, b) => a.rank - b.rank || a.total - b.total);
  return totals.map((_, index) => candidates[index] || null);
}

function nonNull(items) {
  return items.filter(Boolean);
}

export function parseCharacterDetail(raw, fallback = {}) {
  const data = raw?.data && raw.data.name ? raw.data : raw;
  if (!data || typeof data !== 'object') throw new Error('角色详情格式无法识别');
  const materials = data.materials || data.upgrade_materials || {};
  const asc = aggregateMaterialInfos(materials.ascensions || []);
  const talentTracks = materials.talents || [];
  const talent = aggregateMaterialInfos(Array.isArray(talentTracks[0]) ? talentTracks[0] : talentTracks);

  const gems = tierSeries(asc, [1, 9, 9, 6], 2);
  const cult = tierSeries(asc, [18, 30, 36], 0);
  const specialty = asc.find((item) => item.total === 168) || null;
  const boss = asc.find((item) => item.total === 46) || null;
  const books = tierSeries(talent, [3, 21, 38], 2);
  const talentCult = tierSeries(talent, [6, 22, 31], 0);
  const weekly = talent.find((item) => item.total === 6 && item.rank >= 4 && !books.some((b) => b?.id === item.id)) || null;
  const crown = talent.find((item) => item.total === 1) || null;

  const finalCult = cult.some(Boolean) ? cult : talentCult;
  const warnings = [];
  if (nonNull(gems).length < 4) warnings.push('突破石识别不完整');
  if (nonNull(finalCult).length < 3) warnings.push('普通材料识别不完整');
  if (nonNull(books).length < 3) warnings.push('天赋书识别不完整');

  return {
    kind: 'character',
    id: String(fallback.id || ''),
    name: String(data.name || fallback.name || '未知角色'),
    icon: iconUrl(data.icon || fallback.icon),
    rarity: normalizeRarity(data.rarity ?? data.rank ?? fallback.rarity ?? 0),
    element: String(data.element || fallback.element || ''),
    sourceTag: String(fallback.sourceTag || ''),
    version: String(fallback.version || ''),
    materials: {
      spec: specialty,
      boss,
      weekly,
      crown,
      books,
      cult: finalCult,
      charGems: gems
    },
    warnings
  };
}

// A weapon can contain two different drop families with identical per-tier totals.
// Resolve each full family by consecutive item IDs and ascending rarity, then check totals.
function matchWeaponMaterialSeries(items, totals) {
  const byId = new Map(items
    .filter((item) => Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0)
    .map((item) => [Number(item.id), item]));
  const candidates = [];
  for (const [start] of byId) {
    const series = totals.map((_, offset) => byId.get(start + offset));
    if (series.some((item) => !item)) continue;
    if (!series.every((item, index) => item.total === totals[index])) continue;
    if (!series.every((item, index) => index === 0 ||
      item.rank === 0 || series[index - 1].rank === 0 ||
      item.rank === series[index - 1].rank + 1)) continue;
    candidates.push(series);
  }
  // Ambiguous or incomplete data must not assign an unrelated material family.
  return candidates.length === 1 ? candidates[0] : totals.map(() => null);
}

export function parseWeaponDetail(raw, fallback = {}) {
  const data = raw?.data && raw.data.name ? raw.data : raw;
  if (!data || typeof data !== 'object') throw new Error('武器详情格式无法识别');
  const materials = data.materials || data.upgrade_materials || {};
  const materialStages = Array.isArray(materials)
    ? materials
    : Array.isArray(materials.ascensions)
      ? materials.ascensions
      : Object.values(materials).flatMap((value) => Array.isArray(value) ? value : [value]);
  const asc = aggregateMaterialInfos(materialStages);

  const rarity=normalizeRarity(data.rarity ?? data.rank ?? fallback.rarity ?? 0);
  const specs={5:[[5,14,14,6],[23,27,41],[15,23,27]],
    4:[[3,9,9,4],[15,18,27],[10,15,18]],
    3:[[2,6,6,3],[10,12,18],[6,10,12]],
    2:[[1,4,1],[6,8],[5,7]],1:[[1,3,1],[5,6],[3,5]]};
  const totals=specs[rarity]||[[],[],[]];
  const weapGems=totals[0].length?matchWeaponMaterialSeries(asc,totals[0]):[];
  const matA=totals[1].length?matchWeaponMaterialSeries(asc,totals[1]):[];
  const matB=totals[2].length?matchWeaponMaterialSeries(asc,totals[2]):[];
  const warnings = [];
  if (nonNull(weapGems).length < (rarity<=2?3:4)) warnings.push('武器突破材料识别不完整');
  if (nonNull(matA).length < (rarity<=2?2:3)) warnings.push('武器素材 A 识别不完整');
  if (nonNull(matB).length < (rarity<=2?2:3)) warnings.push('武器素材 B 识别不完整');

  return {
    kind: 'weapon',
    id: String(fallback.id || ''),
    name: String(data.name || fallback.name || '未知武器'),
    icon: iconUrl(data.icon || fallback.icon),
    rarity: normalizeRarity(data.rarity ?? data.rank ?? fallback.rarity ?? 0),
    weaponType: String(data.weapon_type || data.type || data.weapon || fallback.weaponType || ''),
    sourceTag: String(fallback.sourceTag || ''),
    version: String(fallback.version || ''),
    materials: {
      weapGems,
      matA,
      matB
    },
    warnings
  };
}

function sameId(a, b) {
  return Boolean(a?.id) && Boolean(b?.id) && String(a.id) === String(b.id);
}

export function detectMergeRules(characterProfile, weaponProfile) {
  const rules = {
    matAIntoCult: false,
    matBIntoCult: false
  };
  const cult = characterProfile?.materials?.cult || [];
  const matA = weaponProfile?.materials?.matA || [];
  const matB = weaponProfile?.materials?.matB || [];

  if (cult.length >= 3 && matA.length >= 2) {
    const hits = [sameId(cult[1], matA[0]), sameId(cult[2], matA[1])].filter(Boolean).length;
    rules.matAIntoCult = hits >= 1;
  }
  if (cult.length >= 3 && matB.length >= 3) {
    const hits = [sameId(cult[0], matB[0]), sameId(cult[1], matB[1]), sameId(cult[2], matB[2])].filter(Boolean).length;
    rules.matBIntoCult = hits >= 2 || (hits >= 1 && sameId(cult[0], matB[0]));
  }

  return rules;
}
