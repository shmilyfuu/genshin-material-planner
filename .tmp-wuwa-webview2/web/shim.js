(() => {
  const root = window.chrome || {};
  const webview = root.webview;

  root.runtime = root.runtime || {};
  root.runtime.getURL = (path = '') => new URL(path, window.location.href).href;

  root.storage = root.storage || {};
  root.storage.local = {
    async get(keys) {
      const readOne = key => {
        const raw = localStorage.getItem(`wuwa:${key}`);
        if (raw === null) return undefined;
        try { return JSON.parse(raw); } catch { return raw; }
      };

      if (typeof keys === 'string') return { [keys]: readOne(keys) };
      if (Array.isArray(keys)) return Object.fromEntries(keys.map(key => [key, readOne(key)]));
      if (keys && typeof keys === 'object') {
        const result = {};
        for (const [key, fallback] of Object.entries(keys)) {
          const value = readOne(key);
          result[key] = value === undefined ? fallback : value;
        }
        return result;
      }
      const result = {};
      for (let index = 0; index < localStorage.length; index += 1) {
        const storageKey = localStorage.key(index);
        if (!storageKey?.startsWith('wuwa:')) continue;
        const key = storageKey.slice(5);
        result[key] = readOne(key);
      }
      return result;
    },

    async set(values) {
      for (const [key, value] of Object.entries(values || {})) {
        localStorage.setItem(`wuwa:${key}`, JSON.stringify(value));
      }
    },

    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) localStorage.removeItem(`wuwa:${key}`);
    },

    async clear() {
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith('wuwa:')) keys.push(key);
      }
      keys.forEach(key => localStorage.removeItem(key));
    }
  };

  if (webview) root.webview = webview;
  window.chrome = root;

  document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.app-header');
    if (!header) return;

    const badge = header.querySelector('.mode-badge');
    const tools = document.createElement('div');
    tools.className = 'desktop-tools';

    const topmost = document.createElement('label');
    topmost.className = 'desktop-topmost';
    topmost.title = '让窗口显示在其他窗口上方';

    const label = document.createElement('span');
    label.textContent = '置顶';
    const input = document.createElement('input');
    input.type = 'checkbox';
    const switcher = document.createElement('span');
    switcher.className = 'desktop-switch';
    input.addEventListener('change', () => {
      window.chrome?.webview?.postMessage(`topmost:${input.checked ? '1' : '0'}`);
    });
    topmost.append(label, input, switcher);

    const version = document.createElement('span');
    version.className = 'desktop-version';
    version.textContent = 'v1.0.0';

    tools.append(topmost, version);
    if (badge) tools.prepend(badge);
    header.append(tools);
  });
})();
