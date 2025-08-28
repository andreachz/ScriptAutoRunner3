
// Point the AMD loader at Monaco's "vs" folder on the CDN
 require.config({ paths: { vs: "js/monaco-editor/dev/vs" } });

// Optional: set theme globally (light by default)
// monaco.editor.setTheme('vs-dark');

// require(['vs/editor/editor-csp-compliant.main'], renderMonaco);

function renderMonaco(){
    require(['vs/editor/editor.main'], _renderMonaco);
}

function _renderMonaco() {
    
    const editors = new Map(); // textarea -> monaco editor
    
    // Language helper: use data-language, else infer from name/id
    function inferLanguage(el) {
    if (el.dataset.language) return el.dataset.language;
    const source = el.getAttribute('name') || el.id || '';
    const m = source.match(/\.([a-z0-9]+)$/i);
    const ext = m && m[1].toLowerCase();
    const map = {
        js: 'javascript', mjs: 'javascript', cjs: 'javascript',
        ts: 'typescript', tsx: 'typescript',
        jsx: 'javascript',
        json: 'json',
        html: 'html', htm: 'html',
        css: 'css', scss: 'scss', less: 'less',
        md: 'markdown', markdown: 'markdown',
        py: 'python',
        rb: 'ruby',
        php: 'php',
        java: 'java',
        c: 'c', h: 'c',
        cpp: 'cpp', cxx: 'cpp', hpp: 'cpp',
        rs: 'rust',
        go: 'go',
        sql: 'sql',
        yaml: 'yaml', yml: 'yaml',
        xml: 'xml',
        sh: 'shell',
    };
    return 'javascript' || map[ext] || 'plaintext';
    }

    // Enhance all target textareas
    document.querySelectorAll('.sra-scripts textarea.monaco').forEach((ta) => {
    // Wrap + create container
    const wrapper = document.createElement('div');
    wrapper.className = 'monaco-wrapper';
    const container = document.createElement('div');
    container.className = 'monaco-container';
    ta.parentNode.insertBefore(wrapper, ta.nextSibling);
    wrapper.appendChild(container);

    // Create the editor with the textarea's initial value
    const language = inferLanguage(ta);
    // define a custom theme with semi-transparent background
    monaco.editor.defineTheme('vs-custom', {
    base: 'vs',       // use 'vs-dark' if you prefer a dark base
    inherit: true,    // keep all the normal token colors
    rules: [],
    colors: {
        'editor.background': '#ffffff80',
        'editorGutter.background': '#ffffff80',
        'minimap.background': '#ffffff80',

        // focus outline
        'focusBorder': '#00000000',          // fully remove
        'editor.focusBorder': '#00000000'    // editor-specific
    }
    });

    const editor = monaco.editor.create(container, {
        value: ta.value,
        language,
        automaticLayout: false, // we’ll handle with ResizeObserver
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: 'off',
        fontSize: 12,
        // lineHeight: 18,
        theme: 'vs-custom', // 'vs' 'vs-dark' or 'hc-black' also available
    });
      
    // const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    //   monaco.editor.setTheme(dark ? 'vs-dark' : 'vs');

    // --- Sync Monaco -> textarea (and bubble events, like your CM version) ---
    const syncEditorToTextarea = () => {
      const val = editor.getValue();
      if (ta.value !== val) {
        ta.value = val;
        ta.dispatchEvent(new Event('input',  { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    // Initial sync (in case Monaco normalizes line endings etc.)
    syncEditorToTextarea();

    // Keep textarea in sync on every edit
    editor.onDidChangeModelContent(syncEditorToTextarea);

    // --- Optional: Sync textarea -> Monaco (if you change ta.value programmatically) ---
    const syncTextareaToEditor = () => {
      const val = ta.value;
      if (editor.getValue() !== val) editor.setValue(val);
    };
    ta.addEventListener('input',  syncTextareaToEditor);
    ta.addEventListener('change', syncTextareaToEditor);

    // Ensure value is synced on submit (belt & suspenders)
    const form = ta.closest('form');
    if (form) {
      form.addEventListener('submit', () => {
        ta.value = editor.getValue();
      });
    }

    // Resize Monaco when its container changes size
    const ro = new ResizeObserver(() => editor.layout());
    ro.observe(container);

    editors.set(ta, { editor, ro, container, wrapper });
    });

    // Clean up on navigation
    // window.addEventListener('beforeunload', () => {
    // editors.forEach(({ editor, ro }) => {
    //     try { ro.disconnect(); } catch {}
    //     try { editor.dispose(); } catch {}
    // });
    // editors.clear();
    // });
}
