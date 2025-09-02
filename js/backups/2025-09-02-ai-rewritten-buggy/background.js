// background.js / service_worker.js (MV3)

const STORAGE_KEY = "SAR";

const DEFAULT_DATA = {
  power: true,
  scripts: [],
  options: { exclude: "" }
};

// ---------- Utility: promisified executeScript ----------
function execScript(options) {
  return chrome.scripting.executeScript(options)
    .then(results => results?.[0]?.result)
    .catch(err => ({ ok: false, where: options.world + "-exec", error: String(err) }));
}

// ---------- Utility: try sequence until one returns {ok:true} ----------
async function trySteps(steps) {
  for (const step of steps) {
    try {
      const res = await step();
      if (res && res.ok) return res;
    } catch (e) {
      // keep going
    }
  }
  return { ok: false, where: "all-attempts", error: "All injection attempts failed" };
}

// ---------- Injection attempts (each returns a function to call) ----------
function stepMainImportBlob(tabId, code, opts = {}) {
  return () => execScript({
    target: { tabId, allFrames: !!opts.allFrames },
    world: "MAIN",
    func: async (source) => {
      try {
        const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        try {
          await import(/* webpackIgnore: true */ url);
          return { ok: true, where: "MAIN-import-blob" };
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        return { ok: false, where: "MAIN-import-blob", error: String(e) };
      }
    },
    args: [code],
    injectImmediately: true
  });
}

function stepMainImportData(tabId, code, opts = {}) {
  return () => execScript({
    target: { tabId, allFrames: !!opts.allFrames },
    world: "MAIN",
    func: async (source) => {
      try {
        const dataUrl = "data:text/javascript;charset=utf-8," + encodeURIComponent(source);
        await import(/* webpackIgnore: true */ dataUrl);
        return { ok: true, where: "MAIN-import-data" };
      } catch (e) {
        return { ok: false, where: "MAIN-import-data", error: String(e) };
      }
    },
    args: [code],
    injectImmediately: true
  });
}

function stepMainInlineWithNonce(tabId, code, opts = {}) {
  return () => execScript({
    target: { tabId, allFrames: !!opts.allFrames },
    world: "MAIN",
    func: (source) => {
      try {
        const s = document.createElement("script");
        // Try to borrow a page nonce if present
        const withNonce = document.querySelector('script[nonce]');
        if (withNonce?.nonce) s.setAttribute("nonce", withNonce.nonce);

        // Avoid innerHTML; set textContent directly
        s.textContent = source;

        // Prefer module where allowed; classic still works if module is blocked
        s.type = "module";
        (document.head || document.documentElement || document.body).appendChild(s);
        s.remove();
        return { ok: true, where: "MAIN-inline-nonce" };
      } catch (e) {
        return { ok: false, where: "MAIN-inline-nonce", error: String(e) };
      }
    },
    args: [code],
    injectImmediately: true
  });
}

function stepMainExternalSrc(tabId, url, opts = {}) {
  return () => execScript({
    target: { tabId, allFrames: !!opts.allFrames },
    world: "MAIN",
    func: (srcUrl) => {
      return new Promise((resolve) => {
        try {
          const s = document.createElement("script");
          const withNonce = document.querySelector('script[nonce]');
          if (withNonce?.nonce) s.setAttribute("nonce", withNonce.nonce);
          s.src = srcUrl;
          s.async = true;
          s.crossOrigin = "anonymous";
          s.onload = () => { s.remove(); resolve({ ok: true, where: "MAIN-external-src" }); };
          s.onerror = (e) => { s.remove(); resolve({ ok: false, where: "MAIN-external-src", error: String(e?.message || e) }); };
          (document.head || document.documentElement || document.body).appendChild(s);
        } catch (e) {
          resolve({ ok: false, where: "MAIN-external-src", error: String(e) });
        }
      });
    },
    args: [url],
    injectImmediately: true
  });
}

function stepIsolatedImportBlob(tabId, code, opts = {}) {
  return () => execScript({
    target: { tabId, allFrames: !!opts.allFrames },
    world: "ISOLATED",
    func: async (source) => {
      try {
        const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        try {
          await import(/* webpackIgnore: true */ url);
          return { ok: true, where: "ISOLATED-import-blob" };
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        return { ok: false, where: "ISOLATED-import-blob", error: String(e) };
      }
    },
    args: [code],
    injectImmediately: true
  });
}

function stepIsolatedImportData(tabId, code, opts = {}) {
  return () => execScript({
    target: { tabId, allFrames: !!opts.allFrames },
    world: "ISOLATED",
    func: async (source) => {
      try {
        const dataUrl = "data:text/javascript;charset=utf-8," + encodeURIComponent(source);
        await import(/* webpackIgnore: true */ dataUrl);
        return { ok: true, where: "ISOLATED-import-data" };
      } catch (e) {
        return { ok: false, where: "ISOLATED-import-data", error: String(e) };
      }
    },
    args: [code],
    injectImmediately: true
  });
}

// ---------- Debugger fallback (opt-in; requires "debugger" permission) ----------
async function stepDebuggerEvaluate(tabId, code) {
  const debuggee = { tabId };
  try {
    await chrome.debugger.attach(debuggee, "1.3"); // protocol version
    const res = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
      expression: code,
      includeCommandLineAPI: true,
      awaitPromise: true,
      replMode: true,
      returnByValue: false
    });
    return { ok: true, where: "DEBUGGER-Runtime.evaluate", result: res?.result };
  } catch (e) {
    return { ok: false, where: "DEBUGGER-Runtime.evaluate", error: String(e) };
  } finally {
    try { await chrome.debugger.detach(debuggee); } catch (_) {}
  }
}

// ---------- Storage access ----------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.method !== "SARgetLocalStorage") return;
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    sendResponse({ data: res[STORAGE_KEY] || DEFAULT_DATA });
  });
  return true; // async
});

// ---------- Browser action popup ----------
chrome.action.onClicked.addListener(async () => {
  await chrome.action.setPopup({ popup: "popup.html" });
});

// ---------- Robust API request proxy ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "API_REQUEST_FROM_PAGE") return;

  // Default CORS; never "no-cors" (caller can override to "cors" or "same-origin")
  const init = {
    method: (msg.method || "GET").toUpperCase(),
    mode: msg.mode || "cors",
    credentials: msg.credentials ?? "omit",
    redirect: "follow"
  };

  // Sanitize headers (drop restricted/risky)
  const unsafe = new Set([
    "origin", "host", "referer", "cookie", "authorization",
    "user-agent", "accept-encoding", "connection", "content-length"
  ]);
  if (msg.headers && typeof msg.headers === "object") {
    init.headers = {};
    for (const [k, v] of Object.entries(msg.headers)) {
      if (!unsafe.has(k.toLowerCase())) init.headers[k] = v;
    }
  }

  if (msg.body && !["GET", "HEAD"].includes(init.method)) {
    init.body = msg.body;
  }

  fetch(msg.url, init)
    .then(async (res) => {
      const text = await res.text();
      const headersObj = Object.fromEntries(res.headers.entries());
      sendResponse({
        ok: res.ok,
        status: res.status,
        url: res.url,
        headers: headersObj,
        body: text
      });
    })
    .catch((err) => {
      sendResponse({ ok: false, error: err?.message || String(err) });
    });

  return true; // async
});

// ---------- Smart snippet/script injector ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // New unified entrypoint:
  // { method:"RUN_SMART_SNIPPET", code?:string, externalUrl?:string, preferMainWorld?:boolean, allFrames?:boolean, allowDebugger?:boolean }
  if (msg?.method !== "RUN_SMART_SNIPPET") return;

  const tabId = sender.tab?.id;
  if (!tabId) { sendResponse({ ok: false, error: "No tabId" }); return; }

  const code = String(msg.code || "");
  const externalUrl = msg.externalUrl && String(msg.externalUrl);
  const allFrames = !!msg.allFrames;
  const allowDebugger = !!msg.allowDebugger;

  (async () => {
    let sourceCode = code;

    // If externalUrl provided, fetch it once (from service worker) and treat it like a snippet.
    if (!sourceCode && externalUrl) {
      try {
        const resp = await fetch(externalUrl, { mode: "cors", credentials: "omit", redirect: "follow" });
        sourceCode = await resp.text();
      } catch (e) {
        // If we cannot fetch the source, we’ll try injecting as <script src> later.
        sourceCode = "";
      }
    }

    const steps = [];

    // 1) MAIN world: dynamic import of Blob (best general CSP bypass; no inline/eval)
    if (sourceCode) steps.push(stepMainImportBlob(tabId, sourceCode, { allFrames }));

    // 2) MAIN world: dynamic import of data: URL
    if (sourceCode) steps.push(stepMainImportData(tabId, sourceCode, { allFrames }));

    // 3) MAIN world: inline <script> with page nonce (works on nonce-based CSP)
    if (sourceCode) steps.push(stepMainInlineWithNonce(tabId, sourceCode, { allFrames }));

    // 4) MAIN world: external src (only when URL given and allowed by CSP)
    if (externalUrl) steps.push(stepMainExternalSrc(tabId, externalUrl, { allFrames }));

    // 5) ISOLATED world: dynamic imports (works regardless of page CSP; cannot touch page globals)
    if (sourceCode) {
      steps.push(stepIsolatedImportBlob(tabId, sourceCode, { allFrames }));
      steps.push(stepIsolatedImportData(tabId, sourceCode, { allFrames }));
    }

    // 6) Debugger fallback (opt-in; almost always works)
    if (allowDebugger && (sourceCode || externalUrl)) {
      const dbgEval = async () => {
        const codeToRun = sourceCode || `var s=document.createElement('script');s.src=${JSON.stringify(externalUrl)};document.documentElement.appendChild(s);`;
        return await stepDebuggerEvaluate(tabId, codeToRun);
      };
      steps.push(dbgEval);
    }

    const result = await trySteps(steps);
    sendResponse(result);
  })();

  return true; // async
});

// ---------- Back-compat handlers that route to "smart" injector ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  if (msg.method === "RUN_SNIPPET_VIA_SCRIPTING") {
    chrome.runtime.sendMessage({
      method: "RUN_SMART_SNIPPET",
      code: msg.code || "",
      preferMainWorld: !!msg.preferMainWorld,
      allFrames: !!msg.allFrames
    }, sendResponse);
    return true;
  }

  if (msg.method === "RUN_STRING_SNIPPET") {
    chrome.runtime.sendMessage({
      method: "RUN_SMART_SNIPPET",
      code: msg.code || "",
      allFrames: !!msg.allFrames
    }, sendResponse);
    return true;
  }
});

// ---------- Programmatic content scripts for frame bridge ----------
chrome.runtime.onInstalled.addListener(async () => {
  try {
    // MAIN-world bridge (already in your code)
    await chrome.scripting.registerContentScripts([{
      id: "frame-fetch-bridge",
      js: ["js/frame-bridge.js"],
      matches: ["<all_urls>"],
      allFrames: true,
      matchOriginAsFallback: true,
      world: "MAIN",
      runAt: "document_start"
    }]);

    // Optional: provide an ISOLATED bridge too if you need it later
    // await chrome.scripting.registerContentScripts([{
    //   id: "isolated-bridge",
    //   js: ["js/isolated-bridge.js"],
    //   matches: ["<all_urls>"],
    //   allFrames: true,
    //   matchOriginAsFallback: true,
    //   world: "ISOLATED",
    //   runAt: "document_start"
    // }]);
  } catch (e) {
    // ignore duplicate registration on update
  }
});
