const ALARM_NAME = "coles-rapid-check";
const CHECK_INTERVAL_MINUTES = 0.5;
const NOTIFICATION_ID = "coles-rapid-available";
const GRAPHQL_URL = "https://www.coles.com.au/api/graphql";
const APIM_KEY = "eae83861d1cd4de6bb9cd8a2cd6f041e";
const CHECKOUT_URL = "https://www.coles.com.au/checkout";

const QUERY = `
query DeliverySlots($addressId: ID!, $trolleyInfo: TrolleyInfoInput, $week: Week, $storeId: ID!, $channel: SlotsChannel!) {
  deliverySlots(addressId: $addressId, trolleyInfo: $trolleyInfo, week: $week, storeId: $storeId, channel: $channel) {
    results {
      dayOfWeek
      date
      windows {
        id
        isReserved
        windowTime
        reserveSlotMetadata { windowType }
      }
    }
    hasResults
  }
}`;

chrome.runtime.onInstalled.addListener(scheduleAlarm);
chrome.runtime.onStartup.addListener(scheduleAlarm);
function scheduleAlarm() {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
  setStatus("Installed. Waiting for storeId + addressId. Browse Coles delivery page once to capture them.");
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM_NAME) checkForRapidSlot(); });

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg?.type === "check-now") { checkForRapidSlot().then(() => sendResponse({ ok: true })); return true; }
  if (msg?.type === "captured-params") {
    chrome.storage.local.set({
      storeId: msg.storeId,
      addressId: msg.addressId,
      capturedAt: Date.now()
    });
    sendResponse?.({ ok: true });
    return true;
  }
});

chrome.notifications.onClicked.addListener((id) => {
  if (id === NOTIFICATION_ID) {
    chrome.tabs.create({ url: CHECKOUT_URL });
    chrome.notifications.clear(NOTIFICATION_ID);
  }
});

async function checkForRapidSlot() {
  const { storeId, addressId } = await chrome.storage.local.get(["storeId", "addressId"]);
  const now = new Date().toLocaleTimeString();

  if (!storeId || !addressId) {
    setStatus(`${now} — no storeId/addressId yet. Open Coles delivery page while logged in.`);
    return;
  }

  try {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "ocp-apim-subscription-key": APIM_KEY,
        "dsch-channel": "coles.online.1site.desktop",
        "Origin": "https://www.coles.com.au",
        "Referer": "https://www.coles.com.au/"
      },
      body: JSON.stringify({
        operationName: "DeliverySlots",
        query: QUERY,
        variables: {
          addressId, storeId,
          week: "CurrentWeek",
          channel: "Web",
          trolleyInfo: { totalItemCount: 1 }
        }
      })
    });

    if (!res.ok) { setStatus(`${now} — HTTP ${res.status}`); return; }
    const data = await res.json();
    const results = data?.data?.deliverySlots?.results || [];

    const rapid = [];
    for (const day of results) {
      for (const w of (day.windows || [])) {
        const wt = w?.reserveSlotMetadata?.windowType || "";
        if (/RAPID/i.test(wt) && !w.isReserved) {
          rapid.push(`${day.dayOfWeek} ${w.windowTime} [${wt}]`);
        }
      }
    }

    if (rapid.length) {
      setStatus(`${now} — RAPID AVAILABLE:\n${rapid.slice(0,5).join("\n")}`);
      notifyAvailable(rapid[0]);
    } else {
      setStatus(`${now} — no rapid (${results.reduce((n,d)=>n+(d.windows?.length||0),0)} windows scanned)`);
    }
  } catch (err) {
    setStatus(`${now} — error: ${err.message}`);
  }
}

function notifyAvailable(first) {
  chrome.notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: "images/icon-128.png",
    title: "Coles Rapid slot available",
    message: `${first}\nClick to open checkout.`,
    priority: 2
  });
}

function setStatus(text) {
  chrome.storage.local.set({ lastStatus: text, lastCheckedAt: Date.now() });
}
