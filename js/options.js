const _POPUP_STORAGE_CHANGE_KEY = 'POPUP_STORAGE_CHANGE_KEY'
const SAR_PREFIX = '__SAR_DATA::';
const SAR_EDITOR = '_SAR_EDITOR'

// script boxes move and dragging
let moveFromIndex = -1;
let moveToIndex = -1;
let dispositionState;
const DRAG_MOVE_V2 = true
let mouseDragStartingState = {x: 0, y:0}
let tout0
let tout1
let isPageScrolling
//

// max/min boxes
let initialYScrollState

document.getElementById("info-btn").addEventListener("click", function () {
  alert("ScriptAutoRunner3 \n\nThis fork (26 Aug, 2025):\nhttps://github.com/andreachz/ScriptAutoRunner3\n\nOriginal fork (Sep 16, 2015 - Jan 11, 2025):\nhttps://github.com/nakajmg/ScriptAutoRunner");
});


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

  function renderScriptsCounterIndicator(){
    let totalScripts = state.scripts.length?state.scripts.length+' script'+((state.scripts.length!=1)?'s':''):'No scripts yet'
    let activeScripts = state.scripts.length?`, <span style="opacity: ${state.power?'initial':'0.4'} ">`+state.scripts.filter(x=>x.enable).length+' enabled</span>':''
    document.querySelector('.sra-noscripts').children[0].innerHTML=totalScripts+activeScripts
  }




  function renderList_legacy() {
    
    scriptsList.innerHTML = '';
    state.scripts.forEach((script, index) => {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.dataset.index = String(index);

      li.classList.toggle('sra-script--enable', script.enable);

      const nameInput = li.querySelector('.sra-script__name');
      nameInput.value = script.name || '';
      nameInput.title = `#${index} (${script.type}) "${script.name}"`

      if(index == 0){
        li.querySelector('.move-up').classList.add('disabled-item')
      }
      if(index == state.scripts.length-1){
        li.querySelector('.move-down').classList.add('disabled-item')
      }

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

      // if(moveFromIndex!=-1 && moveFromIndex==index){
      //   li.style.transform='scale(105%)'
      //   li.style.zIndex='100'
      //   li.style.opacity='0.6'
      // }

      scriptsList.appendChild(li);
    });

    renderScriptsCounterIndicator()
    
    renderEditor()
    setMove(null)

    setBtnsTooltips()


  }


  // --- 1) Single-item factory used by BOTH renderList and addScript__no_rerender
function createScriptListItem(script, index) {
  const li = tpl.content.firstElementChild.cloneNode(true);
  li.dataset.index = String(index);

  li.classList.toggle('sra-script--enable', !!script.enable);

  const nameInput = li.querySelector('.sra-script__name');
  if (nameInput) {
    nameInput.value = script.name || '';
    nameInput.title = `#${index} (${script.type}) "${script.name}"`;
  }

  const typeIcon   = li.querySelector('.type-icon');
  const snippetBox = li.querySelector('.sra-script__snippet');
  const externalBox= li.querySelector('.sra-script__external');

  if (typeIcon) {
    typeIcon.className = 'type-icon ' + (script.type === 'external' ? 'icon-link' : 'icon-code');
  }
  if (snippetBox)  snippetBox.style.display  = (script.type === 'snippet') ? '' : 'none';
  if (externalBox) externalBox.style.display = (script.type === 'external') ? '' : 'none';

  if(script.type == 'external'){
    li.querySelector('.max-min-btn').classList.add('disabled-item')
  }

  const codeArea = li.querySelector('.code');
  const srcInput = li.querySelector('.src');
  const hostInput= li.querySelector('.host');
  if (codeArea)  codeArea.value  = script.code || '';
  if (srcInput)  srcInput.value  = script.src  || '';
  if (hostInput) hostInput.value = script.host || '';

  // per-index UI state (first/last)
  const upBtn = li.querySelector('.move-up');
  const dnBtn = li.querySelector('.move-down');
  if (upBtn) upBtn.classList.toggle('disabled-item', index === 0);
  if (dnBtn) dnBtn.classList.toggle('disabled-item', index === state.scripts.length - 1);

  return li;
}

// --- 2) Small helper to reindex DOM after an insertion
function reindexListItems() {
  const items = scriptsList.querySelectorAll('li');
  items.forEach((el, i) => {
    el.dataset.index = String(i);

    const upBtn = el.querySelector('.move-up');
    const dnBtn = el.querySelector('.move-down');
    if (upBtn) upBtn.classList.toggle('disabled-item', i === 0);
    if (dnBtn) dnBtn.classList.toggle('disabled-item', i === items.length - 1);

    const nameEl = el.querySelector('.sra-script__name');
    const si = state.scripts[i];
    if (nameEl && si) {
      nameEl.title = `#${i} (${si.type}) "${si.name}"`;
    }
  });
}

// --- 3) Use the factory in renderList (unchanged behavior)
function renderList() {
  scriptsList.innerHTML = '';
  state.scripts.forEach((script, index) => {
    const li = createScriptListItem(script, index);
    scriptsList.appendChild(li);
  });

  renderScriptsCounterIndicator();
  renderEditor();      // global mode
  setMove(null);
  setBtnsTooltips();   // global mode
}




  function editorSelector(){

    
  // Grab the select element
    const editorSelect = document.getElementById('editorSelect');
    
    if(!localStorage.getItem(SAR_EDITOR)){
      localStorage.setItem(SAR_EDITOR, editorSelect.value || 'monaco');
    }
    // --- Load saved choice (default to "monaco") ---
    const saved = localStorage.getItem(SAR_EDITOR) || 'monaco'; // monaco | codemirror
    editorSelect.value = saved;

    // --- Apply the editor selection immediately ---
    // applyEditorSelection(saved);   // <== your existing function that sets up monaco/codemirror

    // --- Listen for changes ---
    editorSelect.addEventListener('change', (e) => {
      const choice = e.target.value; // "monaco" or "codemirror"
      localStorage.setItem(SAR_EDITOR, choice);
      renderList()
    });
    
    // editorSelect.dispatchEvent(new Event('input',  { bubbles: true }));
    // editorSelect.dispatchEvent(new Event('change', { bubbles: true }));


  }
  editorSelector()


  function setBtnsTooltips(){
    document.querySelectorAll('.sra-script__btn.download').forEach((el) => {
      el.title = '[Click] to download this script\n[Shift+Click] to export all data'
    })
    document.querySelectorAll('.sra-script__btn.remove').forEach((el) => {
      el.title = '[Click] to delete this script\n[Shift+Click] to delete without confirm\n[Ctrl+Shift+Click] to delete all scripts'
    })
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
    renderScriptsCounterIndicator()
    save();
  }

  function addScript__full_rerender(type) {
    const s = clone(DEFAULT_SCRIPT);
    s.id = getAvailableId();
    s.type = type;
    s.name = `${s.name}${s.id}`;
    state.scripts.push(s);
    renderList();
    save();
  }

// Reuse the same factory
function addScript__no_rerender(type, atIndex, custom_s) {
  // 1) build the new script object
  const s = clone(custom_s || DEFAULT_SCRIPT) || clone(DEFAULT_SCRIPT);
  s.id = getAvailableId();
  s.type = type;
  s.name = custom_s?s.name:`${s.name}${s.id}`;

  // 2) normalize index (default append)
  const n = state.scripts.length;
  let index = (atIndex === undefined || atIndex === null || isNaN(atIndex))
    ? n
    : Math.max(0, Math.min(Number(atIndex), n));

  // 3) update state
  state.scripts.splice(index, 0, s);

  // 4) create li using the shared builder and insert at position
  const li = createScriptListItem(s, index);
  const refNode = scriptsList.children[index] || null;
  scriptsList.insertBefore(li, refNode);

  // 5) fix indices/titles/first-last buttons after the insertion
  reindexListItems();

  // 6) per-item enhancements just for the new element
  renderScriptsCounterIndicator();
  if (typeof renderEditorEl === 'function') renderEditorEl(index);
  if (typeof setBtnsTooltipsEl === 'function') setBtnsTooltipsEl(index);

  // 7) persist
  save();
}

  const addScript = addScript__no_rerender

  function removeScript__full_rerender(index, e) {
    let isShiftDown=e.shiftKey
    let isCrtlDown=e.ctrlKey
    if (index < 0 || index >= state.scripts.length) return;
    if(isShiftDown && isCrtlDown){
      if (window.confirm('Are you sure you want to delete all?')) {
        state.scripts=[]
        renderList();
        save();
      }
      return
    }
    // console.log(state)
    if(isShiftDown || (!state.scripts[index].code.length && !state.scripts[index].src.length && !state.scripts[index].host.length)){
      state.scripts.splice(index, 1);
      renderList();
      save();
      return
    }
    if (window.confirm('Are you sure you want to delete?')) {
      state.scripts.splice(index, 1);
      renderList();
      save();
    }
  }

  function removeScript__no_rerender(index, e) {
  const isShiftDown = e.shiftKey;
  const isCtrlDown  = e.ctrlKey;

  if (index < 0 || index >= state.scripts.length) return;

  // Ctrl+Shift → delete ALL
  if (isShiftDown && isCtrlDown) {
    if (window.confirm('Are you sure you want to delete all?')) {
      state.scripts = [];
      // wipe DOM list without calling renderList()
      scriptsList.innerHTML = '';
      renderScriptsCounterIndicator();
      setMove(null);
      setBtnsTooltips(); // no-ops if nothing there
      save();
    }
    return;
  }

  const s = state.scripts[index];

  // Delete without confirm if Shift held OR item is empty
  const isEmpty = (!s.code?.length && !s.src?.length && !s.host?.length);
  if (isShiftDown || isEmpty) {
    doRemoveOne(index);
    return;
  }

  if (window.confirm('Are you sure you want to delete?')) {
    doRemoveOne(index);
  }

  function doRemoveOne(idx) {
    // 1) remove from state
    state.scripts.splice(idx, 1);

    // 2) remove corresponding <li> from DOM
    const li = scriptsList.querySelector(`li[data-index="${idx}"]`);
    if (li && li.parentNode) li.parentNode.removeChild(li);

    // 3) reindex subsequent items and refresh per-row UI bits
    const items = scriptsList.querySelectorAll('li[data-index]');
    items.forEach((row, i) => {
      // update dataset index
      row.dataset.index = String(i);

      // update title tooltip reflecting new index and type/name
      const nameInput = row.querySelector('.sra-script__name');
      const script = state.scripts[i];
      if (nameInput && script) {
        nameInput.title = `#${i} (${script.type}) "${script.name || ''}"`;
      }

      // move-up / move-down disabled states
      const upBtn = row.querySelector('.move-up');
      const downBtn = row.querySelector('.move-down');
      if (upBtn)   upBtn.classList.toggle('disabled-item', i === 0);
      if (downBtn) downBtn.classList.toggle('disabled-item', i === state.scripts.length - 1);
    });

    // 4) update counters / misc UI; avoid full re-render
    renderScriptsCounterIndicator();
    setMove(null);

    // if your tooltip setter supports per-index, call with per-row;
    // otherwise calling once is fine (it only sets title attributes).
    setBtnsTooltips();

    // 5) persist
    save();
  }
}


  const removeScript = removeScript__no_rerender

  function sanitizeFilename(name, fallback = 'script') {
    const s = (name || fallback).toString().trim() || fallback;
    return s.replace(/[\\/:*?"<>|]+/g, '_');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function guessExtFromSrc(src) {
    try {
      const p = new URL(src, location.href).pathname;
      const m = p.match(/\.(js|mjs|cjs|ts|json|txt|css|html|md)$/i);
      return m ? m[0] : '.js';
    } catch {
      return '.js';
    }
  }

function genericDownload(e, index) {
  if (e.shiftKey) {
    if(!confirm('Export all data to file?')){return}
    const sarLocal = lstore.get(STORAGE_KEY);
    
    if (!sarLocal) return; // no content to save
    
    const content = SAR_PREFIX+JSON.stringify(sarLocal)

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'SAR_data_export.txt'; // pick a file name here
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url); // clean up
  } else {
    downloadScript(index);
  }
}
function duplicate(e, index) {
  let d = clone(state.scripts[index])
  // d.name+=' (copy)'

function dupName(name) {
  const baseMatch = name.match(/^(.*?)(?: \(copy(?: (\d+))?\))?$/);
  const baseName = baseMatch[1];
  let num = baseMatch[2] ? parseInt(baseMatch[2], 10) + 1 : 0;

  let dupname = num === 0 
    ? `${baseName} (copy)` 
    : `${baseName} (copy ${num})`;

  let i = num;
  while (state.scripts.some(x => x.name === dupname)) {
    i++;
    dupname = `${baseName} (copy ${i+1})`;
    if (i > 1000) break; // safety stop
  }

  return dupname;
}

  d.name = dupName(d.name)

  addScript(d.type, index+1, d)
}

window.addEventListener("storage", (event) => {
  if(event.key == _POPUP_STORAGE_CHANGE_KEY){
    window.location.reload()
  }
  console.log("Storage changed!");
  console.log("key:", event.key);
  console.log("oldValue:", event.oldValue);
  console.log("newValue:", event.newValue);
  console.log("url:", event.url);
});

// window.addEventListener("resize", (event) => {

// });

function maxMinScriptBox(e, index) {
  const behave = 'auto'
  const el = document.querySelectorAll('.sra-scripts .sra-script')[index]
  if(state.scripts[index].type == 'external'){return}
  
  const textbox = el.querySelector('.monaco-container') || el.querySelector('.CodeMirror') || el.querySelector('.code');

  // Make sure we can track state on the element
  if (!el.dataset.boxstate) {
    el.dataset.boxstate = "minimized";
  }

  if (el.dataset.boxstate !== "maximized") {
    initialYScrollState = window.scrollY || document.documentElement.scrollTop;
    // Scroll the page so the element is at the top
    const rect = el.getBoundingClientRect();
    const scrollTop = window.scrollY + rect.top;
    

    // Resize element to viewport dimensions
    // el.style.position = "fixed";
    // el.style.top = "0px";
    // el.style.left = "0px";

    // textbox.style.width = (window.innerWidth - 220) + "px";
    // textbox.style.height = (window.innerHeight - 90) + "px";
    el.dataset.width = textbox.style.width;
    el.dataset.height = textbox.style.height;

    textbox.style.width = 'calc( 100vw - 220px )';
    textbox.style.height = 'calc( 100vh - 90px )';
    
    // el.style.zIndex = "9999";
    setTimeout(()=>{
      window.scrollTo({ top: scrollTop, behavior: behave });
    }, 0)
    

    if(el.querySelector('.monaco-container'))
    el.querySelector('.monaco-container').style.overflow = 'visible'


    el.dataset.boxstate = "maximized";

  } else {
    window.scrollTo({ top: initialYScrollState, behavior: behave });
    // Reset styles back to default
    // el.style.position = "";
    // el.style.top = "";
    // el.style.left = "";

    // textbox.style.width = "";
    // textbox.style.height = "";
    textbox.style.width = el.dataset.width;
    textbox.style.height = el.dataset.height;
    
    // el.style.zIndex = "";
    if(el.querySelector('.monaco-container'))
    el.querySelector('.monaco-container').style.overflow = ''
    el.dataset.boxstate = "minimized";
  }
}




  async function downloadScript(index) {
    if (index < 0 || index >= state.scripts.length) return;
    const s = state.scripts[index];
    if (!s) return;
    if (!s.code && !s.src) {alert('Nothing to download: script is empty'); return};

    if (s.type === 'snippet') {
      const code = String(s.code || '');
      const hasCode = code.trim().length > 0;
      const base = sanitizeFilename(s.name || `Script${s.id ?? index}`);
      const ext = hasCode ? '.js' : '.txt';
      const blob = new Blob([code], { type: 'text/javascript;charset=utf-8' });
      downloadBlob(blob, `${base}${ext}`);
      return;
    }

    // type === 'external'
    const src = (s.src || '').trim();
    const base = sanitizeFilename(
      (s.name || '') ||
      (src ? src.split('/').pop().split('?')[0] : '') ||
      `Script${s.id ?? index}`
    );
    const ext = guessExtFromSrc(src);

    if (!src) {
      const blob = new Blob(
        ['// Empty "external" script: no URL set\n'],
        { type: 'text/plain;charset=utf-8' }
      );
      downloadBlob(blob, `${base}.txt`);
      return;
    }

    // Try to fetch the external script (may fail due to CORS)
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 10000); // 10s timeout
      const res = await fetch(src, { signal: ctl.signal, credentials: 'omit' });
      clearTimeout(t);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
      const mime =
        ext === '.json' ? 'application/json;charset=utf-8'
        : ext === '.css' ? 'text/css;charset=utf-8'
        : ext === '.html' ? 'text/html;charset=utf-8'
        : 'text/javascript;charset=utf-8';

      const blob = new Blob([text], { type: mime });
      const fname = base.endsWith(ext) ? base : `${base}${ext}`;
      downloadBlob(blob, fname);
    } catch (err) {
      console.warn('Could not fetch external script; falling back to URL note.', err);
      const note =
  `// Could not download external script due to CORS/network.
  // You can open this URL directly to save it:
  ${src}
  `;
      const blob = new Blob([note], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `${base}.txt`);
    }
  }

  // simple but inefficient
  function moveTo__full_rerender(fromIndex, toIndex) {
    if (
      fromIndex < 0 || fromIndex >= state.scripts.length ||
      toIndex   < 0 || toIndex   >= state.scripts.length
    ) return;

    const [moved] = state.scripts.splice(fromIndex, 1);
    state.scripts.splice(toIndex, 0, moved);

    renderList();
    save();
  }

  // more efficient
  function moveTo__no_rerender(fromIndex, toIndex) {
    const n = state.scripts.length;
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= n || toIndex < 0 || toIndex >= n) return;

    // 1) Update state
    const [moved] = state.scripts.splice(fromIndex, 1);
    state.scripts.splice(toIndex, 0, moved);

    // 2) Reorder DOM nodes in-place
    const fromEl = scriptsList.querySelector(`li[data-index="${fromIndex}"]`);
    const toEl   = scriptsList.querySelector(`li[data-index="${toIndex}"]`);
    
    if (!fromEl || !toEl) { save(); return; }

    
    // Move the existing node without recreating it
    if (fromIndex < toIndex) {
      // insert after `toEl`
      scriptsList.insertBefore(fromEl, toEl.nextSibling);
    } else {
      // insert before `toEl`
      scriptsList.insertBefore(fromEl, toEl);
    }

    // 3) Recompute data-index and per-index UI bits for all items
    const items = scriptsList.querySelectorAll('li');
    items.forEach((li, i) => {
      li.dataset.index = String(i);

      // first/last move buttons state
      const upBtn = li.querySelector('.move-up');
      const dnBtn = li.querySelector('.move-down');
      if (upBtn) upBtn.classList.toggle('disabled-item', i === 0);
      if (dnBtn) dnBtn.classList.toggle('disabled-item', i === items.length - 1);

      // update title to reflect new index (preserves type/name from inputs)
      const nameInput = li.querySelector('.sra-script__name');
      if (nameInput) {
        const s = state.scripts[i];
        nameInput.title = `#${i} (${s.type}) "${s.name}"`;
      }
    });

    function swap(arr, fromIndex, toIndex) {
    if (
      !Array.isArray(arr) ||
      fromIndex < 0 || fromIndex >= arr.length ||
      toIndex < 0 || toIndex >= arr.length
    ) {
      throw new Error("Invalid indices or input array");
    }

  [arr[fromIndex], arr[toIndex]] = [arr[toIndex], arr[fromIndex]];
  return arr;
}

    // 4) Any per-item tooltips/editors that depend on index are still attached to the same DOM nodes.
    //    If your tooltip/editor logic *reads* data-index later, it's already updated above.
    setBtnsTooltips()
    save();
  }

  const moveTo = moveTo__no_rerender
  // const moveTo = moveTo__full_rerender


  function moveUp__full_rerender(index) {
    if (index - 1 < 0) return;
    [state.scripts[index - 1], state.scripts[index]] = [state.scripts[index], state.scripts[index - 1]];
    renderList(); save();
  }

  function moveDown__full_rerender(index) {
    if (index + 1 >= state.scripts.length) return;
    [state.scripts[index + 1], state.scripts[index]] = [state.scripts[index], state.scripts[index + 1]];
    renderList(); save();
  }

  function moveUp__no_rerender(index) {
    if (index <= 0) return;
    moveTo(index, index - 1); // moveTo already updates state + DOM + calls save()
  }

  function moveDown__no_rerender(index) {
    if (index + 1 >= state.scripts.length) return;
    moveTo(index, index + 1); // moveTo already updates state + DOM + calls save()
  }

  const moveUp = moveUp__no_rerender
  const moveDown = moveDown__no_rerender

  function togglePowerPerScript(index) {
    const s = state.scripts[index]; if (!s) return;
    s.enable = !s.enable;
    const li = scriptsList.querySelector(`li[data-index="${index}"]`);
    if (li) li.classList.toggle('sra-script--enable', s.enable);
    save();
    renderScriptsCounterIndicator()
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
    else if (e.target.closest('.remove'))           removeScript(index, e);
    else if (e.target.closest('.download'))         genericDownload(e, index);
    else if (e.target.closest('.duplicate'))         duplicate(e, index);
    else if (e.target.closest('.max-min-btn'))          maxMinScriptBox(e, index);
  });
  
  scriptsList.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li.sra-script'); if (!li) return;
    const index = parseInt(li.dataset.index, 10); if (Number.isNaN(index)) return;

    if(e.target.closest('li.sra-script')){
      let el = document.querySelectorAll('.sra-scripts .sra-script')[index]
      
      if(el && el.dataset.boxstate=='maximized'){
        const rect = el.getBoundingClientRect();
        const scrollTop = window.scrollY + rect.top;
        window.scrollTo({ top: scrollTop, behavior: 'auto' });
      }
    }


    if (e.target.closest('.move-drag'))          {setMove(index, e); dispositionState=Array.from(document.querySelectorAll('.sra-scripts .sra-script'));  }
    else if (e.target.closest('.sra-script__type'))   {setMove(index, e); dispositionState=Array.from(document.querySelectorAll('.sra-scripts .sra-script'));  }
    else if (e.target.closest('.sra-script__plug') || e.target.closest('.sra-script__btns')) {
      tout0 = setTimeout(()=>{
        setMove(index, e); dispositionState=Array.from(document.querySelectorAll('.sra-scripts .sra-script'));  
      }, 220)
    }
    // else if (e.target.closest('.move-up'))          {setMove(index); dispositionState=Array.from(document.querySelectorAll('.sra-scripts .sra-script'));  }
    // else if (e.target.closest('.move-down'))        {setMove(index); dispositionState=Array.from(document.querySelectorAll('.sra-scripts .sra-script'));  };
    // else if (e.target.closest('.remove'))           removeScript(index, e);
    // else if (e.target.closest('.download'))         genericDownload(e, index);
  });

  document.body.addEventListener('mouseup', (e) => {
    resetMove()
  });
  document.body.addEventListener('mouseleave', (e) => {
    resetMove()
  });

function setMove(index, e) {
  document.body.classList.add('no-select')
  if (index != null) {
    moveFromIndex = index;
    moveToIndex = index;
  }

  if (moveToIndex != -1) {
    document
      .querySelectorAll('.sra-script')
      [moveToIndex].classList.add(DRAG_MOVE_V2?'active-move-inplace':'active-move-v1');


      if(DRAG_MOVE_V2){
        if(!document.querySelector('#tempdrag')){
          let tempdrag = document.querySelectorAll('.sra-script')[moveFromIndex].cloneNode(true)
          
          tempdrag.id = 'tempdrag'
          // tempdrag.classList.add('active-move-v2')
          tempdrag.classList.remove('active-move-inplace')
          // setTimeout(()=>{tempdrag.classList.add('active-move-v2')},0)

          tempdrag.style.listStyleType='none'
          document.body.appendChild(tempdrag)
          requestAnimationFrame(() => {
            tempdrag.classList.add('active-move-v2'); // apply the target state next frame
          });
          draggingTempdrag(e, moveFromIndex)
        }
      }
        document.querySelector('#backdrop-panel').hidden = false
        document.querySelector('#backdrop-panel').style.cursor = 'grabbing'
  }



}

function resetMove() {
  clearTimeout(tout0)
  document.body.classList.remove('no-select')
  if (moveToIndex != -1) {
    document
      .querySelectorAll('.sra-script')
      [moveToIndex].classList.remove(DRAG_MOVE_V2?'active-move-inplace':'active-move-v1');
  }
  moveToIndex = -1;
  moveFromIndex = -1;
  document.querySelector('#backdrop-panel').hidden = true
  document.querySelector('#backdrop-panel').style.cursor = ''
  if(document.querySelector('#tempdrag')){
    document.querySelector('#tempdrag').remove()
  }
}

function draggingTempdrag(e, index){
    let tempdrag = document.querySelector('#tempdrag')
    
    if(e.type == 'mousedown'){
      let target = document.querySelectorAll('.sra-scripts .sra-script')[index]
      let liRect = target.getBoundingClientRect()

      mouseDragStartingState = {x: e.clientX, y: e.clientY, target_x: liRect.left, target_y: liRect.top, target_h: liRect.height, target_w: liRect.width }
    }

    if(tempdrag){
      // move tempdrag with mouse
      tempdrag.style.pointerEvents = 'none'; // so it doesn't block other elements
      
      let scaleValue = 1.03
      
      let relativeX = (mouseDragStartingState.x - mouseDragStartingState.target_x) 
      let relativeY = (mouseDragStartingState.y - mouseDragStartingState.target_y)

      tempdrag.style.transformOrigin = `${relativeX}px ${relativeY}px`

      tempdrag.style.left = (e.clientX - relativeX) + 'px';
      tempdrag.style.top = (e.clientY - relativeY - 10) + 'px';
      
    }
}

document.addEventListener("scroll", () => {
  // Clear the timeout on every scroll event
  clearTimeout(tout1);
  isPageScrolling=true
  

  // console.log("Scrolling...");

  // Set a timeout to detect when scrolling ends
  tout1 = setTimeout(() => {
    // console.log("Stopped scrolling");
    isPageScrolling=false
  }, 150); // 150ms after last scroll event
});



document.addEventListener('mousemove', e => {

  if(isPageScrolling){

  }

  if (moveFromIndex === -1) return;

  const s = dispositionState;
  if (!s || !s.length) return;

  if(DRAG_MOVE_V2)
  draggingTempdrag(e, moveFromIndex)

  const y = e.clientY;

  // before first
  const firstTop = s[0].getBoundingClientRect().top;
  if (y < firstTop) {
    moveToIndex = 0
    if(moveFromIndex!=moveToIndex){
      moveTo(moveFromIndex, moveToIndex);
      dispositionState = Array.from(document.querySelectorAll('.sra-scripts .sra-script'));
    }
    
    moveFromIndex = 0;

    return;
  }

  // between items
  for (let i = 1; i < s.length; i++) {
    const prevTop = s[i - 1].getBoundingClientRect().top;
    const nextTop = s[i].getBoundingClientRect().top;
    if (y >= prevTop && y < nextTop) {
      moveToIndex = i - 1
      if(moveFromIndex!=moveToIndex){
        moveTo(moveFromIndex, moveToIndex);
        dispositionState = Array.from(document.querySelectorAll('.sra-scripts .sra-script'));
      }
      moveFromIndex = i - 1;
      
      
      return;
    }
  }
  // alert(1)
  // AFTER LAST: use the bottom half of the last item
  const lastRect = s[s.length - 1].getBoundingClientRect();
  // const afterThreshold = (lastRect.top + lastRect.bottom) / 2; // midpoint
  // const afterThreshold = (lastRect.top + (lastRect.bottom - lastRect.top) / 100) ; // midpoint
  const afterThreshold = (lastRect.top) ; // midpoint
  // const afterThreshold = (lastRect.bottom); // midpoint
  if (y >= afterThreshold) {
    // s.length means "insert after last"
    moveToIndex = s.length - 1
    if(moveFromIndex!=moveToIndex){
      moveTo(moveFromIndex, moveToIndex);
      dispositionState = Array.from(document.querySelectorAll('.sra-scripts .sra-script'));
    }
    moveFromIndex = s.length - 1;
    
    return;
    
  }

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

// extras
    setupDragAndDrop();

// --- Drag & Drop: helpers ---
function isTextFile(file) {
  if (!file) return false;
  const nameOk = /\.(js|mjs|cjs|ts|tsx|jsx|json|txt|md|css|scss|less|html|htm)$/i.test(file.name || '');
  const typeOk = (file.type || '').startsWith('text') || file.type === '' || file.type === 'application/json';
  return nameOk || typeOk;
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = reject;
    fr.readAsText(file);
  });
}

// Create a new snippet with prefilled content
async function addSnippetWithContent(name, content) {
  const s = clone(DEFAULT_SCRIPT);
  s.id = getAvailableId();
  s.type = 'snippet';
  s.enable = false;
  s.name = name || `Script${s.id}`;
  s.code = content || '';
  
  // full rerender
  state.scripts.push(s);
  renderList();

  // no rerender
  // addScript__no_rerender(s.type, undefined, s)


  await save();
  return state.scripts.length - 1;
}

function highlightDropTarget(el, on) {
  if (!el) return;
  el.classList.toggle('sra-drop--over', !!on);
}

// --- Drag & Drop: core wiring ---
function setupDragAndDrop() {
  // Prevent the browser from navigating away on file drop
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt =>
    app.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); })
  );

  let lastHoverBox = null;

  app.addEventListener('dragover', (e) => {
    const box = e.target.closest('.sra-script__box');
    if (box !== lastHoverBox) {
      highlightDropTarget(lastHoverBox, false);
      lastHoverBox = box;
      highlightDropTarget(lastHoverBox, true);
    }
  });

  app.addEventListener('dragleave', () => {
    highlightDropTarget(lastHoverBox, false);
    lastHoverBox = null;
  });

  

  async function importSarFile(file) {
    
    // Read text and strip BOM
    const text = (await file.text()).replace(/^\uFEFF/, '');

    if (!text.startsWith(SAR_PREFIX)) return false;

    const payload = text.slice(SAR_PREFIX.length).trimStart();

    // Optional: validate payload if it's JSON
    try { JSON.parse(payload); } catch(e) {console.error(e); return false; }

    setUnified(STORAGE_KEY, JSON.parse(payload));
    return true;
  }

  app.addEventListener('drop', async (e) => {
    const files = Array.from(e.dataTransfer?.files || []).filter(isTextFile);
    highlightDropTarget(lastHoverBox, false);
    const box = e.target.closest('.sra-script__box');

    if (!files.length) return;

    try {
        for (const file of files) {
          const ok = await importSarFile(file);
          if (ok) {
            // Optional: feedback toast/snackbar
            // showToast('Imported SAR data, reloading...');
            window.location.reload();
            return;
          }
        }
        console.warn('No valid __SAR_DATA file found in dropped files.');
      } catch (err) {
        console.error('Failed to import SAR data:', err);
      }
    

    if (box) {
      // Dropped on an existing script box: merge all files into that item's code
      const li = box.closest('li.sra-script');
      const index = parseInt(li?.dataset?.index ?? '-1', 10);
      if (!Number.isInteger(index) || index < 0 || index >= state.scripts.length) return;

      try {
        const texts = await Promise.all(files.map(readFileAsText));
        const content = texts.join('\n\n/* --- next file --- */\n\n');

        // Force to snippet type and set code
        state.scripts[index].type = 'snippet';
        state.scripts[index].code = content;

        // Update UI fields in-place if present
        const typeIcon = li.querySelector('.type-icon');
        const snippetBox = li.querySelector('.sra-script__snippet');
        const externalBox = li.querySelector('.sra-script__external');
        if (typeIcon) typeIcon.className = 'type-icon icon-code';
        if (snippetBox && externalBox) { snippetBox.style.display = ''; externalBox.style.display = 'none'; }
        const codeArea = li.querySelector('.code');
        if (codeArea) codeArea.value = content;

        await save();
      } catch (err) {
        console.error('Reading dropped file failed:', err);
        window.alert('Could not read the dropped file(s).');
      }
    } else {
      // Dropped on background: create one new script per file
      try {
        for (const f of files) {
          const text = await readFileAsText(f);
          await addSnippetWithContent(f.name?.replace(/\.[^.]+$/, '') || undefined, text);
        }
      } catch (err) {
        console.error('Creating scripts from dropped file(s) failed:', err);
        window.alert('Could not create script(s) from the dropped file(s).');
      }
    }
    renderList()
  });
}

  })();


  window.state = state
  window.tpl = tpl
  window.renderScriptsCounterIndicator = renderScriptsCounterIndicator
  window.setMove = setMove
  window.setBtnsTooltips  = setBtnsTooltips 
  window.save  = save

})();

function renderEditor(){
  // choose one
  let s = localStorage.getItem(SAR_EDITOR)
  // document.querySelectorAll('.monaco-loading').forEach((ta) => {ta.hidden=true})
  if(s == 'codemirror'){
    renderCodeMirrorEl()
  }
  else if( s=='monaco'){
    document.querySelectorAll('.sra-scripts textarea.code').forEach((ta) => {ta.classList.remove('monaco')})
    document.querySelectorAll('.sra-scripts textarea.code').forEach((ta) => {ta.classList.add('monaco')})
    // document.querySelectorAll('.monaco-loading').forEach((ta) => {ta.hidden=false})
    renderMonacoEl()
  }
  else{
    document.querySelectorAll('.sra-scripts textarea.code').forEach((ta) => {ta.classList.remove('monaco')})
  }
  
  
}

function renderCodeMirror() {
  const editors = [];

  document.querySelectorAll('.sra-scripts textarea.code').forEach((ta) => {
    const editor = CodeMirror.fromTextArea(ta, {
      mode: 'javascript',
      lineNumbers: true,
      theme: 'default',
      placeholder: "Type your code or drop a script file here..."
    });

    // Keep textarea.value in sync with CodeMirror on every edit
    const syncEditorToTextarea = () => {
      const val = editor.getValue();
      if (ta.value !== val) {
        ta.value = val;
        // Bubble so any delegated handlers (like your state updater) see it
        ta.dispatchEvent(new Event('input',  { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    // Initial sync (in case editor modifies formatting on load)
    syncEditorToTextarea();

    // Sync on every change in CodeMirror
    editor.on('change', syncEditorToTextarea);

    // (Optional) If you ever edit ta.value programmatically and dispatch an event,
    // mirror it back into CodeMirror so both stay aligned.
    const syncTextareaToEditor = () => {
      const val = ta.value;
      if (editor.getValue() !== val) editor.setValue(val);
    };
    ta.addEventListener('input',  syncTextareaToEditor);
    ta.addEventListener('change', syncTextareaToEditor);

    editors.push(editor);
  });

  // Example: get values of all code editors
  function getAllCode() {
    return editors.map((ed) => ed.getValue());
  }

  // (Optional) return helpers if you need them elsewhere
  return { editors, getAllCode };
}

// Keep CM instances associated to their original <textarea>
const __cmMap = new WeakMap();

function renderCodeMirrorEl(index) {
  const setupFor = (ta, idx) => {
    // Avoid double init
    if (__cmMap.has(ta)) return __cmMap.get(ta);

    const editor = CodeMirror.fromTextArea(ta, {
      mode: 'javascript',
      lineNumbers: true,
      theme: 'default',
      placeholder: "Type your code or drop a script file here..."
    });

    // Keep textarea.value in sync with CodeMirror on every edit
    const syncEditorToTextarea = () => {
      const val = editor.getValue();
      if (ta.value !== val) {
        ta.value = val;
        ta.dispatchEvent(new Event('input',  { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    // Initial sync
    syncEditorToTextarea();

    // Sync on every change in CodeMirror
    editor.on('change', syncEditorToTextarea);

    // Keep CodeMirror in sync if textarea is edited programmatically
    const syncTextareaToEditor = () => {
      const val = ta.value;
      if (editor.getValue() !== val) editor.setValue(val);
    };
    ta.addEventListener('input',  syncTextareaToEditor);
    ta.addEventListener('change', syncTextareaToEditor);

    __cmMap.set(ta, editor);
    return editor;
  };

  // If an index is provided, init only that item
  if (index !== undefined && index !== null) {
    const li = scriptsList.querySelector(`li[data-index="${index}"]`);
    if (!li) return null;
    const ta = li.querySelector('textarea.code');
    if (!ta) return null;
    return setupFor(ta, index);
  }

  // Otherwise, initialize all (legacy behavior)
  const editors = [];
  document.querySelectorAll('.sra-scripts textarea.code').forEach((ta, i) => {
    editors.push(setupFor(ta, i));
  });

  // helpers
  const getAllCode = () => editors.map((ed) => ed.getValue());
  return { editors, getAllCode };
}

// Optional utilities if you need them elsewhere:
function getCodeMirrorForIndex(index) {
  const li = scriptsList.querySelector(`li[data-index="${index}"]`);
  if (!li) return null;
  const ta = li.querySelector('textarea.code');
  return ta ? __cmMap.get(ta) || null : null;
}

function getAllCodeMirrorEditors() {
  // WeakMap isn't iterable; re-scan DOM to collect known instances.
  const out = [];
  document.querySelectorAll('.sra-scripts textarea.code').forEach((ta) => {
    const ed = __cmMap.get(ta);
    if (ed) out.push(ed);
  });
  return out;
}



