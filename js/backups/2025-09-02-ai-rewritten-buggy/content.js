// content.js

window.addEventListener('securitypolicyviolation', e => {
  console.warn('[Ext] CSP violation:', e.blockedURI, e.violatedDirective, e.originalPolicy);
});
window.addEventListener('error', e => {
  // surface syntax/runtime errors that happen during script load
  console.warn('[Ext] window error during blob load:', e.message, e.filename, e.lineno, e.colno);
});

chrome.runtime.sendMessage({ method: "SARgetLocalStorage" }, async (response) => {
  const data = response?.data;
  if (!data || !Array.isArray(data.scripts)) return;
  
  if (!data.power){return}
  
  const hostname = location.hostname;
  const matchList = (pattern) => {
    if (!pattern || pattern === "any") return true;
    return pattern.split(",").map(s => s.trim()).filter(Boolean)
      .some(p => hostname.includes(p));
  };
  const isExcluded = (pattern) => {
    if (!pattern) return false;
    return pattern.split(",").map(s => s.trim()).filter(Boolean)
      .some(p => hostname.includes(p));
  };

  if (data.options?.exclude && isExcluded(data.options.exclude)) return;

  for (const script of data.scripts) {
    if (!script?.enable) continue;
    if (!matchList(script.host)) continue;

    if (script.type === "external" && script.src) {
      // Only works if the site's CSP allows that origin.
      chrome.runtime.sendMessage({ method: "RUN_SMART_SNIPPET", externalUrl: script.src }, console.log);

      continue;
    }
    if (script.type === "external" && script.src) {
      // Only works if the site's CSP allows that origin.
      injectExternal(script.src);
      continue;
    }

    function injectBlobSnippet(source) {
      try {
        const looksModule =
          /^\s*import\s/m.test(source) ||
          /^\s*export\s/m.test(source) ||
          /\bawait\b/.test(source) && !/function\s*\*/.test(source) 
          || true;

        const blob = new Blob([source], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);

        const s = document.createElement("script");
        if (looksModule) s.type = "module";

        // If the page uses a nonce, copy it (helps on stricter CSPs).
        const pageNonce = document.querySelector('script[nonce]')?.nonce;
        if (pageNonce) s.setAttribute("nonce", pageNonce);

        s.src = url;
        s.async = false;

        s.addEventListener("load", () => {
          queueMicrotask(() => { s.remove(); URL.revokeObjectURL(url); });
        });
        s.addEventListener("error", (e) => {
          console.warn("[Ext] Blob script failed", e);
          s.remove(); URL.revokeObjectURL(url);
        });

        (document.head || document.documentElement).appendChild(s);
      } catch (e) {
        console.warn("[Ext] Blob injection error:", e);
      }
    }



    

    if (script.type === "snippet") {
        chrome.runtime.sendMessage({ method: "RUN_SMART_SNIPPET", code: script.code ?? "" }, console.log);
        continue
    }
    if (script.type === "snippet") {
      injectBlobSnippet(script.code ?? "")
      // continue
      // Try MAIN world (page context) first, then isolated world.
      chrome.runtime.sendMessage({
        method: "RUN_INLINE_SNIPPET",
        code: script.code ?? "",
        preferMainWorld: true,
      });
      continue;
    }

//     if (script.type === "snippet") {
//   chrome.runtime.sendMessage({
//     method: "RUN_SNIPPET_VIA_SCRIPTING",
//     code: script.code ?? "",
//     preferMainWorld: true,
//   });
//   continue;
// }

// if (script.type === "snippet") {
//   chrome.runtime.sendMessage({
//     method: "RUN_STRING_SNIPPET",
//     code: script.code ?? "",
//     // MAIN is not safe for strings on TT pages
//   });
//   continue;
// }

    if (script.type === "file" && script.path) {
      // Always CSP-safe.
      injectExtensionFile(script.path);
    }
  }

  function injectExternal(url) {
    const el = document.createElement("script");
    el.src = url;
    el.async = false;
    (document.head || document.documentElement).appendChild(el);
    el.addEventListener("load", () => el.remove());
    el.addEventListener("error", () => { console.warn("[Ext] External load failed:", url); el.remove(); });
  }

  function injectExtensionFile(pathFromRoot) {
    const el = document.createElement("script");
    el.src = chrome.runtime.getURL(pathFromRoot);
    el.async = false;
    (document.head || document.documentElement).appendChild(el);
    el.addEventListener("load", () => el.remove());
    el.addEventListener("error", () => { console.warn("[Ext] File load failed:", pathFromRoot); el.remove(); });
  }
});


// for ext-apis.js

// Listen for messages from page
window.addEventListener("message", (event) => {
  // if (event.source !== window) return;
  if (event.data.type === "API_REQUEST_FROM_PAGE") {
    chrome.runtime.sendMessage(event.data, (response) => {
      // Send response back to page
      window.postMessage({
        type: "API_RESPONSE_FROM_EXTENSION",
        response,
      }, "*");
    });
  }
});

(function (){
    // 1) Inject page-bridge so the page can call our API easily
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("js/ext-apis.js");
    (document.head || document.documentElement).appendChild(s);
    s.onload = () => s.remove();
  } catch {}

})()





