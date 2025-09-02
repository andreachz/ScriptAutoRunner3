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



// for page-bridge.js iframe-page-fetcher.js
// (function () {
//   const isTop = (window.top === window);

//   // Map: selector -> MessagePort (in the TOP frame only)
//   const channelMap = new Map();

//   // ---- Common: listen for "bridge port" connections (iframe role) ----
//   // The parent/top will postMessage to the iframe with a MessagePort.
//   window.addEventListener("message", (event) => {
//     const data = event.data;
//     if (!data || data._bridge !== "IFRAME_PORT_INIT") return;
    
//     // SECURITY: optionally check event.origin / token if you want stricter control
//     const [bridgePort] = event.ports || [];
//     if (!bridgePort) return;

    

//     // ===== IFRAME ROLE: add PAGE-WORLD FETCHER bridge =====
//     // 1) Inject the page-world fetcher into THIS iframe so fetch runs with first-party cookies
//     let pfPort = null;
//     let pfReady = false;
//     const pfQueue = []; // queue PF_REQ messages until page fetcher signals ready

//     try {
//       const s = document.createElement("script");
//       // NOTE: adjust path if you keep assets elsewhere
//       s.src = chrome.runtime.getURL("js/iframe-page-fetcher.js");
//       (document.head || document.documentElement).appendChild(s);
//       s.onload = () => s.remove();
//     } catch(e) {console.log(e)}

//     console.log(data,'iiix2')

//     // 2) Create a MessageChannel to talk to the page-world fetcher
//     const ch = new MessageChannel();
//     pfPort = ch.port1;

//     pfPort.onmessage = (e) => {
//       const msg = e.data;
//       if (msg && msg._kind === "PF_READY") {
//         pfReady = true;
//         console.log(data,'iiix6')
//         // flush anything queued before the fetcher was ready
//         while (pfQueue.length) pfPort.postMessage(pfQueue.shift());
//       } else if (msg && msg._kind === "PF_RES") {
//         console.log(data,'iiix7')
//         // forward PF result back to TOP via the main bridge
//         bridgePort.postMessage({
//           _kind: "EXTAPI_RESULT",
//           callId: msg.id,           // round-trip the original callId
//           resp: msg                 // { ok, status, headers, body, ... }
//         });
//       }
//     };
//     pfPort.start();

//     // 3) Handshake to page-world with the other end of the port
//     //    The injected iframe-page-fetcher.js listens for this and attaches to the port.
//     console.log('wa')
//     window.postMessage({ _bridge: "PAGE_FETCHER_PORT_INIT" }, "*", [ch.port2]);
//     // Window.prototype.postMessage.call(window, { _bridge: "PAGE_FETCHER_PORT_INIT" }, "*", [ch.port2]);

//     // ===== IFRAME ROLE: bridge port <-> background, with special 'pageFetch' path =====
//     bridgePort.onmessage = async (e) => {
          
//       const req = e.data;
//       if (!req || req._kind !== "EXTAPI_CALL") return;

//       const { callId, action, payload } = req;

//       // Special path: run fetch INSIDE the iframe page world (first-party cookies/CSRF)
//       if (action === "pageFetch") {
        
//         const pfMsg = {
//           _kind: "PF_REQ",
//           id: callId,
//           url: payload?.url,
//           init: payload?.init || {},
//           responseType: payload?.responseType || "text"
//         };
//         console.log(data,'iiix3')
//         if (pfReady) {
//           console.log(data,'iiix4')
//           pfPort.postMessage(pfMsg);
//         } else {
//           pfQueue.push(pfMsg);
//           console.log(data,'iiix5')
//         }
//         return;
//       }

//       // Default path: relay to background service worker (classic ext API dispatch)
//       chrome.runtime.sendMessage(
//         { _kind: "EXTAPI_DISPATCH", action, ...payload },
//         (resp) => {
//           // Return the response to the top frame via the port
//           bridgePort.postMessage({ _kind: "EXTAPI_RESULT", callId, resp });
//         }
//       );
//     };

//     bridgePort.start();
//   });

//   if (!isTop) {
//     // In iframes we only need the role above; return here
//     return;
//   }

//   // ---- TOP FRAME ROLE ----

//   // 1) Inject page-bridge so the page can call our API easily
//   try {
//     const s = document.createElement("script");
//     s.src = chrome.runtime.getURL("js/page-bridge.js");
//     (document.head || document.documentElement).appendChild(s);
//     s.onload = () => s.remove();
//   } catch {}

//   // 2) Handle page requests (grant access + extApi calls)
//   window.addEventListener("message", async (event) => {
//     if (event.source !== window) return;
//     const data = event.data;

//     // Page asks to GRANT access to a specific iframe
//     if (data && data._kind === "GRANT_IFRAME_ACCESS") {
//       const { selector, token } = data;

//       try {
//         const iframe = document.querySelector(selector);
//         if (!iframe || !(iframe instanceof HTMLIFrameElement)) {
//           window.postMessage({ _kind: "GRANT_IFRAME_ACCESS_RESULT", selector, ok: false, error: "iframe not found" }, "*");
//           return;
//         }

//         // OPTIONAL: enforce user confirmation/allowlist, check iframe.src, etc.

//         // Create a dedicated channel
//         const channel = new MessageChannel();
//         channelMap.set(selector, channel.port1);

//         // Deliver the other port to the iframe with a handshake token
//         iframe.contentWindow.postMessage(
//           { _bridge: "IFRAME_PORT_INIT", token, from: "top" },
//           "*",                       // TODO: restrict by origin if you know it
//           [channel.port2]
//         );

//         // Start listening on port1 to forward results back to the page
//         channel.port1.onmessage = (e) => {
//           // Just bounce to the page; page distinguishes by callId
//           window.postMessage({ _kind: "IFRAME_BRIDGE_RESULT", selector, data: e.data }, "*");
//         };
//         channel.port1.start();

//         window.postMessage({ _kind: "GRANT_IFRAME_ACCESS_RESULT", selector, ok: true }, "*");
//       } catch (err) {
//         window.postMessage({
//           _kind: "GRANT_IFRAME_ACCESS_RESULT",
//           selector,
//           ok: false,
//           error: err?.message || String(err)
//         }, "*");
//       }
//     }

//     // Page wants to CALL extApi through a given iframe
//     if (data && data._kind === "EXTAPI_CALL_VIA_IFRAME") {
//       const { selector, callId, action, payload } = data;
//       const port = channelMap.get(selector);
//       if (!port) {
//         window.postMessage({
//           _kind: "IFRAME_BRIDGE_RESULT",
//           selector,
//           data: { _kind: "EXTAPI_RESULT", callId, resp: { ok: false, error: "No channel for selector. Did you GRANT access?" } }
//         }, "*");
//         return;
//       }
//       // Forward to the iframe content script; it decides background vs pageFetch
//       port.postMessage({ _kind: "EXTAPI_CALL", callId, action, payload });
//     }
//   });
// })();



