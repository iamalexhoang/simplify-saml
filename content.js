(() => {
  console.log("Simplify SAML: content script running");

  const SAML_NS = "urn:oasis:names:tc:SAML:2.0:metadata";
  const DS_NS = "http://www.w3.org/2000/09/xmldsig#";

  function parseXmlString(str) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(str, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) {
      return null;
    }
    return doc;
  }

  function extractXmlFromPage() {
    // 1) If the page itself is XML
    try {
      const ct = document.contentType || "";
      if (ct.includes("xml")) {
        return new XMLSerializer().serializeToString(document);
      }
    } catch (e) {
      console.warn("Simplify SAML: unable to read document.contentType", e);
    }

    // 2) Look for <pre> or <code> blocks that contain EntityDescriptor
    const candidates = Array.from(document.querySelectorAll("pre, code"));
    for (const el of candidates) {
      const text = el.textContent || "";
      if (text.includes("<EntityDescriptor")) {
        return text.trim();
      }
    }

    // 3) Fallback: serialize the whole document
    return new XMLSerializer().serializeToString(document);
  }

  function getFirstNsOrAny(root, ns, localName) {
    return (
      root.getElementsByTagNameNS(ns, localName)[0] ||
      root.getElementsByTagName(localName)[0] ||
      null
    );
  }

  function collectEndpoints(descriptor, localName) {
    const urls = new Set();
    if (!descriptor) return [];

    const list = [
      ...descriptor.getElementsByTagNameNS(SAML_NS, localName),
      ...descriptor.getElementsByTagName(localName)
    ];

    const HTTP_POST = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";

    for (const node of list) {
      const binding = node.getAttribute("Binding") || "";
      if (binding !== HTTP_POST) continue;

      const loc =
        node.getAttribute("Location") ||
        node.getAttribute("ResponseLocation") ||
        "";
      if (loc) urls.add(loc);
    }

    return [...urls];
  }

  function collectNameIDFormats(root) {
    const formats = new Set();
    const list = [
      ...root.getElementsByTagNameNS(SAML_NS, "NameIDFormat"),
      ...root.getElementsByTagName("NameIDFormat")
    ];

    for (const node of list) {
      const v = (node.textContent || "").trim();
      if (v) formats.add(v);
    }
    return [...formats];
  }

  function collectCertificates(root) {
    const certs = new Set();
    const list = [
      ...root.getElementsByTagNameNS(DS_NS, "X509Certificate"),
      ...root.getElementsByTagName("X509Certificate")
    ];

    for (const node of list) {
      const v = (node.textContent || "").replace(/\s+/g, "");
      if (v) certs.add(v);
    }
    return [...certs];
  }

  try {
    const xmlString = extractXmlFromPage();
    const xmlDoc = parseXmlString(xmlString);

    if (!xmlDoc) {
      alert("Simplify SAML: could not parse this page as XML.");
      return;
    }

    const entity =
      xmlDoc.getElementsByTagNameNS(SAML_NS, "EntityDescriptor")[0] ||
      xmlDoc.getElementsByTagName("EntityDescriptor")[0];

    if (!entity) {
      alert("Simplify SAML: no <EntityDescriptor> found on this page.");
      return;
    }

    const idpDescriptor = getFirstNsOrAny(entity, SAML_NS, "IDPSSODescriptor");
    const spDescriptor  = getFirstNsOrAny(entity, SAML_NS, "SPSSODescriptor");

    let type = "unknown";
    if (idpDescriptor && spDescriptor) type = "both";
    else if (idpDescriptor) type = "idp";
    else if (spDescriptor) type = "sp";

    const entityId = entity.getAttribute("entityID") || "";

    const acs_urls = collectEndpoints(spDescriptor, "AssertionConsumerService");
    const sso_urls = collectEndpoints(idpDescriptor, "SingleSignOnService");

    const slo_all = [
      ...collectEndpoints(spDescriptor, "SingleLogoutService"),
      ...collectEndpoints(idpDescriptor, "SingleLogoutService")
    ];
    const slo_urls = [...new Set(slo_all)];

    const nameid_formats = collectNameIDFormats(entity);
    const certificates = collectCertificates(entity);

    const sigNodes = [
      ...xmlDoc.getElementsByTagNameNS(DS_NS, "Signature"),
      ...xmlDoc.getElementsByTagName("Signature")
    ];
    const is_signed = sigNodes.length > 0;

    const sigMethod =
      xmlDoc.getElementsByTagNameNS(DS_NS, "SignatureMethod")[0] ||
      xmlDoc.getElementsByTagName("SignatureMethod")[0];
    const signature_algorithm = sigMethod
      ? sigMethod.getAttribute("Algorithm") || null
      : null;

    const result = {
      type,
      entity_id: entityId,
      acs_urls,
      sso_urls,
      slo_urls,
      nameid_formats,
      certificates,
      is_signed,
      signature_algorithm
    };

    chrome.storage.local.set({ saml_data: result, raw_xml: xmlString }, () => {
      chrome.runtime.sendMessage({ type: "OPEN_SUMMARY_TAB" });
    });
  } catch (err) {
    console.error("Simplify SAML content script error", err);
    alert("Simplify SAML: error while reading SAML metadata (see console).");
  }
})();
