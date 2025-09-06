// background.js
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   var storageKey = 'SAR';
//   var data = localStorage.getItem(storageKey);
  
//   if (request.method === 'SARgetLocalStorage') {
//     if (data) {
//       sendResponse({data: JSON.parse(data)});
//     }
//   }
//   else {
//     sendResponse({data: {
//         power: true,
//         scripts: [],
//         options: {
//           exclude: ''
//         }
//       }
//     });
//   }
// });

const STORAGE_KEY = "SAR";

const DEFAULT_DATA = {
  power: true,
  scripts: [],
  options: { exclude: "" }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.method !== "SARgetLocalStorage") return;
  if (request.method === "SARgetLocalStorage") {
    // Read from chrome.storage.local
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      const data = res[STORAGE_KEY] || DEFAULT_DATA;
      // console.log(res, data)
      sendResponse({ data });
    });

    // IMPORTANT: return true to keep the message channel open for async response
    return true;
  }

  // Fallback/default response
  sendResponse({ data: DEFAULT_DATA });
});


// chrome.browserAction.onClicked.addListener((tab) => {
//   chrome.browserAction.setPopup({
//     'popup': 'popup.html'
//   });
// });

// background.js (MV3 service worker)
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.action.setPopup({
    popup: "popup.html"
  });
});


// service_worker.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // disabled
  return
  if (msg?.method !== "RUN_INLINE_SNIPPET" || !sender.tab?.id) return;

  const { code = "", preferMainWorld = true } = msg;

  // 1) Try page MAIN world without creating a <script> tag.
  //    We avoid eval() here; Chrome executes the provided function body as a script.
  const tryMain = preferMainWorld ? chrome.scripting.executeScript({
    target: { tabId: sender.tab.id },
    world: "MAIN",
    // We pass the code string as an arg and create a <script> element with text.
    // NOTE: This will be BLOCKED by strict CSP (no 'unsafe-inline'), but succeeds on permissive sites.
    args: [code],
    func: (source) => {
      try {
        const s = document.createElement("script");
        s.textContent = source;              // inline text
        (document.head || document.documentElement).appendChild(s);
        s.remove();
        return { ok: true, where: "MAIN-inline" };
      } catch (e) {
        return { ok: false, where: "MAIN-inline", error: String(e) };
      }
    }
  }) : Promise.reject(new Error("skip MAIN"));

  Promise.resolve(tryMain)
    .then(([res]) => sendResponse(res?.result ?? { ok: true, where: "MAIN-inline" }))
    .catch(() => {
      // 2) If MAIN inline failed (CSP), try MAIN world w/o inline: run as a function body.
      //    This avoids creating a <script> tag, but still needs eval/Function to run arbitrary strings.
      //    Many sites block unsafe-eval, so this may still fail.
      return chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: "MAIN",
        args: [code],
        func: (source) => {
          try {
            // Indirect eval = still subject to page's 'unsafe-eval' CSP.
            (0, eval)(source);
            return { ok: true, where: "MAIN-eval" };
          } catch (e) {
            return { ok: false, where: "MAIN-eval", error: String(e) };
          }
        }
      })
      .then(([res]) => res?.result)
      .catch(() => null);
    })
    .then((res) => {
      if (res?.ok) return sendResponse(res);

      // 3) Final fallback: run in ISOLATED world (content-script context).
      //    Page CSP doesn’t apply here, but you cannot touch page globals directly.
      return chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: "ISOLATED",
        args: [code],
        func: (source) => {
          try {
            // In isolated world, extension CSP may still block eval if not allowed in manifest.
            // If that's the case, you must NOT use eval and instead precompile to files.
            (0, eval)(source);
            return { ok: true, where: "ISOLATED-eval" };
          } catch (e) {
            return { ok: false, where: "ISOLATED-eval", error: String(e) };
          }
        }
      }).then(([r]) => sendResponse(r?.result ?? { ok: false, where: "ISOLATED-eval", error: "unknown" }))
        .catch(err => sendResponse({ ok: false, where: "ISOLATED-eval", error: String(err) }));
    });

  return true; // keep sendResponse async
});


// chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
//   if (msg.type === "API_REQUEST_FROM_PAGE") {
//     console.log(msg)
//     fetch(msg.url, {
//       method: msg.method || "GET",
//       headers: msg.headers || {},
//       body: msg.body || null,
//     })
//       .then(async (res) => {
//         console.log(res)
//         const text = await res.text(); // use text() to handle any type
//         sendResponse({
//           ok: res.ok,
//           status: res.status,
//           headers: Object.fromEntries(res.headers.entries()),
//           body: text,
//         });
//       })
//       .catch((err) => {
//         sendResponse({ error: err.message });
//       });
//     return true; // Keeps sendResponse async
//   }
// });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  
  if (msg.type !== "API_REQUEST_FROM_PAGE") return;
  console.log(msg,'API_REQUEST_FROM_PAGE')

  // 1) Build request init
  const init = {
    method: msg.method || "GET",
    // 2) Default to no credentials unless you absolutely need them
    credentials: msg.credentials ?? "omit",
    // 3) DO NOT set mode: "no-cors"
    mode: msg.mode || 'no-cors',
    redirect: "follow",
    headers: msg.headers
  };

  // // 4) Sanitize headers: drop restricted & risky ones
  // const unsafe = new Set([
  //   "origin", "host", "referer", "cookie", "authorization",
  //   "user-agent", "accept-encoding", "connection", "content-length"
  // ]);
  // if (msg.headers && typeof msg.headers === "object") {
  //   init.headers = {};
  //   for (const [k, v] of Object.entries(msg.headers)) {
  //     if (!unsafe.has(k.toLowerCase())) init.headers[k] = v;
  //   }
  // }

  // 5) Attach body only when allowed
  const m = (init.method || "GET").toUpperCase();
  if (msg.body && !["GET", "HEAD"].includes(m)) {
    init.body = msg.body;
    // init.body = "{\"model\":\"gpt-4o-mini\",\"metadata\":{\"toolChoice\":{\"NewsSearch\":false,\"VideosSearch\":false,\"LocalSearch\":false,\"WeatherForecast\":false}},\"messages\":[{\"role\":\"user\",\"content\":\"ciao\"},{\"role\":\"assistant\",\"content\":\"\",\"parts\":[{\"type\":\"text\",\"text\":\"Ciao! Come posso aiutarti oggi?\"}]},{\"role\":\"user\",\"content\":\"ciao\"},{\"role\":\"assistant\",\"content\":\"\",\"parts\":[{\"type\":\"text\",\"text\":\"Ciao di nuovo! Come va? Se hai domande o qualcosa di cui vuoi parlare, sono qui per aiutarti!\"}]},{\"role\":\"user\",\"content\":\"ciao\"},{\"role\":\"assistant\",\"content\":\"\",\"parts\":[{\"type\":\"text\",\"text\":\"Ciao! Sembra che tu stia salutando. Se hai qualcosa in mente di cui vuoi discutere o una domanda da fare, fammelo sapere!\"}]},{\"role\":\"user\",\"content\":\"aa\"},{\"role\":\"assistant\",\"content\":\"\",\"parts\":[{\"type\":\"text\",\"text\":\"Sembra che tu stia digitando qualcosa di veloce. Se hai bisogno di aiuto o vuoi condividere qualcosa, sentiti libero di farlo!\"}]},{\"role\":\"user\",\"content\":\"aa\"}],\"canUseTools\":true,\"canUseApproxLocation\":false}"
  }

  let ii = {
  "headers": {
    "accept": "text/event-stream",
    "accept-language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    "content-type": "application/json",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Not;A=Brand\";v=\"99\", \"Google Chrome\";v=\"139\", \"Chromium\";v=\"139\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-fe-signals": "eyJzdGFydCI6MTc1Njg1NTIzODAxOSwiZXZlbnRzIjpbXSwiZW5kIjo3NjIyNjB9",
    "x-fe-version": "serp_20250901_205406_ET-d5c1d30fb1f0d32e28b0",
    "x-vqd-hash-1": "eyJzZXJ2ZXJfaGFzaGVzIjpbIlN5WUxvbEVRWlRWbjc5RVhTdWtVSEZiUis1ZHZqM0NnK1FqeEZRVTNkS009IiwiemRmcVpsNHdkWW1vYi9GaWJTNmt6bE9maDBFRVNRbThtSjdUai9WUnFnUT0iLCI4VlZ6dmlGVzdGUHFYak05R3J2QkNBMUFHNSswZkJCei9ETVV3UDkzdC8wPSJdLCJjbGllbnRfaGFzaGVzIjpbInlIS3hwZGowaE1YamYrZStCMVA1ZE9VM0Vyb3RkZlpuWUNXRlltNlFFQjA9IiwiVGhKSWJEb1BqNkxhNUkyTnZPS2xMakRiZXNFVXJOcmZJMWZDaXM2R3dhST0iLCJhUUREek56OEJjOEZPTEVLSVhaVVdQVFZSNkJtMktCTGlBbnZ6ZkRjQk4wPSJdLCJzaWduYWxzIjp7fSwibWV0YSI6eyJ2IjoiNCIsImNoYWxsZW5nZV9pZCI6ImVhNTUzOWRjYjUxZTViMjEwMWM5NzFmMTFjYzQ2ZTUyMWJjZDBiZTY3MDI0NzM2NDdmODZiNzk4M2FmMTkxYjZ2ejk1biIsInRpbWVzdGFtcCI6IjE3NTY4NTUyMzkzMjUiLCJkZWJ1ZyI6IktLIiwib3JpZ2luIjoiaHR0cHM6Ly9kdWNrZHVja2dvLmNvbSIsInN0YWNrIjoiRXJyb3JcbmF0IGwgKGh0dHBzOi8vZHVja2R1Y2tnby5jb20vZGlzdC93cG0ubWFpbi4yNmU5MDVjOGZkOWM5MDFiYmJlYi5qczoxOjM2NDk5MClcbmF0IGFzeW5jIGh0dHBzOi8vZHVja2R1Y2tnby5jb20vZGlzdC93cG0ubWFpbi4yNmU5MDVjOGZkOWM5MDFiYmJlYi5qczoxOjM0MDYxNSIsImR1cmF0aW9uIjoiNCJ9fQ=="
  },
  "referrer": "https://duckduckgo.com/",
  "body": "{\"model\":\"gpt-4o-mini\",\"metadata\":{\"toolChoice\":{\"NewsSearch\":false,\"VideosSearch\":false,\"LocalSearch\":false,\"WeatherForecast\":false}},\"messages\":[{\"role\":\"user\",\"content\":\"ciao\"},{\"role\":\"assistant\",\"content\":\"\",\"parts\":[{\"type\":\"text\",\"text\":\"Ciao! Come posso aiutarti oggi?\"}]},{\"role\":\"user\",\"content\":\"ciao\"},{\"role\":\"assistant\",\"content\":\"\",\"parts\":[{\"type\":\"text\",\"text\":\"Ciao di nuovo! Come va? Se hai domande o qualcosa di cui vuoi parlare, sono qui per aiutarti!\"}]},{\"role\":\"user\",\"content\":\"ciao\"},{\"role\":\"assistant\",\"content\":\"\",\"parts\":[{\"type\":\"text\",\"text\":\"Ciao! Sembra che tu stia salutando. Se hai qualcosa in mente di cui vuoi discutere o una domanda da fare, fammelo sapere!\"}]},{\"role\":\"user\",\"content\":\"aa\"},{\"role\":\"assistant\",\"content\":\"\",\"parts\":[{\"type\":\"text\",\"text\":\"Sembra che tu stia digitando qualcosa di veloce. Se hai bisogno di aiuto o vuoi condividere qualcosa, sentiti libero di farlo!\"}]},{\"role\":\"user\",\"content\":\"aa\"}],\"canUseTools\":true,\"canUseApproxLocation\":false}",
  "method": "POST",
  "mode": "cors",
  "credentials": "omit"
}

  console.log(msg.url, init,'xxx')
  // 6) Perform the fetch from the background (extension) context
  fetch( msg.url, init)
    .then(async (res) => {
      const text = await res.text();
      // Convert headers to plain object
      const headersObj = {};
      for (const [k, v] of res.headers.entries()) headersObj[k] = v;
      console.log(res)
      sendResponse({
        ok: res.ok,
        status: res.status,
        url: res.url,
        headers: headersObj,
        body: text
      });
    })
    .then(d=>console.log(d,'yyy'))
    .catch((err) => {
      console.error(err)
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
    });

  return true; // keep sendResponse async
});



chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.method === "RUN_SNIPPET_VIA_SCRIPTING") {
    const tabId = sender.tab?.id;
    if (!tabId) return; // can't inject without a tab

    chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: msg.preferMainWorld ? "MAIN" : "ISOLATED",
      // Use a function wrapper; pass the code string as an arg
      func: (source) => {
        try {
          // eslint-disable-next-line no-new-func
          const fn = new Function(source);
          fn();
        } catch (e) {
          console.warn("[Ext] executeScript error:", e);
        }
      },
      args: [msg.code || ""],
      injectImmediately: true,
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  if (msg.method === "RUN_STRING_SNIPPET") {
    chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: "ISOLATED",                 // <-- important
      func: (source) => {
        try {
          // Eval inside the ISOLATED world is allowed (TT doesn't apply here)
          (0, eval)(source);
        } catch (e) {
          console.warn("[Ext] isolated eval error:", e);
        }
      },
      args: [msg.code || ""],
      injectImmediately: true,
    });
  }
});


// service_worker.js
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.scripting.registerContentScripts([{
    id: "frame-fetch-bridge",
    js: ["js/frame-bridge.js"],   // see section 2 below
    matches: ["<all_urls>"],
    allFrames: true,
    matchOriginAsFallback: true,  // covers about:blank/data: iframes
    world: "MAIN",                // critical: run in page world
    runAt: "document_start"
  }]);
});

