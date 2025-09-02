// js/frame-bridge.js  (MAIN world in every frame)
(() => {
  if (window.__iframeFetchServerInstalled) return;
  window.__iframeFetchServerInstalled = true;

  // Optional: tighten who can call us.
  // Example allowlist by origin; you can fetch it from chrome.storage if you prefer.
  const ALLOWED_PARENT_ORIGINS = new Set(["https://your-top-page.example.com", "*"]); // use "*" carefully

  window.addEventListener("message", async (ev) => {
    const data = ev.data;
    if (!data || data.type !== "IFRAME_FETCH_REQ") return;

    // Basic origin check (adjust for your needs)
    if (!ALLOWED_PARENT_ORIGINS.has("*") && !ALLOWED_PARENT_ORIGINS.has(ev.origin)) {
      // Ignore silently or reply with an error on the port if provided
      if (ev.ports && ev.ports[0]) ev.ports[0].postMessage({ ok: false, error: "origin not allowed" });
      return;
    }

    const port = ev.ports && ev.ports[0];
    const req = data.payload || {};
    const { url, init = {} } = req;

    try {
      // Run *inside the frame*, with cookies if same-origin to the frame:
      const resp = await fetch(url, {
        ...init,
        credentials: init.credentials ?? "include", // default include for your use case
        redirect: init.redirect ?? "follow"
      });

      // You can choose text/json/arrayBuffer — here we return text + headers
      const text = await resp.text();
      const headers = {};
      for (const [k, v] of resp.headers.entries()) headers[k] = v;

      port?.postMessage({
        ok: true,
        status: resp.status,
        statusText: resp.statusText,
        url: resp.url,
        headers,
        body: text
      });
    } catch (err) {
      port?.postMessage({ ok: false, error: String(err && err.message ? err.message : err) });
    }
  });

  // Optional: signal readiness to parent/owner
  window.postMessage({ type: "IFRAME_FETCH_READY" }, "*");
})();
