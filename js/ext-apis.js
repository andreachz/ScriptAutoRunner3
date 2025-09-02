// ext-apis.js
(function(){
// Send request to extension
function apiExt(url, method = "GET", headers = {}, body = null) {
  return new Promise((resolve) => {
    window.addEventListener("message", function handler(event) {
      if (event.source !== window) return;
      if (event.data.type === "API_RESPONSE_FROM_EXTENSION") {
        window.removeEventListener("message", handler);
        resolve(event.data.response);
      }
    });

    window.postMessage({
      type: "API_REQUEST_FROM_PAGE",
      url,
      method,
      headers,
      body,
    }, "*");
  });
}


window.apiExt = apiExt

})()