

if(window === window.parent){

// alert('apposto')
async function askTalkai(chatInput){
    


const { question, content } = chatInput;


let prompt = `
You extract answers from the provided CONTENT.
###CONTENT START

${content}

###CONTENT END

###QUESTION

${question}
`

console.log(prompt,)


// Runs in the top page (any injected snippet/file)
function iframeFetch(iframeEl, url, init = {}, targetOrigin = "*", timeoutMs = 15000) {
  if (!iframeEl || !iframeEl.contentWindow) {
    return Promise.reject(new Error("iframe not available"));
  }

  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error("iframeFetch timeout"));
    }, timeoutMs);

    channel.port1.onmessage = (ev) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(ev.data);
    };

    iframeEl.contentWindow.postMessage({
      type: "IFRAME_FETCH_REQ",
      payload: { url, init }
    }, targetOrigin, [channel.port2]);
  });
}



  let res = await iframeFetch(document.querySelector(`#${frame_id}`), "https://talkai.info/it/chat/send/", {
    method: 'POST',
    headers: {
      'accept': 'application/json, text/event-stream',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      type: 'chat',
      messagesHistory: [{ id: crypto.randomUUID(), from: 'you', content: prompt }],
      settings: { model: 'gpt-4.1-nano', temperature: 0.7 }
    })
  }, "*")
    
let parsed = parseSSE(res.body)
console.log('Result from iframe page-world:', res, parsed);
return parsed
}


const frame_id = 'myFrame__'

const OLLAMA_BASE = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2";
// const DEFAULT_MODEL = "gemma3:12b";

// Helper: safe model fallback
const pickModel = (m) => m ?? DEFAULT_MODEL;

// Optional: extract <answer>...</answer> for chat responses
function extractAnswerTag(text) {
  if (!text) return "";
  const start = text.indexOf("<answer>");
  const end = text.indexOf("</answer>");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start + 9, end).trim();
  }
  return text.trim();
}

/**
 * Simple completion call (/api/generate)
 */
async function askOllama(prompt, options = {}) {
  const payload = {
    model: pickModel(options.model),
    prompt,
    stream: options.stream ?? false,
    ...options,
  };

  try {
    const res = await apiExt(
      `${OLLAMA_BASE}/api/generate`,
      "POST",
      { "Content-Type": "application/json" },
      JSON.stringify(payload)
    );
    return res; // whatever your apiExt returns (likely parsed JSON)
  } catch (err) {
    console.error("Error calling Ollama /api/generate:", err);
    throw err;
  }
}

/**
 * Chat call (/api/chat) using apiExt, mirroring askOllama style
 * @param {{question: string, content: string}} chatInput
 * @param {object} options - same pattern as askOllama
 */
async function askOllamaChat(chatInput, options = {}) {
  const { question, content } = chatInput;

  const messages = [
    {
      role: "system",
      content: [
        // "You extract answers from the provided CONTENT only.",
        "You extract answers from the provided CONTENT.",
        // "Be concise: <= 100 characters.",
        // "If not found in CONTENT, reply: Not found.",
        // "If not found in CONTENT, reply: No results.",
        // "Output MUST be wrapped in <answer>...</answer> with nothing else."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        "### CONTENT START",
        content,
        "### CONTENT END",
        "",
        "### QUESTION",
        question
      ].join("\n")
    }
  ];

  const payload = {
    model: pickModel(options.model),
    stream: options.stream ?? false,
    options: {
      temperature: 0.2,
      num_ctx: 8192,
      stop: ["</answer>"],
      ...(options.options || {})
    },
    messages,
    ...options, // allow overriding top-level fields if you really want
  };

  try {
    const res = await apiExt(
      `${OLLAMA_BASE}/api/chat`,
      "POST",
      { "Content-Type": "application/json" },
      JSON.stringify(payload)
    );

    // If you want to directly return parsed text like askOllama does,
    // you can normalize here. Otherwise, return the raw `res`.
    // Uncomment to normalize:
    //
    // const contentTxt = res?.message?.content ?? "";
    // return { ...res, extracted: extractAnswerTag(contentTxt) };

    return res;
  } catch (err) {
    console.error("Error calling Ollama /api/chat:", err);
    throw err;
  }
}



function addIframe(url="https://talkai.info/chat/", width = "600", height = "400") {
  const iframe = document.createElement("iframe");
  iframe.id=frame_id
  iframe.src = url;
  iframe.width = width;
  iframe.height = height;
  iframe.style.border = "1px solid #ccc";
  iframe.style.display='none'
  document.body.appendChild(iframe);

  

  iframe.onload = function () {
    // const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    // // Example: change background
    // iframeDoc.body.style.backgroundColor = "lightyellow";
    // // Example: insert text
    // iframeDoc.body.innerHTML += "<p>Injected from parent page!</p>";
  };

}


addIframe();

// write here code that injects interface on html page with field for user prompt and a box for stream response from llm
(() => {

//   addIframe()
//   const askAI = askOllamaChat;
  const askAI = askTalkai;

  // ---------- UI Styles ----------
    // .agent-ui{position:fixed;right:16px;bottom:16px;z-index:999999;
    // width:min(520px,95vw);background:#111827;color:#e5e7eb;border:1px solid #1f2937;
    // border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);font:14px/1.4 system-ui;
    // user-select:none}
  const css = `
  .agent-ui{position:fixed;right:16px;bottom:16px;z-index:999999;
    width:min(520px,95vw);background:#111827dd;color:#e5e7eb;border:1px solid #1f2937;backdrop-filter:blur(7px);
    border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);font:14px/1.4 system-ui;
    user-select:none; resize: both; overflow: hidden; min-width: 250px; min-height: 180px}
  .agent-ui.dragging{opacity:.95}
  .agent-ui .hdr{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #1f2937;cursor:move}
  .agent-ui .title{font-weight:600}
  .agent-ui .body{padding:12px;display:flex;flex-direction:column;gap:10px; user-select:text;}
  .agent-ui textarea{width:initial;min-height:12px;height:60px;resize:vertical;background:#0b1220;color:#e5e7eb;border:1px solid #334155;border-radius:10px;padding:10px;outline:none; font-family: sans-serif}
  .agent-ui .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .agent-ui button{background:#2563eb;border:none;color:white;border-radius:10px;padding:10px 12px;font-weight:600;cursor:pointer; transition: box-shadow 0.15s ease-in-out}
  .agent-ui button:hover{background:#2563eb;filter: brightness(120%); box-shadow: 0 0 0 2px #6591f1}
  .agent-ui button:active{background:#2563eb;filter: brightness(80%); box-shadow: 0 0 0 1px #6591f1}
  .agent-ui button.ghost{background:transparent;color:#cbd5e1;border:1px solid #334155}
  .agent-ui pre{background:#0b1220;border:1px solid #334155;border-radius:10px;padding:12px;max-height:40vh;overflow:auto;white-space:pre-wrap;word-wrap:break-word; height: 100%; color: white}
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.body.appendChild(style);

  // const box = document.createElement('div');
  // box.className = 'agent-ui';
  // box.id = 'blower__';
  // box.style.display='none'
  // box.innerHTML = `
  //   <div class="hdr">
  //     <div class="title">Blower</div>
  //     <div style="margin-left:auto;display:flex;gap:6px">
  //       <button class="ghost" data-action="clear">Clear</button>
  //       <button class="ghost" data-action="close">✕</button>
  //     </div>
  //   </div>
  //   <div class="body">
  //     <div style="display:flex"></div>
  //     <textarea id="ask-box" placeholder="Ask me anything..."></textarea>
  //     <div class="row">
  //       <button data-action="start" style="width: 100%">Go</button>
  //     </div>
  //     <pre id="ai-output">🔎 Ready</pre>
  //   </div>
  // `;
  // document.body.appendChild(box);

  // ==================
function drawBox(){
  const box = document.createElement('div');
box.className = 'agent-ui';
box.id = 'blower__';
box.style.display = 'none';

// Header
const header = document.createElement('div');
header.className = 'hdr';

const title = document.createElement('div');
title.className = 'title';
title.textContent = 'Blower';

const headerRight = document.createElement('div');
headerRight.style.marginLeft = 'auto';
headerRight.style.display = 'flex';
headerRight.style.gap = '6px';

const clearBtn = document.createElement('button');
clearBtn.className = 'ghost';
clearBtn.dataset.action = 'clear';
clearBtn.textContent = 'Clear';

const closeBtn = document.createElement('button');
closeBtn.className = 'ghost';
closeBtn.dataset.action = 'close';
closeBtn.textContent = '✕';

headerRight.append(clearBtn, closeBtn);
header.append(title, headerRight);

// Body
const body = document.createElement('div');
body.className = 'body';

const flexDiv = document.createElement('div');
flexDiv.style.display = 'flex';

const textarea = document.createElement('textarea');
textarea.id = 'ask-box';
textarea.placeholder = 'Ask me anything...';

const row = document.createElement('div');
row.className = 'row';

const goBtn = document.createElement('button');
goBtn.dataset.action = 'start';
goBtn.style.width = '100%';
goBtn.textContent = 'Go';

row.appendChild(goBtn);

const output = document.createElement('pre');
output.id = 'ai-output';
output.textContent = '🔎 Ready';

// Put it all together
body.append(flexDiv, textarea, row, output);
box.append(header, body);
document.body.appendChild(box);
return box
}
let box=drawBox()


  // Restore saved position (if any)
  try {
    // const saved = JSON.parse(localStorage.getItem('agent-ui-pos') || '{}');
    const saved = {}
    if (typeof saved.left === 'number' && typeof saved.top === 'number') {
      box.style.left = saved.left + 'px';
      box.style.top  = saved.top  + 'px';
      box.style.right = 'auto';
      box.style.bottom = 'auto';
    }
    // const savedVis = localStorage.getItem('agent-ui-visible');
    const savedVis = 'hidden'
    if (savedVis === 'hidden') box.style.display = 'none';
  } catch {}

  // ---------- Helpers ----------
  const $ = (sel) => box.querySelector(sel);
  const textarea = $('textarea');
  const startBtn = $('[data-action="start"]');
  const clearBtn = $('[data-action="clear"]');
  const closeBtn = $('[data-action="close"]');
  const out = $('#ai-output');
  const header = box.querySelector('.hdr');

  // Drag state
  let dragging = false;
  let startX = 0, startY = 0;
  let boxStartLeft = 0, boxStartTop = 0;
  let usingLeftTop = false;

  const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

  function ensureLeftTopMode() {
    if (!usingLeftTop) {
      const r = box.getBoundingClientRect();
      box.style.left = r.left + 'px';
      box.style.top  = r.top  + 'px';
      box.style.right = 'auto';
      box.style.bottom = 'auto';
      usingLeftTop = true;
    }
  }

  function onPointerDown(clientX, clientY) {
    dragging = true;
    ensureLeftTopMode();
    const r = box.getBoundingClientRect();
    startX = clientX;
    startY = clientY;
    boxStartLeft = r.left;
    boxStartTop  = r.top;
    box.classList.add('dragging');
    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
  }

  function onPointerMove(clientX, clientY) {
    if (!dragging) return;
    const dx = clientX - startX;
    const dy = clientY - startY;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = box.getBoundingClientRect();
    const newLeft = clamp(boxStartLeft + dx, 6, vw - r.width - 6);
    const newTop  = clamp(boxStartTop  + dy,  6, vh - r.height - 6);

    box.style.left = newLeft + 'px';
    box.style.top  = newTop  + 'px';
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    box.classList.remove('dragging');
    document.body.style.userSelect = '';
    // persist position
    try {
      const r = box.getBoundingClientRect();
      // localStorage.setItem('agent-ui-pos', JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) }));
    } catch {}
  }

  // Mouse events
  header.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    onPointerDown(e.clientX, e.clientY);
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', onPointerUp);

  // Touch events
  header.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (!t) return;
    onPointerDown(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!t) return;
    onPointerMove(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchend', onPointerUp);

  // Keep box inside viewport on resize
  window.addEventListener('resize', () => {
    const r = box.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = clamp(r.left, 6, vw - r.width - 6);
    const top  = clamp(r.top,  6, vh - r.height - 6);
    box.style.left = left + 'px';
    box.style.top  = top  + 'px';
    box.style.right = 'auto';
    box.style.bottom = 'auto';
    usingLeftTop = true;
    try {
      // localStorage.setItem('agent-ui-pos', JSON.stringify({ left: Math.round(left), top: Math.round(top) }));
    } catch {}
  });

  // Toggle visibility with Ctrl+Shift+H (or Cmd+Shift+H on mac)
  function toggleBoxVisibility() {
    const hidden = box.style.display === 'none';
    box.style.display = hidden ? '' : 'none';
    try {
      // localStorage.setItem('agent-ui-visible', hidden ? 'shown' : 'hidden');
    } catch {}
    document.querySelector('#ask-box').focus()
  }
  document.addEventListener('keydown', (e) => {
    const isH = e.key && e.key.toLowerCase() === 'x';
    if (isH && e.shiftKey && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      toggleBoxVisibility();
    }
  });
function processPage() {
  // ---- 1) Clone the DOM so we never mutate the live page ----
  const domBody = document.body.cloneNode(true);
  const doc = document; // baseURI, title, metas come from the live doc

  // ---- 2) Drop obvious junk early (scripts, styles, embeds, tracking, etc.) ----
  const hardRemoveSelectors = [
    'script','noscript','style',
    // 'template',
    // 'link[rel="preload"]','link[rel="modulepreload"]',
    // 'iframe',
    'object','embed','svg','canvas',
    // 'form','button','select','input','textarea',
    'video','audio','picture','source',
    // common boilerplate / chrome
    'aside',
    // 'nav','footer','header',
  ].join(',');

  domBody.querySelectorAll(hardRemoveSelectors).forEach(el => el.remove());

    // Remove specific known elements
  const blower = domBody.querySelector('#blower__');
  if (blower) blower.remove();
  const fr = domBody.querySelector(`#${frame_id}`);
  if (fr) fr.remove();


  // ---- 3) Remove elements by role/semantics or nuisance-y id/class patterns ----
  const nuisanceRe = /(cookie|consent|gdpr|banner|promo|subscribe|signup|newsletter|metered|paywall|modal|dialog|overlay|popover|tooltip|share|social|related|recommend(ed|ations)?|breadcrumb|nav|sidebar|footer|header|ad(s|vert|vertisement)?|sponsor|tracking|beacon|outbrain|taboola)/i;
  domBody.querySelectorAll('[role], [id], [class]').forEach(el => {
    const role = el.getAttribute('role') || '';
    const id = el.id || '';
    const cls = el.className || '';
    if (
      /^(navigation|banner|complementary|contentinfo|search|dialog|alertdialog|menu|menubar|tablist|toolbar)$/i.test(role) ||
      nuisanceRe.test(id) ||
      nuisanceRe.test(String(cls))
    ) {
      el.remove();
    }
  });

  // ---- 4) Remove hidden/visually suppressed elements ----
  domBody.querySelectorAll('*').forEach(el => {
    const s = el.getAttribute('style') || '';
    if (
      el.hidden ||
      el.getAttribute('aria-hidden') === 'true' ||
      /\bdisplay\s*:\s*none\b/i.test(s) ||
      /\bvisibility\s*:\s*hidden\b/i.test(s) ||
      /\bopacity\s*:\s*0(\.0+)?\b/i.test(s)
    ) {
      el.remove();
    }
  });

  

  // ---- 5) Remove all HTML comments ----
  {
    const walker = document.createTreeWalker(domBody, NodeFilter.SHOW_COMMENT, null, false);
    const toRemove = [];
    while (walker.nextNode()) toRemove.push(walker.currentNode);
    toRemove.forEach(node => node.remove());
  }

  // ---- 6) Convert images to readable alt text (or drop if useless) ----
  domBody.querySelectorAll('img').forEach(img => {
    const alt = (img.getAttribute('alt') || '').trim();
    if (alt) {
      img.replaceWith(document.createTextNode(`[Image: ${alt}]`));
    } else {
      img.remove();
    }
  });

  

  // ---- 7) Expand links to include their (absolute) URLs next to the anchor text ----
  // domBody.querySelectorAll('a[href]').forEach(a => {
  //   const href = a.getAttribute('href');
  //   let abs = '';
  //   try { abs = new URL(href, doc.baseURI).href; } catch { /* ignore */ }
  //   const text = (a.textContent || '').trim();
  //   const label = text && abs ? `${text} (${abs})` : (abs || text);
  //   a.replaceWith(document.createTextNode(label || ''));
  // });

  // ---- 8) Light structural flattening: remove leftover UI chrome containers ----
  // (but keep their text content by unwrapping vs. outright removing)
  // const unwrapSelectors = ['section','article','main','div','span'];
  // domBody.querySelectorAll(unwrapSelectors.join(',')).forEach(el => {
  //   // unwrap shallow, but only if it has no obviously interactive/widgety descendants now
  //   if (!el.querySelector('button,select,input,textarea,video,audio,iframe,object,embed,svg,canvas')) {
  //     while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
  //     el.remove();
  //   }
  // });

  // ---- 9) Extract meaningful text with gentle block separation ----
  // Prefer text from common content blocks; fallback to full innerText.
  // const blocks = Array.from(domBody.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,code,table,thead,tbody,tfoot,tr,th,td,caption,span'))
  //   // .map(el => el.innerText.trim())
  //   .map(el => el.outerHTML)
  //   .filter(Boolean);
      function removeAllAttributesFromChildren(element) {
      if (!element || !element.children) return;

      for (let child of element.children) {
        // remove all attributes from this child
        while (child.attributes.length > 0) {
          child.removeAttribute(child.attributes[0].name);
        }
        // recurse into child’s children
        removeAllAttributesFromChildren(child);
      }
    }
  removeAllAttributesFromChildren(domBody);

  const blocks = Array.from(domBody.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,code,table,thead,tbody,tfoot,tr,th,td,caption,span'))
    // .map(el => el.innerText.trim())
    .map(el => el.outerHTML)
    .filter(Boolean);

  let bodyText = (blocks.length ? blocks.join('\n\n') : domBody.innerText || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

    function minifyHTML(elementOrString) {
  // If a DOM element was passed, serialize it to string
  let html = typeof elementOrString === "string" 
    ? elementOrString 
    : elementOrString.outerHTML;

  return html
    .replaceAll('&nbsp;',' ')
    .replace(/\s+/g, " ")       // collapse multiple spaces/newlines into one space
    .replace(/>\s+</g, ">\n<")    // remove whitespace between tags
    .trim();                    // trim leading/trailing space
}

bodyText=minifyHTML(bodyText)

    

  // ---- 10) Prepend page metadata (title, canonical URL, description) ----
  const title = (doc.querySelector('meta[property="og:title"]')?.content || doc.title || '').trim();
  const canonical = (doc.querySelector('link[rel="canonical"]')?.href || doc.baseURI || '').trim();
  const description = (doc.querySelector('meta[name="description"]')?.content ||
                       doc.querySelector('meta[property="og:description"]')?.content || '').trim();

  const headerLines = [];
  if (title) headerLines.push(`# ${title}`);
  if (canonical) headerLines.push(canonical);
  if (description) headerLines.push(`\n${description}`);
  const header = headerLines.join('\n');

  const finalText = [header, bodyText].filter(Boolean).join('\n\n').trim();

  return finalText;
}
console.log(processPage())
  // ---------- Core ----------
  async function runPrompt() {
    const prompt_ = textarea.value.trim();
    


    const content_ = processPage()
      // .split('\n')
      // .map(x => x.length > 100 ? null : x)
      // .filter(x => x)
      // .join(' ');
      console.log(content_)

    let prompt_old = `
      You are an assistant that extracts information from a webpage. Be short with the answer. Max 50 characters. 
      User question: "${prompt_}"  

      Webpage content:  
      ${content_}
    `;

    if (!prompt_) {
      textarea.focus();
      return;
    }
    out.textContent = '⏳ Thinking...';
    startBtn.disabled = true;
    textarea.disabled = true;


    let question = prompt_;
    let content = content_;

    try {
      const res = await askAI({ question, content });
      console.log(res,'res')
      out.textContent =
        typeof res === 'string'
          ? res
          : JSON.parse(res.body).message.content;
    } catch (err) {
      console.error(err);
      out.textContent = '❌ Error: ' + err.message;
    } finally {
      startBtn.disabled = false;
      textarea.disabled = false;
    }
  }

  // ---------- Events ----------
  startBtn.addEventListener('click', runPrompt);
  textarea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      runPrompt();
    }
  });
  clearBtn.addEventListener('click', () => { out.textContent = '🔎 Ready'; });
  closeBtn.addEventListener('click', () => { toggleBoxVisibility(); return; box.remove(); style.remove(); });
})();





function parseSSE(raw) {
    // What you’re dealing with is Server-Sent Events (SSE), where the server streams chunks prefixed with data:. You want to collect all those fragments until the termination marker event: trylimit.
  const lines = raw.split("\n");
  let output = [];

  for (let line of lines) {
    // line = line.trim();

    // stop when termination event is reached
    if (line.startsWith("event: trylimit")) {
      break;
    }

    // collect only 'data:' lines
    if (line.startsWith("data:")) {
      // const chunk = line.replace(/^data:\s*/, "");
      const chunk = line.replace(/^data: /, "");
      if (chunk) output.push(chunk);
    }
  }

  return output.join("").replaceAll('\\n','\n'); // merge into plain string
}

}