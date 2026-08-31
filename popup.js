const statusEl = document.getElementById("status");
const tsEl = document.getElementById("ts");
const paramsEl = document.getElementById("params");
const storeInput = document.getElementById("storeIdInput");
const addrInput = document.getElementById("addressIdInput");
const saveMsg = document.getElementById("saveMsg");

async function render() {
  const { lastStatus, lastCheckedAt, storeId, addressId, capturedAt } =
    await chrome.storage.local.get([
      "lastStatus", "lastCheckedAt", "storeId", "addressId", "capturedAt"
    ]);
  statusEl.textContent = lastStatus || "No checks yet.";
  tsEl.textContent = lastCheckedAt
    ? `Last checked: ${new Date(lastCheckedAt).toLocaleTimeString()}`
    : "";
  if (storeId && addressId) {
    paramsEl.textContent = `store ${storeId} · addr ${addressId.slice(0,8)}… (set ${new Date(capturedAt).toLocaleTimeString()})`;
  } else {
    paramsEl.textContent = "Not yet captured. Visit coles.com.au delivery page while logged in, or set manually below.";
  }
  if (document.activeElement !== storeInput) storeInput.value = storeId || "";
  if (document.activeElement !== addrInput) addrInput.value = addressId || "";
}

document.getElementById("check").addEventListener("click", () => {
  statusEl.textContent = "Checking…";
  chrome.runtime.sendMessage({ type: "check-now" }, () => setTimeout(render, 800));
});

document.getElementById("open").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.coles.com.au/checkout" });
});

document.getElementById("save").addEventListener("click", async () => {
  const storeId = storeInput.value.trim();
  const addressId = addrInput.value.trim();
  if (!storeId || !addressId) { saveMsg.textContent = "both required"; return; }
  await chrome.storage.local.set({ storeId, addressId, capturedAt: Date.now() });
  saveMsg.textContent = "saved";
  setTimeout(() => { saveMsg.textContent = ""; render(); }, 1000);
});

render();
setInterval(render, 2000);
