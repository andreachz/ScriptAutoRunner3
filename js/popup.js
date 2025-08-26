(() => {
  const storageKey = 'SAR';
  const DEFAULT_OPTIONS = { exclude: '' };

  // Elements
  const appEl = document.getElementById('app');
  const powerBtn = document.getElementById('powerToggle');
  const optionBtn = document.getElementById('openOption');
  const listEl = document.getElementById('scriptsList');
  const noScriptsMsg = document.getElementById('noScriptsMsg');
  const excludedMsg = document.getElementById('excludedMsg');

  // State
  let state = {
    power: true,
    scripts: [],
    options: { exclude: '' }
  };

  // Runtime data
  let hostname = '';

  // --- Storage helpers ---
  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        state = { power: true, scripts: [], options: { ...DEFAULT_OPTIONS } };
        return;
      }
      const data = JSON.parse(raw);
      state.power = typeof data.power === 'boolean' ? data.power : true;
      state.scripts = Array.isArray(data.scripts) ? data.scripts : [];
      state.options = data.options ? { ...DEFAULT_OPTIONS, ...data.options } : { ...DEFAULT_OPTIONS };
    } catch (e) {
      // Fallback to defaults on parse error
      state = { power: true, scripts: [], options: { ...DEFAULT_OPTIONS } };
    }
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  // --- Host matching helpers (ported from Vue methods) ---
  function isExcludeHost() {
    const host = (state.options.exclude || '').trim();
    if (host === '') return false;
    if (host.includes(',')) {
      return host.split(',').some(h => hostname.indexOf(h.trim()) !== -1);
    }
    return hostname.indexOf(host) !== -1;
  }

  function isMatch(host) {
    if (isExcludeHost()) return false;
    if (host === '' || host === 'any') return true;
    if (host.includes(',')) {
      return host.split(',').some(h => hostname.indexOf(h.trim()) !== -1);
    }
    return hostname.indexOf(host) !== -1;
  }

  function matchedScripts() {
    return state.scripts.filter(s => isMatch(s.host));
  }

  // --- Rendering ---
  function renderPower() {
    // Toggle a CSS class like Vue used to do: {'sra-power--off': !power}
    if (state.power) {
      appEl.classList.remove('sra-power--off');
    } else {
      appEl.classList.add('sra-power--off');
    }
  }

  function renderList() {
    // Clear previous items (but keep the two message <li>s)
    [...listEl.querySelectorAll('li.sra-script')].forEach(el => el.remove());

    if (isExcludeHost()) {
      excludedMsg.classList.remove('hidden');
      noScriptsMsg.classList.add('hidden');
      return;
    } else {
      excludedMsg.classList.add('hidden');
    }

    const visible = matchedScripts();

    if (visible.length === 0) {
      noScriptsMsg.classList.remove('hidden');
      return;
    } else {
      noScriptsMsg.classList.add('hidden');
    }

    const frag = document.createDocumentFragment();

    visible.forEach((script, idxVisible) => {
      // We also need the index in the full state.scripts array to toggle enable reliably
      const indexInState = state.scripts.indexOf(script);

      const li = document.createElement('li');
      li.className = 'sra-script' + (script.enable ? ' sra-script--enable' : '');
      li.dataset.index = String(indexInState);

      const main = document.createElement('div');
      main.className = 'sra-script__main';

      const iconSpan = document.createElement('span');
      const icon = document.createElement('i');
      icon.className = (script.type === 'external') ? 'icon-link' : 'icon-code';
      iconSpan.appendChild(icon);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = script.name;

      const toggleSpan = document.createElement('span');
      const plug = document.createElement('i');
      plug.className = 'icon-plug';
      plug.title = 'Enable/disable';
      toggleSpan.appendChild(plug);

      main.appendChild(iconSpan);
      main.appendChild(nameSpan);
      main.appendChild(toggleSpan);
      li.appendChild(main);

      frag.appendChild(li);
    });

    listEl.appendChild(frag);
  }

  function renderAll() {
    renderPower();
    renderList();
  }

  // --- Event handlers ---
  powerBtn.addEventListener('click', () => {
    state.power = !state.power;
    save();
    renderPower();
  });

  optionBtn.addEventListener('click', () => {
    const url = chrome.runtime.getURL('options.html');
    chrome.tabs.create({ url });
  });

  // Event delegation for toggling individual scripts
  listEl.addEventListener('click', (e) => {
    const target = e.target;
    // Only react when clicking the plug icon or its parent span
    const li = target.closest('li.sra-script');
    if (!li) return;

    const index = parseInt(li.dataset.index, 10);
    if (Number.isNaN(index)) return;

    // If the user clicked anywhere inside the rightmost span (or directly on the plug icon),
    // toggle the script. This mirrors the original click zone.
    const clickedPlugArea = target.classList.contains('icon-plug') ||
                            (target.tagName === 'SPAN' && target.contains(li.querySelector('.icon-plug')));
    if (!clickedPlugArea) return;

    const script = state.scripts[index];
    if (!script) return;
    script.enable = !script.enable;
    save();
    // Update just this item’s class
    li.classList.toggle('sra-script--enable', script.enable);
  });

  // --- Bootstrap: get current tab hostname and init ---
  function initWithURL(tabUrl) {
    try {
      const urlObj = new URL(tabUrl);
      hostname = urlObj.hostname || '';
    } catch {
      hostname = '';
    }
    load();
    renderAll();
  }

  // chrome.tabs.getSelected is deprecated; use query
  if (chrome && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      initWithURL(tab ? tab.url : '');
    });
  } else {
    // Fallback (e.g., running outside Chrome env for testing)
    initWithURL(window.location.href);
  }
})();
