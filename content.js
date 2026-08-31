// Runs in coles.com.au pages. Watches fetch calls for the DeliverySlots
// graphql request and forwards its storeId + addressId to the background
// so the poller can reuse them.

(function () {
  // Inject page-context patch. content scripts run in isolated world,
  // so we need to hook window.fetch from the page itself.
  const script = document.createElement("script");
  script.textContent = `
    (function () {
      const origFetch = window.fetch;
      window.fetch = function (input, init) {
        try {
          const url = typeof input === "string" ? input : input.url;
          if (url && url.includes("/api/graphql") && init && init.body) {
            const body = typeof init.body === "string" ? init.body : null;
            if (body && body.includes("DeliverySlots")) {
              const parsed = JSON.parse(body);
              const v = parsed.variables || {};
              if (v.storeId && v.addressId) {
                window.postMessage({ __colesRapid: true, storeId: v.storeId, addressId: v.addressId }, "*");
              }
            }
          }
        } catch (e) { /* ignore */ }
        return origFetch.apply(this, arguments);
      };
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || !ev.data.__colesRapid) return;
    chrome.runtime.sendMessage({
      type: "captured-params",
      storeId: ev.data.storeId,
      addressId: ev.data.addressId
    });
  });
})();
