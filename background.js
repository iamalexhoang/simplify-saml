const ANALYSIS_PREFIX = "analysis:";
const MAX_ANALYSIS_AGE_MS = 4 * 60 * 60 * 1000;

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["parser.js", "content.js"]
    });
  } catch (error) {
    console.error("Simplify SAML: unable to inspect the current tab", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "SAML_ANALYSIS_READY") return false;

  (async () => {
    try {
      await pruneOldAnalyses();

      const analysisId = createAnalysisId();
      const key = ANALYSIS_PREFIX + analysisId;
      const payload = {
        ...message.payload,
        created_at: new Date().toISOString(),
        source_tab_id: sender.tab?.id ?? null
      };

      try {
        await chrome.storage.session.set({ [key]: payload });
      } catch (error) {
        // Very large federation metadata can exceed session-storage quota.
        // Preserve the parsed inspection result and omit only the raw XML.
        const reduced = {
          ...payload,
          raw_xml: null,
          raw_xml_omitted: true
        };
        await chrome.storage.session.set({ [key]: reduced });
      }

      const url = chrome.runtime.getURL(
        `summary.html?id=${encodeURIComponent(analysisId)}`
      );
      await chrome.tabs.create({ url });
      sendResponse({ ok: true, id: analysisId });
    } catch (error) {
      console.error("Simplify SAML: failed to save analysis", error);
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();

  return true;
});

function createAnalysisId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function pruneOldAnalyses() {
  const all = await chrome.storage.session.get(null);
  const now = Date.now();
  const staleKeys = [];

  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(ANALYSIS_PREFIX)) continue;
    const created = Date.parse(value?.created_at || "");
    if (!Number.isFinite(created) || now - created > MAX_ANALYSIS_AGE_MS) {
      staleKeys.push(key);
    }
  }

  if (staleKeys.length) {
    await chrome.storage.session.remove(staleKeys);
  }
}
