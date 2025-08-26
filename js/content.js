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

    if (script.type === "snippet") {
      // Try MAIN world (page context) first, then isolated world.
      chrome.runtime.sendMessage({
        method: "RUN_INLINE_SNIPPET",
        code: script.code ?? "",
        preferMainWorld: true
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
