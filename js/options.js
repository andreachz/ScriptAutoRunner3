const _POPUP_STORAGE_CHANGE_KEY = 'POPUP_STORAGE_CHANGE_KEY'
const SAR_PREFIX = '__SAR_DATA::';
let moveFromIndex = -1;
let moveToIndex = -1;
let oldScriptsDisposition;
const DRAG_MOVE_V2 = true
const SAR_EDITOR = '_SAR_EDITOR'


document.getElementById("info-btn").addEventListener("click", function () {
  alert("ScriptAutoRunner3 \n\nThis fork (26 Aug, 2025):\nhttps://github.com/andreachz/ScriptAutoRunner3\n\nOriginal fork (Sep 16, 2015 - Jan 11, 2025):\nhttps://github.com/nakajmg/ScriptAutoRunner");
});


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
    let activeScripts = state.scripts.length?', '+state.scripts.filter(x=>x.enable).length+' enabled':''
    document.querySelector('.sra-noscripts').children[0].innerText=totalScripts+activeScripts
  }

  function renderList() {
    
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
      el.title = '[Click] to download script\n[Shift+Click] to export all data'
    })
    document.querySelectorAll('.sra-script__btn.remove').forEach((el) => {
      el.title = '[Click] to delete\n[Shift+Click] to delete without confirm\n[Ctrl+Shift+Click] to delete all'
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

  function removeScript(index, e) {
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


  function moveTo(fromIndex, toIndex) {
    if (
      fromIndex < 0 || fromIndex >= state.scripts.length ||
      toIndex   < 0 || toIndex   >= state.scripts.length
    ) return;

    const [moved] = state.scripts.splice(fromIndex, 1);
    state.scripts.splice(toIndex, 0, moved);

    renderList();
    save();
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
  });
  
  scriptsList.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li.sra-script'); if (!li) return;
    const index = parseInt(li.dataset.index, 10); if (Number.isNaN(index)) return;

    if (e.target.closest('.sra-script__plug'))        return;
    else if (e.target.closest('.move-drag'))          {setMove(index); oldScriptsDisposition=Array.from(document.querySelectorAll('.sra-scripts .sra-script'));  }
    // else if (e.target.closest('.move-up'))          {setMove(index); oldScriptsDisposition=Array.from(document.querySelectorAll('.sra-scripts .sra-script'));  }
    // else if (e.target.closest('.move-down'))        {setMove(index); oldScriptsDisposition=Array.from(document.querySelectorAll('.sra-scripts .sra-script'));  };
    // else if (e.target.closest('.remove'))           removeScript(index, e);
    // else if (e.target.closest('.download'))         genericDownload(e, index);
  });

  document.body.addEventListener('mouseup', (e) => {
    resetMove()
  });
  document.body.addEventListener('mouseleave', (e) => {
    resetMove()
  });

function setMove(index) {
  if (index != null) {
    moveFromIndex = index;
    moveToIndex = index;
  }

  if (moveToIndex != -1) {
    document
      .querySelectorAll('.sra-script')
      [moveToIndex].classList.add(DRAG_MOVE_V2?'active-move-inplace':'active-move-v1');
      document.querySelector('#backdrop-panel').hidden = false
      document.querySelector('#backdrop-panel').style.cursor = 'grabbing'

      if(DRAG_MOVE_V2){
        if(!document.querySelector('#tempdrag')){
          let tempdrag = document.querySelectorAll('.sra-script')[moveFromIndex].cloneNode(true)
          tempdrag.id = 'tempdrag'
          tempdrag.classList.remove('active-move-inplace')
          tempdrag.classList.add('active-move-v2')
          tempdrag.style.listStyleType='none'
          document.body.appendChild(tempdrag)
          draggingTempdrag(null, moveFromIndex)
        }
      }
  }







}

function resetMove() {
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
    
  if(tempdrag){
    let target = document.querySelectorAll('.sra-scripts .sra-script')[index]

    let dragBtn = target.querySelector(".move-drag")

    let liRect = target.getBoundingClientRect()
    let btnRect = dragBtn.getBoundingClientRect()

    let relativeX = btnRect.left - liRect.left
    let relativeY = btnRect.top - liRect.top
    // move tempdrag with mouse
    tempdrag.style.pointerEvents = 'none'; // so it doesn't block other elements
    if(e){
    tempdrag.style.left = (e.clientX - relativeX - 25) + 'px';
    tempdrag.style.top = (e.clientY - relativeY - 15) + 'px';
    }
    else{
      tempdrag.style.left = (liRect.left - 15)+'px'
      tempdrag.style.top = (liRect.top)+'px'
    }
  }
}

document.addEventListener('mousemove', e => {
  if (moveFromIndex === -1) return;

  const s = oldScriptsDisposition;
  if (!s || !s.length) return;

  if(DRAG_MOVE_V2)
  draggingTempdrag(e, moveFromIndex)

  const y = e.clientY;

  // before first
  const firstTop = s[0].getBoundingClientRect().top;
  if (y < firstTop) {
    moveToIndex = 0
    if(moveFromIndex!=moveToIndex)
    moveTo(moveFromIndex, moveToIndex);
    moveFromIndex = 0;
    oldScriptsDisposition = Array.from(document.querySelectorAll('.sra-scripts .sra-script'));
    return;
  }

  // between items
  for (let i = 1; i < s.length; i++) {
    const prevTop = s[i - 1].getBoundingClientRect().top;
    const nextTop = s[i].getBoundingClientRect().top;
    if (y >= prevTop && y < nextTop) {
      moveToIndex = i - 1
      if(moveFromIndex!=moveToIndex)
      moveTo(moveFromIndex, moveToIndex);
      moveFromIndex = i - 1;
      
      oldScriptsDisposition = Array.from(document.querySelectorAll('.sra-scripts .sra-script'));
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
    if(moveFromIndex!=moveToIndex)
    moveTo(moveFromIndex, moveToIndex);
    moveFromIndex = s.length - 1;
    oldScriptsDisposition = Array.from(document.querySelectorAll('.sra-scripts .sra-script'));
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
  state.scripts.push(s);
  renderList();
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
})();

function renderEditor(){
  // choose one
  let s = localStorage.getItem(SAR_EDITOR)
  if(s == 'codemirror'){
    renderCodeMirror()
  }
  else if( s=='monaco'){
    document.querySelectorAll('.sra-scripts textarea.code').forEach((ta) => {ta.classList.remove('monaco')})
    document.querySelectorAll('.sra-scripts textarea.code').forEach((ta) => {ta.classList.add('monaco')})
    renderMonaco()
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
      theme: 'default'
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


