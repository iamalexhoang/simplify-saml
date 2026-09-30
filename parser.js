(() => {
  if (globalThis.SimplifySamlParser) return;

  const SAML_NS = "urn:oasis:names:tc:SAML:2.0:metadata";
  const DS_NS = "http://www.w3.org/2000/09/xmldsig#";

  const BINDING_LABELS = {
    "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST": "HTTP-POST",
    "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect": "HTTP-Redirect",
    "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Artifact": "HTTP-Artifact",
    "urn:oasis:names:tc:SAML:2.0:bindings:SOAP": "SOAP",
    "urn:oasis:names:tc:SAML:2.0:bindings:PAOS": "PAOS",
    "urn:oasis:names:tc:SAML:2.0:bindings:URI": "URI"
  };

  const OID_LABELS = {
    "2.5.4.3": "CN",
    "2.5.4.6": "C",
    "2.5.4.7": "L",
    "2.5.4.8": "ST",
    "2.5.4.10": "O",
    "2.5.4.11": "OU",
    "1.2.840.113549.1.9.1": "emailAddress"
  };

  function parseXmlString(str) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(str, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) return null;
    return doc;
  }

  function elementsByName(root, namespace, localName) {
    const found = [];
    const seen = new Set();

    for (const node of root.getElementsByTagNameNS(namespace, localName)) {
      if (!seen.has(node)) {
        seen.add(node);
        found.push(node);
      }
    }

    for (const node of root.getElementsByTagName(localName)) {
      if (!seen.has(node)) {
        seen.add(node);
        found.push(node);
      }
    }

    return found;
  }

  function firstByName(root, namespace, localName) {
    return elementsByName(root, namespace, localName)[0] || null;
  }

  function parseBooleanAttribute(node, name) {
    if (!node?.hasAttribute(name)) return null;
    const value = (node.getAttribute(name) || "").toLowerCase();
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    return null;
  }

  function collectEndpoints(descriptor, localName) {
    if (!descriptor) return [];

    const items = [];
    const seen = new Set();

    for (const node of elementsByName(descriptor, SAML_NS, localName)) {
      const binding = node.getAttribute("Binding") || "";
      const location = node.getAttribute("Location") || "";
      const responseLocation = node.getAttribute("ResponseLocation") || "";
      const indexRaw = node.getAttribute("index");
      const index = indexRaw !== null && indexRaw !== "" && Number.isFinite(Number(indexRaw))
        ? Number(indexRaw)
        : null;
      const isDefault = parseBooleanAttribute(node, "isDefault");

      if (!location && !responseLocation) continue;

      const key = [binding, location, responseLocation, indexRaw || "", String(isDefault)].join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        binding,
        binding_label: BINDING_LABELS[binding] || shortenUri(binding) || "Unspecified",
        location,
        response_location: responseLocation,
        index,
        is_default: isDefault
      });
    }

    return items;
  }

  function collectNameIdFormats(entity) {
    const values = new Set();
    for (const node of elementsByName(entity, SAML_NS, "NameIDFormat")) {
      const value = (node.textContent || "").trim();
      if (value) values.add(value);
    }
    return [...values];
  }

  function collectOrganization(entity) {
    const text = (localName) => {
      const node = firstByName(entity, SAML_NS, localName);
      const value = (node?.textContent || "").trim();
      return value || null;
    };

    return {
      display_name: text("OrganizationDisplayName"),
      name: text("OrganizationName"),
      url: text("OrganizationURL")
    };
  }

  function metadataContextForEntity(entity) {
    const chain = [];
    let current = entity;

    while (current && current.nodeType === 1) {
      const localName = current.localName || current.nodeName || "";
      if (current.namespaceURI === SAML_NS && (localName === "EntityDescriptor" || localName === "EntitiesDescriptor")) {
        chain.unshift(current);
      }
      current = current.parentElement;
    }

    const validUntilCandidates = chain
      .map((node) => ({
        value: node.getAttribute("validUntil") || null,
        kind: (node.localName || node.nodeName) === "EntityDescriptor" ? "entity" : "collection",
        name: node.getAttribute("Name") || null
      }))
      .filter((item) => item.value);

    let effectiveValidUntil = null;
    let effectiveValidUntilSource = null;
    for (const candidate of validUntilCandidates) {
      const time = Date.parse(candidate.value);
      if (!Number.isFinite(time)) continue;
      if (!effectiveValidUntil || time < effectiveValidUntil.time) {
        effectiveValidUntil = { time, value: candidate.value };
        effectiveValidUntilSource = candidate;
      }
    }

    if (!effectiveValidUntil && validUntilCandidates.length) {
      const fallback = validUntilCandidates[0];
      effectiveValidUntil = { time: null, value: fallback.value };
      effectiveValidUntilSource = fallback;
    }

    const cacheCandidates = chain
      .map((node) => ({
        value: node.getAttribute("cacheDuration") || null,
        kind: (node.localName || node.nodeName) === "EntityDescriptor" ? "entity" : "collection",
        name: node.getAttribute("Name") || null
      }))
      .filter((item) => item.value)
      .map((item) => ({ ...item, milliseconds: durationToMilliseconds(item.value) }));

    let effectiveCacheDuration = null;
    let effectiveCacheDurationSource = null;
    for (const candidate of cacheCandidates) {
      if (!Number.isFinite(candidate.milliseconds)) continue;
      if (!effectiveCacheDuration || candidate.milliseconds < effectiveCacheDuration.milliseconds) {
        effectiveCacheDuration = candidate;
        effectiveCacheDurationSource = candidate;
      }
    }

    if (!effectiveCacheDuration && cacheCandidates.length) {
      // If a duration cannot be compared safely, prefer the outermost policy rather
      // than silently allowing a child to extend it.
      effectiveCacheDuration = cacheCandidates[0];
      effectiveCacheDurationSource = cacheCandidates[0];
    }

    const collectionPath = chain
      .filter((node) => (node.localName || node.nodeName) === "EntitiesDescriptor")
      .map((node) => node.getAttribute("Name") || null)
      .filter(Boolean);

    return {
      declared_valid_until: entity.getAttribute("validUntil") || null,
      declared_cache_duration: entity.getAttribute("cacheDuration") || null,
      valid_until: effectiveValidUntil?.value || null,
      cache_duration: effectiveCacheDuration?.value || null,
      valid_until_source: effectiveValidUntilSource,
      cache_duration_source: effectiveCacheDurationSource,
      collection_path: collectionPath
    };
  }

  function durationToMilliseconds(value) {
    // Common xsd:duration forms used by SAML metadata. Years/months are converted
    // conservatively for comparison only; the original duration string is retained.
    const match = String(value || "").match(/^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
    if (!match) return null;
    const [, years, months, days, hours, minutes, seconds] = match;
    const dayMs = 86400000;
    return (
      Number(years || 0) * 365 * dayMs +
      Number(months || 0) * 30 * dayMs +
      Number(days || 0) * dayMs +
      Number(hours || 0) * 3600000 +
      Number(minutes || 0) * 60000 +
      Number(seconds || 0) * 1000
    );
  }

  function collectAttributeConsumingServices(spDescriptor) {
    if (!spDescriptor) return [];

    return elementsByName(spDescriptor, SAML_NS, "AttributeConsumingService").map((service) => {
      const indexRaw = service.getAttribute("index");
      const index = indexRaw !== null && indexRaw !== "" && Number.isFinite(Number(indexRaw))
        ? Number(indexRaw)
        : null;
      const serviceNames = elementsByName(service, SAML_NS, "ServiceName")
        .map((node) => ({
          value: (node.textContent || "").trim(),
          lang: node.getAttribute("xml:lang") || node.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang") || null
        }))
        .filter((item) => item.value);

      const requestedAttributes = elementsByName(service, SAML_NS, "RequestedAttribute")
        .map((attribute) => ({
          name: attribute.getAttribute("Name") || "",
          friendly_name: attribute.getAttribute("FriendlyName") || null,
          name_format: attribute.getAttribute("NameFormat") || null,
          is_required: parseBooleanAttribute(attribute, "isRequired"),
          values: [...attribute.children]
            .filter((child) => (child.localName || child.nodeName) === "AttributeValue")
            .map((child) => (child.textContent || "").trim())
            .filter(Boolean)
        }))
        .filter((attribute) => attribute.name || attribute.friendly_name);

      return {
        index,
        is_default: parseBooleanAttribute(service, "isDefault"),
        service_names: serviceNames,
        requested_attributes: requestedAttributes
      };
    });
  }

  function collectSignatureInfo(scope) {
    const signatures = elementsByName(scope, DS_NS, "Signature");
    const signatureAlgorithms = new Set();
    const digestAlgorithms = new Set();

    for (const node of elementsByName(scope, DS_NS, "SignatureMethod")) {
      const algorithm = node.getAttribute("Algorithm") || "";
      if (algorithm) signatureAlgorithms.add(algorithm);
    }
    for (const node of elementsByName(scope, DS_NS, "DigestMethod")) {
      const algorithm = node.getAttribute("Algorithm") || "";
      if (algorithm) digestAlgorithms.add(algorithm);
    }

    return {
      element_present: signatures.length > 0,
      signature_count: signatures.length,
      signature_algorithms: [...signatureAlgorithms],
      digest_algorithms: [...digestAlgorithms],
      cryptographic_verification: "not_performed"
    };
  }

  async function collectCertificates(entity, idpDescriptor, spDescriptor) {
    const certMap = new Map();

    function addCertificate(base64, use, role, source) {
      const clean = (base64 || "").replace(/\s+/g, "");
      if (!clean) return;

      if (!certMap.has(clean)) {
        certMap.set(clean, {
          base64: clean,
          uses: new Set(),
          roles: new Set(),
          sources: new Set()
        });
      }

      const item = certMap.get(clean);
      if (use) item.uses.add(use);
      if (role) item.roles.add(role);
      if (source) item.sources.add(source);
    }

    function scanRole(descriptor, role) {
      if (!descriptor) return;
      for (const keyDescriptor of elementsByName(descriptor, SAML_NS, "KeyDescriptor")) {
        const use = keyDescriptor.getAttribute("use") || "unspecified";
        for (const certNode of elementsByName(keyDescriptor, DS_NS, "X509Certificate")) {
          addCertificate(certNode.textContent, use, role, "KeyDescriptor");
        }
      }
    }

    scanRole(idpDescriptor, "idp");
    scanRole(spDescriptor, "sp");

    // Include certificates that exist outside KeyDescriptor, such as a certificate
    // carried in the metadata XML signature's KeyInfo.
    for (const certNode of elementsByName(entity, DS_NS, "X509Certificate")) {
      const clean = (certNode.textContent || "").replace(/\s+/g, "");
      if (!clean || certMap.has(clean)) continue;
      addCertificate(clean, "other", "metadata", "X509Certificate");
    }

    const enriched = [];
    for (const item of certMap.values()) {
      const details = await inspectCertificate(item.base64);
      enriched.push({
        base64: item.base64,
        uses: [...item.uses].sort(),
        roles: [...item.roles].sort(),
        sources: [...item.sources].sort(),
        ...details
      });
    }

    return enriched;
  }

  async function analyzeEntity(entity, index) {
    const idpDescriptor = firstByName(entity, SAML_NS, "IDPSSODescriptor");
    const spDescriptor = firstByName(entity, SAML_NS, "SPSSODescriptor");

    let type = "unknown";
    if (idpDescriptor && spDescriptor) type = "both";
    else if (idpDescriptor) type = "idp";
    else if (spDescriptor) type = "sp";

    const entityId = entity.getAttribute("entityID") || "";
    const acs = collectEndpoints(spDescriptor, "AssertionConsumerService");
    const sso = collectEndpoints(idpDescriptor, "SingleSignOnService");
    const slo = [
      ...collectEndpoints(spDescriptor, "SingleLogoutService").map((x) => ({ ...x, role: "sp" })),
      ...collectEndpoints(idpDescriptor, "SingleLogoutService").map((x) => ({ ...x, role: "idp" }))
    ];

    const artifactResolution = [
      ...collectEndpoints(spDescriptor, "ArtifactResolutionService").map((x) => ({ ...x, role: "sp" })),
      ...collectEndpoints(idpDescriptor, "ArtifactResolutionService").map((x) => ({ ...x, role: "idp" }))
    ];

    const organization = collectOrganization(entity);
    const metadataContext = metadataContextForEntity(entity);
    const attributeConsumingServices = collectAttributeConsumingServices(spDescriptor);

    return {
      index,
      entity_id: entityId,
      display_name: organization.display_name || organization.name || entityId || `Unnamed entity ${index + 1}`,
      organization,
      type,
      valid_until: metadataContext.valid_until,
      cache_duration: metadataContext.cache_duration,
      declared_valid_until: metadataContext.declared_valid_until,
      declared_cache_duration: metadataContext.declared_cache_duration,
      metadata_context: metadataContext,
      nameid_formats: collectNameIdFormats(entity),
      attribute_consuming_services: attributeConsumingServices,
      endpoints: {
        acs,
        sso,
        slo,
        artifact_resolution: artifactResolution
      },
      role_settings: {
        sp: spDescriptor
          ? {
              authn_requests_signed: parseBooleanAttribute(spDescriptor, "AuthnRequestsSigned"),
              want_assertions_signed: parseBooleanAttribute(spDescriptor, "WantAssertionsSigned"),
              protocol_support_enumeration: splitSpaceList(spDescriptor.getAttribute("protocolSupportEnumeration")),
              error_url: spDescriptor.getAttribute("errorURL") || null
            }
          : null,
        idp: idpDescriptor
          ? {
              want_authn_requests_signed: parseBooleanAttribute(idpDescriptor, "WantAuthnRequestsSigned"),
              protocol_support_enumeration: splitSpaceList(idpDescriptor.getAttribute("protocolSupportEnumeration")),
              error_url: idpDescriptor.getAttribute("errorURL") || null
            }
          : null
      },
      signature: collectSignatureInfo(entity),
      certificates: await collectCertificates(entity, idpDescriptor, spDescriptor)
    };
  }

  async function analyzeXmlString(xmlString) {
    const xmlDoc = parseXmlString(xmlString);
    if (!xmlDoc) {
      return {
        ok: false,
        error: "Could not parse this page as XML.",
        hint: "Open a SAML metadata XML document containing <EntityDescriptor> or <EntitiesDescriptor>.",
        detected_document: { type: "invalid_xml", label: "Invalid XML", root_element: null, namespace: null }
      };
    }

    const entityNodes = elementsByName(xmlDoc, SAML_NS, "EntityDescriptor");
    if (!entityNodes.length) {
      const detected = detectDocumentType(xmlDoc);
      return {
        ok: false,
        error: detected.error,
        hint: detected.hint,
        detected_document: detected.document
      };
    }

    const root = xmlDoc.documentElement;
    const rootLocalName = root?.localName || root?.nodeName || "";
    const entities = [];
    for (let i = 0; i < entityNodes.length; i += 1) {
      entities.push(await analyzeEntity(entityNodes[i], i));
    }

    return {
      ok: true,
      document_info: {
        root_element: rootLocalName,
        collection_name: root?.getAttribute?.("Name") || null,
        valid_until: root?.getAttribute?.("validUntil") || null,
        cache_duration: root?.getAttribute?.("cacheDuration") || null,
        entity_count: entities.length,
        signature: collectSignatureInfo(root || xmlDoc)
      },
      entities
    };
  }

  function detectDocumentType(xmlDoc) {
    const root = xmlDoc.documentElement;
    const localName = root?.localName || root?.nodeName || "Unknown";
    const namespace = root?.namespaceURI || null;
    const samlProtocol = "urn:oasis:names:tc:SAML:2.0:protocol";
    const samlAssertion = "urn:oasis:names:tc:SAML:2.0:assertion";

    const types = {
      Response: ["saml_response", "SAML Response", "This is a SAML authentication response, not SAML metadata."],
      AuthnRequest: ["authn_request", "SAML Authentication Request", "This is a SAML authentication request, not SAML metadata."],
      LogoutRequest: ["logout_request", "SAML Logout Request", "This is a SAML logout request, not SAML metadata."],
      LogoutResponse: ["logout_response", "SAML Logout Response", "This is a SAML logout response, not SAML metadata."],
      ArtifactResolve: ["artifact_resolve", "SAML Artifact Resolve", "This is a SAML protocol message, not SAML metadata."],
      ArtifactResponse: ["artifact_response", "SAML Artifact Response", "This is a SAML protocol message, not SAML metadata."],
      Assertion: ["assertion", "SAML Assertion", "This is a SAML assertion, not SAML metadata."]
    };

    const known = types[localName];
    if (known && (namespace === samlProtocol || namespace === samlAssertion || !namespace)) {
      return {
        document: { type: known[0], label: known[1], root_element: localName, namespace },
        error: `${known[1]} detected`,
        hint: `${known[2]} Simplify SAML analyzes IdP/SP metadata containing <EntityDescriptor> or <EntitiesDescriptor>.`
      };
    }

    if (/html/i.test(localName)) {
      return {
        document: { type: "web_page", label: "Web page", root_element: localName, namespace },
        error: "SAML metadata was not found on this page",
        hint: "Open the IdP/SP metadata XML directly, then click Simplify SAML again."
      };
    }

    return {
      document: { type: "other_xml", label: "XML document", root_element: localName, namespace },
      error: "This XML document is not SAML metadata",
      hint: "Simplify SAML analyzes metadata containing <EntityDescriptor> or <EntitiesDescriptor>."
    };
  }

  function splitSpaceList(value) {
    return (value || "").trim().split(/\s+/).filter(Boolean);
  }

  function shortenUri(value) {
    if (!value) return "";
    const hash = value.lastIndexOf("#");
    const slash = value.lastIndexOf("/");
    const colon = value.lastIndexOf(":");
    const idx = Math.max(hash, slash, colon);
    return idx >= 0 ? value.slice(idx + 1) : value;
  }

  async function inspectCertificate(base64) {
    try {
      const bytes = base64ToBytes(base64);
      const [sha256, sha1] = await Promise.all([
        digestHex("SHA-256", bytes),
        digestHex("SHA-1", bytes)
      ]);
      const parsed = parseX509Core(bytes);
      return {
        fingerprint_sha256: sha256,
        fingerprint_sha1: sha1,
        ...parsed,
        parse_error: null
      };
    } catch (error) {
      return {
        fingerprint_sha256: null,
        fingerprint_sha1: null,
        subject: null,
        issuer: null,
        serial_number: null,
        not_before: null,
        not_after: null,
        parse_error: String(error?.message || error)
      };
    }
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function digestHex(algorithm, bytes) {
    const digest = await crypto.subtle.digest(algorithm, bytes);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(":");
  }

  function parseX509Core(bytes) {
    const certificate = readAsn1Node(bytes, 0);
    const certificateChildren = asn1Children(bytes, certificate);
    if (!certificateChildren.length) throw new Error("Invalid certificate structure");

    const tbs = certificateChildren[0];
    const tbsChildren = asn1Children(bytes, tbs);
    let i = 0;

    if (tbsChildren[i]?.tagClass === 2 && tbsChildren[i]?.tagNumber === 0) i += 1;

    const serial = tbsChildren[i++];
    i += 1; // signature algorithm
    const issuer = tbsChildren[i++];
    const validity = tbsChildren[i++];
    const subject = tbsChildren[i++];

    const validityChildren = validity ? asn1Children(bytes, validity) : [];
    const notBefore = validityChildren[0] ? parseAsn1Time(bytes, validityChildren[0]) : null;
    const notAfter = validityChildren[1] ? parseAsn1Time(bytes, validityChildren[1]) : null;

    return {
      serial_number: serial ? bytesToHex(bytes.slice(serial.contentStart, serial.contentEnd)) : null,
      issuer: issuer ? parseDistinguishedName(bytes, issuer) : null,
      subject: subject ? parseDistinguishedName(bytes, subject) : null,
      not_before: notBefore,
      not_after: notAfter
    };
  }

  function readAsn1Node(bytes, offset) {
    if (offset >= bytes.length) throw new Error("ASN.1 offset out of range");
    let cursor = offset;
    const first = bytes[cursor++];
    const tagClass = first >> 6;
    const constructed = Boolean(first & 0x20);
    let tagNumber = first & 0x1f;

    if (tagNumber === 0x1f) {
      tagNumber = 0;
      let b;
      do {
        if (cursor >= bytes.length) throw new Error("Invalid ASN.1 tag");
        b = bytes[cursor++];
        tagNumber = (tagNumber << 7) | (b & 0x7f);
      } while (b & 0x80);
    }

    if (cursor >= bytes.length) throw new Error("Invalid ASN.1 length");
    let lengthByte = bytes[cursor++];
    let length;

    if ((lengthByte & 0x80) === 0) {
      length = lengthByte;
    } else {
      const count = lengthByte & 0x7f;
      if (!count || count > 4) throw new Error("Unsupported ASN.1 length");
      length = 0;
      for (let n = 0; n < count; n += 1) {
        if (cursor >= bytes.length) throw new Error("Invalid ASN.1 length bytes");
        length = (length * 256) + bytes[cursor++];
      }
    }

    const contentStart = cursor;
    const contentEnd = contentStart + length;
    if (contentEnd > bytes.length) throw new Error("ASN.1 node exceeds certificate length");

    return {
      offset,
      tagClass,
      constructed,
      tagNumber,
      contentStart,
      contentEnd,
      end: contentEnd
    };
  }

  function asn1Children(bytes, node) {
    if (!node?.constructed) return [];
    const children = [];
    let cursor = node.contentStart;
    while (cursor < node.contentEnd) {
      const child = readAsn1Node(bytes, cursor);
      children.push(child);
      if (child.end <= cursor) throw new Error("Invalid ASN.1 child length");
      cursor = child.end;
    }
    return children;
  }

  function parseDistinguishedName(bytes, node) {
    const attributes = [];

    function walk(current) {
      const children = asn1Children(bytes, current);
      if (
        current.tagClass === 0 &&
        current.tagNumber === 16 &&
        children.length >= 2 &&
        children[0].tagClass === 0 &&
        children[0].tagNumber === 6
      ) {
        const oid = decodeOid(bytes.slice(children[0].contentStart, children[0].contentEnd));
        const value = decodeAsn1String(bytes, children[1]);
        if (value) attributes.push(`${OID_LABELS[oid] || oid}=${value}`);
        return;
      }

      for (const child of children) walk(child);
    }

    walk(node);
    return attributes.length ? attributes.join(", ") : null;
  }

  function decodeOid(bytes) {
    if (!bytes.length) return "";
    const first = bytes[0];
    const firstPart = Math.min(2, Math.floor(first / 40));
    const parts = [firstPart, first - firstPart * 40];
    let value = 0;

    for (let i = 1; i < bytes.length; i += 1) {
      value = (value << 7) | (bytes[i] & 0x7f);
      if ((bytes[i] & 0x80) === 0) {
        parts.push(value);
        value = 0;
      }
    }

    return parts.join(".");
  }

  function decodeAsn1String(bytes, node) {
    const data = bytes.slice(node.contentStart, node.contentEnd);
    if (!data.length) return "";

    // UTF8String
    if (node.tagClass === 0 && node.tagNumber === 12) {
      return new TextDecoder("utf-8", { fatal: false }).decode(data);
    }

    // BMPString (UTF-16BE)
    if (node.tagClass === 0 && node.tagNumber === 30) {
      let value = "";
      for (let i = 0; i + 1 < data.length; i += 2) {
        value += String.fromCharCode((data[i] << 8) | data[i + 1]);
      }
      return value;
    }

    // PrintableString, IA5String, T61String and common fallbacks.
    return String.fromCharCode(...data);
  }

  function parseAsn1Time(bytes, node) {
    const raw = String.fromCharCode(...bytes.slice(node.contentStart, node.contentEnd));
    let match;
    let year;

    if (node.tagClass === 0 && node.tagNumber === 23) {
      match = raw.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(Z|[+-]\d{4})$/);
      if (!match) return null;
      const yy = Number(match[1]);
      year = yy >= 50 ? 1900 + yy : 2000 + yy;
      return buildAsn1Date(year, match.slice(2));
    }

    if (node.tagClass === 0 && node.tagNumber === 24) {
      match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?(Z|[+-]\d{4})$/);
      if (!match) return null;
      year = Number(match[1]);
      return buildAsn1Date(year, match.slice(2));
    }

    return null;
  }

  function buildAsn1Date(year, pieces) {
    const month = Number(pieces[0]);
    const day = Number(pieces[1]);
    const hour = Number(pieces[2]);
    const minute = Number(pieces[3]);
    const second = Number(pieces[4] || 0);
    const zone = pieces[5];

    let time = Date.UTC(year, month - 1, day, hour, minute, second);
    if (zone && zone !== "Z") {
      const sign = zone.startsWith("+") ? 1 : -1;
      const offsetHours = Number(zone.slice(1, 3));
      const offsetMinutes = Number(zone.slice(3, 5));
      const offsetMs = sign * ((offsetHours * 60 + offsetMinutes) * 60 * 1000);
      time -= offsetMs;
    }

    const date = new Date(time);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function bytesToHex(bytes) {
    return [...bytes].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  }

  globalThis.SimplifySamlParser = {
    analyzeXmlString,
    bindingLabel(uri) {
      return BINDING_LABELS[uri] || shortenUri(uri) || "Unspecified";
    }
  };
})();
