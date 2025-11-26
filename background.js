chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (e) {
    console.error("Simplify SAML: failed to execute content script", e);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "OPEN_SUMMARY_TAB") {
    chrome.tabs.create({ url: chrome.runtime.getURL("summary.html") });
  }
});
