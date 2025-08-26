(function () {
  // Defaults & keys
  const DEFAULT_SCRIPT = {
    id: null,
    enable: false,
    name: 'Script',
    type: 'snippet', // 'snippet' | 'external'
    src: '',
    code: '',
    host: ''
  };
  const DEFAULT_OPTIONS = { exclude: '' };
  const STORAGE_KEY = 'SAR';
  const OLD_STORAGE_KEY = 'SRA';

  // Utils
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const debounce = (fn, wait) => {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); };
  };
  const isObject = (v) => v && typeof v === 'object';

  // Promisified chrome.storage.local
  const cstore = {
    async get(key) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.get(key, (res) => resolve(res?.[key]));
        } catch {
          resolve(undefined);
        }
      });
    },
    async set(key, value) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.set({ [key]: value }, () => resolve());
        } catch {
          resolve(); // ignore errors if storage unavailable
        }
      });
    },
    async remove(key) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.remove(key, () => resolve());
        } catch {
          resolve();
        }
      });
    }
  };

  // window.localStorage helpers
  const lstore = {
    get(key) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : undefined;
      } catch { return undefined; }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    },
    remove(key) {
      try { window.localStorage.removeItem(key); } catch {}
    }
  };

  // Merge helper: chrome wins on conflicts; fill missing from local.
  function mergeData(chromeVal, localVal) {
    if (!isObject(chromeVal) && !isObject(localVal)) return undefined;
    const base = isObject(chromeVal) ? chromeVal : localVal || {};
    const other = isObject(chromeVal) ? localVal : {};
    // Shallow merge is enough given shape; fill missing fields
    return {
      power: typeof base.power === 'boolean' ? base.power : (typeof other?.power === 'boolean' ? other.power : true),
      scripts: Array.isArray(base.scripts) ? base.scripts : (Array.isArray(other?.scripts) ? other.scripts : []),
      options: isObject(base.options) ? { ...DEFAULT_OPTIONS, ...base.options }
              : (isObject(other?.options) ? { ...DEFAULT_OPTIONS, ...other.options } : clone(DEFAULT_OPTIONS))
    };
  }

  // State
  const state = { power: true, scripts: [], options: { exclude: '' } };

  // Unified setters: write to BOTH stores
  async function setUnified(key, value) {
    lstore.set(key, value);
    await cstore.set(key, value);
  }
  async function removeUnified(key) {
    lstore.remove(key);
    await cstore.remove(key);
  }

  // Load/migrate reading from BOTH APIs; then sync BOTH
  async function initStorage() {
    // Read possible values
    const [sarChrome, sraChrome] = await Promise.all([cstore.get(STORAGE_KEY), cstore.get(OLD_STORAGE_KEY)]);
    const sarLocal = lstore.get(STORAGE_KEY);
    const sraLocal = lstore.get(OLD_STORAGE_KEY);

    // If SAR exists (in either), merge & sync to both
    let merged = mergeData(sarChrome, sarLocal);
    if (merged) {
      await setUnified(STORAGE_KEY, merged);
      // Cleanup legacy old keys if present
      if (sraChrome) await cstore.remove(OLD_STORAGE_KEY);
      if (sraLocal) lstore.remove(OLD_STORAGE_KEY);
      return merged;
    }

    // Else try legacy SRA (either store), migrate to SAR
    const legacyMerged = mergeData(sraChrome, sraLocal);
    if (legacyMerged) {
      await setUnified(STORAGE_KEY, legacyMerged);
      await removeUnified(OLD_STORAGE_KEY);
      return legacyMerged;
    }

    // Nothing found anywhere: seed defaults to BOTH
    const defaults = { power: true, scripts: [], options: DEFAULT_OPTIONS };
    await setUnified(STORAGE_KEY, defaults);
    return defaults;
  }

  async function loadIntoState() {
    const sarChrome = await cstore.get(STORAGE_KEY);
    const sarLocal = lstore.get(STORAGE_KEY);
    const merged = mergeData(sarChrome, sarLocal) || { power: true, scripts: [], options: clone(DEFAULT_OPTIONS) };
    state.power = merged.power;
    state.scripts = merged.scripts;
    state.options = merged.options;
    // Ensure both are synced after load
    await setUnified(STORAGE_KEY, merged);
  }

  const save = debounce(async () => {
    await setUnified(STORAGE_KEY, state);
  }, 300);

  // Derived
  function getAvailableId() {
    if (state.scripts.length === 0) return 0;
    let m = -1; for (const s of state.scripts) if (typeof s.id === 'number' && s.id > m) m = s.id;
    return m + 1;
  }

  // Elements
  const app = document.getElementById('app');
  const powerBtn = document.getElementById('powerBtn');
  const scriptsList = document.getElementById('scriptsList');
  const tpl = document.getElementById('scriptItemTemplate');

  const settingsToggle = document.getElementById('settingsToggle');
  const settingsClose = document.getElementById('settingsClose');
  const settingsPanel = document.getElementById('settingsPanel');
  const excludeText = document.getElementById('excludeText');

  const addSnippetBtn = document.getElementById('addSnippetBtn');
  const addExternalBtn = document.getElementById('addExternalBtn');

  // Renderers
  function renderPower() {
    powerBtn.classList.toggle('sra-power--off', !state.power);
  }

  function renderOptions() {
    excludeText.value = state.options.exclude || '';
  }

  function renderList() {
    scriptsList.innerHTML = '';
    state.scripts.forEach((script, index) => {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.dataset.index = String(index);

      li.classList.toggle('sra-script--enable', script.enable);

      const nameInput = li.querySelector('.sra-script__name');
      nameInput.value = script.name || '';

      const typeIcon = li.querySelector('.type-icon');
      const snippetBox = li.querySelector('.sra-script__snippet');
      const externalBox = li.querySelector('.sra-script__external');

      typeIcon.className = 'type-icon ' + (script.type === 'external' ? 'icon-link' : 'icon-code');
      snippetBox.style.display  = (script.type === 'snippet') ? '' : 'none';
      externalBox.style.display = (script.type === 'external') ? '' : 'none';

      const codeArea = li.querySelector('.code');
      const srcInput = li.querySelector('.src');
      const hostInput = li.querySelector('.host');
      if (codeArea) codeArea.value = script.code || '';
      if (srcInput)  srcInput.value  = script.src || '';
      hostInput.value = script.host || '';

      scriptsList.appendChild(li);
    });
  }

  function renderAll() {
    renderPower();
    renderOptions();
    renderList();
  }

  // Mutations
  function toggleSwitch() {
    state.power = !state.power;
    renderPower();
    save();
  }

  function addScript(type) {
    const s = clone(DEFAULT_SCRIPT);
    s.id = getAvailableId();
    s.type = type;
    s.name = `${s.name}${s.id}`;
    state.scripts.push(s);
    renderList();
    save();
  }

  function removeScript(index) {
    if (index < 0 || index >= state.scripts.length) return;
    if (window.confirm('Are you sure you want to delete?')) {
      state.scripts.splice(index, 1);
      renderList();
      save();
    }
  }

  function moveUp(index) {
    if (index - 1 < 0) return;
    [state.scripts[index - 1], state.scripts[index]] = [state.scripts[index], state.scripts[index - 1]];
    renderList(); save();
  }

  function moveDown(index) {
    if (index + 1 >= state.scripts.length) return;
    [state.scripts[index + 1], state.scripts[index]] = [state.scripts[index], state.scripts[index + 1]];
    renderList(); save();
  }

  function togglePowerPerScript(index) {
    const s = state.scripts[index]; if (!s) return;
    s.enable = !s.enable;
    const li = scriptsList.querySelector(`li[data-index="${index}"]`);
    if (li) li.classList.toggle('sra-script--enable', s.enable);
    save();
  }

  function toggleSetting() {
    settingsPanel.classList.toggle('show');
  }

  function updateField(index, field, value) {
    const s = state.scripts[index]; if (!s) return;
    s[field] = value;
    if (field === 'type') renderList();
    save();
  }

  // Events
  powerBtn.addEventListener('click', toggleSwitch);
  settingsToggle.addEventListener('click', toggleSetting);
  settingsClose.addEventListener('click', toggleSetting);

  excludeText.addEventListener('keyup', () => { state.options.exclude = excludeText.value; save(); });

  addSnippetBtn.addEventListener('click', () => addScript('snippet'));
  addExternalBtn.addEventListener('click', () => addScript('external'));

  scriptsList.addEventListener('click', (e) => {
    const li = e.target.closest('li.sra-script'); if (!li) return;
    const index = parseInt(li.dataset.index, 10); if (Number.isNaN(index)) return;

    if (e.target.closest('.sra-script__plug'))      togglePowerPerScript(index);
    else if (e.target.closest('.move-up'))          moveUp(index);
    else if (e.target.closest('.move-down'))        moveDown(index);
    else if (e.target.closest('.remove'))           removeScript(index);
  });

  scriptsList.addEventListener('input', (e) => {
    const li = e.target.closest('li.sra-script'); if (!li) return;
    const index = parseInt(li.dataset.index, 10); if (Number.isNaN(index)) return;

    if (e.target.classList.contains('sra-script__name')) updateField(index, 'name', e.target.value);
    else if (e.target.classList.contains('host'))        updateField(index, 'host', e.target.value);
    else if (e.target.classList.contains('code'))        updateField(index, 'code', e.target.value);
    else if (e.target.classList.contains('src'))         updateField(index, 'src', e.target.value);
  });

  scriptsList.addEventListener('blur', (e) => {
    if (e.target.classList.contains('src') || e.target.classList.contains('host')) save();
  }, true);

  // Async init: read both, merge, then render and sync both
  (async () => {
    const merged = await initStorage();
    // Put merged into state (initStorage already wrote to both)
    state.power = merged.power;
    state.scripts = merged.scripts;
    state.options = merged.options;
    // Extra sanity sync after initial render
    await loadIntoState();
    renderAll();
  })();
})();
