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
