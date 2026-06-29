const BASE_URL = 'https://static.nanoka.cc';
const LUNARIS_BASE_URL = 'https://api.lunaris.moe/data/assets/items';
const NANOKA_TEST_URL = `${BASE_URL}/assets/gi/UI_ItemIcon_202.webp`;
const LUNARIS_TEST_URL = `${LUNARIS_BASE_URL}/UI_ItemIcon_114084.webp`;
const CACHE_PREFIX = 'hakushinCache:';
const IMAGE_MEMORY_CACHE = new Map();

async function enableActionClickToOpenPanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error('无法设置侧栏点击行为：', error);
  }
}

enableActionClickToOpenPanel();
chrome.runtime.onInstalled.addListener(enableActionClickToOpenPanel);
chrome.runtime.onStartup.addListener(enableActionClickToOpenPanel);

function cacheKey(path) {
  return `${CACHE_PREFIX}${path}`;
}

async function readCache(path) {
  const key = cacheKey(path);
  const data = await chrome.storage.local.get(key);
  return data[key] || null;
}

async function writeCache(path, value) {
  const key = cacheKey(path);
  await chrome.storage.local.set({
    [key]: {
      savedAt: Date.now(),
      value
    }
  });
}

async function fetchJson(path, { force = false, maxAge = 24 * 60 * 60 * 1000 } = {}) {
  const cached = await readCache(path);
  if (!force && cached && Date.now() - cached.savedAt < maxAge) {
    return { ok: true, data: cached.value, source: 'cache', savedAt: cached.savedAt };
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      cache: force ? 'reload' : 'default',
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await writeCache(path, data);
    return { ok: true, data, source: 'network', savedAt: Date.now() };
  } catch (error) {
    if (cached) {
      return {
        ok: true,
        data: cached.value,
        source: 'stale-cache',
        savedAt: cached.savedAt,
        warning: String(error?.message || error)
      };
    }
    return { ok: false, error: String(error?.message || error) };
  }
}

function imageAssetName(url) {
  try {
    const parsed = new URL(url);
    const file = parsed.pathname.split('/').pop() || '';
    const asset = file.replace(/\.(webp|png|jpg|jpeg|avif)$/i, '');
    return /^[A-Za-z0-9_-]+$/.test(asset) ? asset : '';
  } catch {
    return '';
  }
}

function mimeFromCandidate(candidate, contentType) {
  if (String(contentType || '').startsWith('image/')) return String(contentType).split(';')[0];
  const clean = String(candidate || '').split('?')[0].toLowerCase();
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.avif')) return 'image/avif';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function responseToDataUrl(response, candidate) {
  const contentType = response.headers.get('content-type') || '';
  if (/text\/html|application\/(json|xml)/i.test(contentType)) throw new Error('响应并非图片');
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) throw new Error('图片内容为空');
  if (buffer.byteLength > 2 * 1024 * 1024) throw new Error('图片文件过大');
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mimeFromCandidate(candidate, contentType)};base64,${btoa(binary)}`;
}

async function fetchSingleImage(candidate, cache = 'force-cache') {
  const response = await fetch(candidate, {
    cache,
    credentials: 'omit',
    headers: { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' },
    referrerPolicy: 'no-referrer'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { dataUrl: await responseToDataUrl(response, candidate), response };
}

function nanokaCandidates(url) {
  const asset = imageAssetName(url);
  if (!asset) return [];
  return [...new Set([
    String(url || '').startsWith('https://static.nanoka.cc/') ? url : '',
    `${BASE_URL}/assets/gi/${asset}.webp`,
    `${BASE_URL}/assets/gi/${asset}.png`
  ].filter(Boolean))];
}

function lunarisCandidates(url) {
  const asset = imageAssetName(url);
  if (!asset || !asset.startsWith('UI_ItemIcon_')) return [];
  return [`${LUNARIS_BASE_URL}/${asset}.webp`];
}

async function fetchImageDataUrl(url) {
  const cacheIdentity = imageAssetName(url) || String(url || '');
  if (!cacheIdentity) return { ok: false, error: '缺少图片识别信息' };
  if (IMAGE_MEMORY_CACHE.has(cacheIdentity)) {
    const cached = IMAGE_MEMORY_CACHE.get(cacheIdentity);
    return { ok: true, ...cached, source: 'memory-cache' };
  }

  const errors = [];
  for (const candidate of nanokaCandidates(url)) {
    try {
      const { dataUrl } = await fetchSingleImage(candidate);
      const result = { dataUrl, resolvedUrl: candidate, originalSource: 'nanoka' };
      IMAGE_MEMORY_CACHE.set(cacheIdentity, result);
      return { ok: true, ...result, source: 'nanoka' };
    } catch (error) {
      errors.push(`Nanoka ${candidate}: ${String(error?.message || error)}`);
    }
  }

  for (const candidate of lunarisCandidates(url)) {
    try {
      const { dataUrl } = await fetchSingleImage(candidate);
      const result = { dataUrl, resolvedUrl: candidate, originalSource: 'lunaris' };
      IMAGE_MEMORY_CACHE.set(cacheIdentity, result);
      return { ok: true, ...result, source: 'lunaris' };
    } catch (error) {
      errors.push(`Lunaris ${candidate}: ${String(error?.message || error)}`);
    }
  }

  return { ok: false, error: errors.join(' | ') || '图片加载失败' };
}

async function testImageSourceBackground(name, url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'image/webp,image/*,*/*;q=0.8' },
      referrerPolicy: 'no-referrer'
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!contentType.startsWith('image/')) throw new Error(`响应类型为 ${contentType || '未知'}`);
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) throw new Error('图片内容为空');
    return {
      ok: true,
      name,
      url,
      status: response.status,
      contentType: contentType.split(';')[0],
      bytes: buffer.byteLength,
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      name,
      url,
      elapsedMs: Date.now() - startedAt,
      error: String(error?.message || error)
    };
  }
}

async function testAllImageSources() {
  const [nanoka, lunaris] = await Promise.all([
    testImageSourceBackground('Nanoka', NANOKA_TEST_URL),
    testImageSourceBackground('Lunaris', LUNARIS_TEST_URL)
  ]);
  return { ok: nanoka.ok && lunaris.ok, sources: { nanoka, lunaris } };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.type === 'hakushin:image') {
    fetchImageDataUrl(message.url || '').then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === 'image-source:test-all') {
    testAllImageSources().then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === 'image-source:test-lunaris') {
    testImageSourceBackground('Lunaris', LUNARIS_TEST_URL).then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type !== 'hakushin:fetch') return false;
  const path = typeof message.path === 'string' && message.path.startsWith('/') ? message.path : null;
  if (!path || path.includes('..')) {
    sendResponse({ ok: false, error: '非法请求路径' });
    return false;
  }
  fetchJson(path, {
    force: Boolean(message.force),
    maxAge: Number.isFinite(message.maxAge) ? message.maxAge : undefined
  }).then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});
