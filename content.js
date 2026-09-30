(async () => {
  if (globalThis.__simplifySamlRunning) return;
  globalThis.__simplifySamlRunning = true;

  try {
    const xmlString = extractXmlFromPage();
    const analysis = await globalThis.SimplifySamlParser.analyzeXmlString(xmlString);

    if (!analysis.ok) {
      const response = await chrome.runtime.sendMessage({
        type: "SAML_ANALYSIS_READY",
        payload: {
          kind: "unsupported",
          source_url: location.href,
          source_title: document.title || null,
          raw_xml: null,
          raw_xml_omitted: true,
          detected_document: analysis.detected_document || null,
          error: analysis.error || "This document is not SAML metadata.",
          hint: analysis.hint || "Open IdP/SP metadata containing <EntityDescriptor> or <EntitiesDescriptor>."
        }
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Unable to open Simplify SAML.");
      }
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "SAML_ANALYSIS_READY",
      payload: {
        kind: "metadata",
        source_url: location.href,
        source_title: document.title || null,
        raw_xml: xmlString,
        raw_xml_omitted: false,
        document_info: analysis.document_info,
        entities: analysis.entities
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unable to open metadata inspector.");
    }
  } catch (error) {
    console.error("Simplify SAML: inspection failed", error);
    alert(`Simplify SAML: ${error?.message || "Unable to inspect this page."}`);
  } finally {
    globalThis.__simplifySamlRunning = false;
  }

  function extractXmlFromPage() {
    try {
      const contentType = document.contentType || "";
      if (contentType.toLowerCase().includes("xml")) {
        return new XMLSerializer().serializeToString(document);
      }
    } catch (error) {
      console.warn("Simplify SAML: unable to inspect document content type", error);
    }

    const candidates = Array.from(document.querySelectorAll("pre, code"));
    for (const element of candidates) {
      const text = (element.textContent || "").trim();
      if (looksLikeSamlXml(text)) return text;
    }

    const bodyText = (document.body?.innerText || "").trim();
    if (looksLikeSamlXml(bodyText)) return bodyText;

    return new XMLSerializer().serializeToString(document);
  }

  function looksLikeSamlXml(text) {
    return [
      "<EntityDescriptor",
      "<EntitiesDescriptor",
      ":EntityDescriptor",
      ":EntitiesDescriptor",
      ":Response",
      ":AuthnRequest",
      ":LogoutRequest",
      ":LogoutResponse",
      "<Response",
      "<AuthnRequest",
      "<LogoutRequest",
      "<LogoutResponse"
    ].some((token) => text.includes(token));
  }
})();
