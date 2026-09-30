const ANALYSIS_PREFIX = "analysis:";
const state = {
  analysisId: null,
  storageKey: null,
  analysis: null,
  entityIndex: 0
};

const el = {
  load: document.getElementById("load-state"),
  unsupported: document.getElementById("unsupported-state"),
  app: document.getElementById("app"),
  pickerWrap: document.getElementById("entity-picker-wrap"),
  picker: document.getElementById("entity-select"),
  role: document.getElementById("role"),
  vendor: document.getElementById("vendor"),
  organization: document.getElementById("organization-name"),
  guidance: document.getElementById("guidance"),
  card: document.getElementById("summary-card"),
  warnings: document.getElementById("warnings"),
  copyAll: document.getElementById("copy-all"),
  downloadXml: document.getElementById("download-xml"),
  clear: document.getElementById("clear-analysis"),
  toast: document.getElementById("toast")
};

init();

async function init() {
  const params = new URLSearchParams(location.search);
  state.analysisId = params.get("id");
  if (!state.analysisId) return showLoadError("No analysis was provided. Click Simplify SAML on a metadata page.");

  state.storageKey = ANALYSIS_PREFIX + state.analysisId;
  const stored = await chrome.storage.session.get(state.storageKey);
  state.analysis = stored[state.storageKey] || null;
  if (!state.analysis) return showLoadError("This result is no longer available. Click Simplify SAML again.");

  bindEvents();

  if (state.analysis.kind === "unsupported") {
    renderUnsupported();
    el.load.hidden = true;
    el.unsupported.hidden = false;
    return;
  }

  showMetadataAnalysis(state.analysis);
}

function showMetadataAnalysis(analysis) {
  state.analysis = analysis;
  state.entityIndex = 0;
  setupEntityPicker();
  renderEntity(0);
  el.downloadXml.disabled = !state.analysis.raw_xml;
  el.copyAll.hidden = false;
  el.load.hidden = true;
  el.unsupported.hidden = true;
  el.app.hidden = false;
}

function bindEvents() {
  el.picker.addEventListener("change", () => renderEntity(Number(el.picker.value)));
  el.copyAll.addEventListener("click", () => copyText(buildCopyText(currentEntity()), "Copied integration values"));
  el.downloadXml.addEventListener("click", () => {
    if (state.analysis?.raw_xml) downloadBlob(state.analysis.raw_xml, "saml-metadata.xml", "application/xml");
  });
  el.clear.addEventListener("click", async () => {
    await chrome.storage.session.remove(state.storageKey);
    window.close();
  });
}

function setupEntityPicker() {
  const entities = state.analysis.entities || [];
  const showPicker = entities.length > 1;
  el.pickerWrap.hidden = !showPicker;
  el.picker.replaceChildren();
  if (!showPicker) return;

  entities.forEach((entity, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${roleLabel(entity.type)} — ${entity.display_name || entity.entity_id || `Entity ${index + 1}`}`;
    el.picker.appendChild(option);
  });
}

function renderEntity(index) {
  const entity = state.analysis.entities?.[index];
  if (!entity) return;
  state.entityIndex = index;
  if (!el.pickerWrap.hidden) el.picker.value = String(index);

  el.role.textContent = roleLabel(entity.type);
  const vendor = detectVendor(entity);
  el.vendor.textContent = vendor || "";
  el.vendor.hidden = !vendor;
  const organizationName = entity.organization?.display_name || entity.organization?.name || "";
  el.organization.textContent = organizationName;
  el.organization.hidden = !organizationName || organizationName.toLowerCase() === (vendor || "").toLowerCase();
  el.guidance.textContent = guidance(entity.type);
  el.card.replaceChildren();

  addSimpleField("Entity ID", entity.entity_id || "Not found", true);

  if (entity.type === "sp" || entity.type === "both") {
    addEndpointField("ACS URL", entity.endpoints?.acs || [], "acs");
  }
  if (entity.type === "idp" || entity.type === "both") {
    addEndpointField("SSO URL", entity.endpoints?.sso || [], "sso");
  }

  if (entity.endpoints?.slo?.length) addEndpointField("Single Logout URL", entity.endpoints.slo, "slo");
  if (entity.endpoints?.artifact_resolution?.length) {
    addEndpointField("Artifact Resolution URL", entity.endpoints.artifact_resolution, "artifact");
  }

  addNameIdField(entity.nameid_formats || []);
  addRequestedAttributesField(entity.attribute_consuming_services || []);
  addRoleSettings(entity);
  addCertificateFields(entity.certificates || []);
  renderWarnings(entity);
}

function addSimpleField(label, value, copyable = false) {
  const field = makeField(label);
  field.values.appendChild(valueRow(
    value,
    "",
    copyable ? [{ label: "Copy", action: () => copyText(value, `${label} copied`) }] : []
  ));
}

function addEndpointField(label, endpoints, type) {
  const field = makeField(label);
  if (!endpoints.length) {
    field.values.appendChild(emptyText("Not found"));
    return;
  }

  const sorted = sortEndpoints(endpoints, type);
  const primary = sorted[0];
  field.values.appendChild(endpointRow(primary, label, false));

  const alternates = sorted.slice(1);
  if (alternates.length) {
    const details = document.createElement("details");
    details.className = "alternates";

    const summary = document.createElement("summary");
    summary.textContent = `${alternates.length} alternate${alternates.length === 1 ? "" : "s"}`;
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "alternate-list";
    alternates.forEach((endpoint) => list.appendChild(endpointRow(endpoint, label, true)));
    details.appendChild(list);
    field.values.appendChild(details);
  }
}

function endpointRow(endpoint, label, alternate) {
  const location = endpoint.location || endpoint.response_location || "Not found";
  const meta = [];
  if (endpoint.binding_label) meta.push(shortBinding(endpoint.binding_label));
  if (endpoint.is_default === true) meta.push("Default");
  if (endpoint.index !== null && endpoint.index !== undefined) meta.push(`Index ${endpoint.index}`);

  return valueRow(
    location,
    meta.join(" · "),
    [{ label: "Copy", action: () => copyText(location, `${label} copied`) }],
    true,
    alternate ? "alternate" : "primary-endpoint"
  );
}

function sortEndpoints(endpoints, type) {
  return [...endpoints].sort((a, b) => {
    const score = endpointScore(b, type) - endpointScore(a, type);
    if (score) return score;
    const aIndex = Number.isFinite(a.index) ? a.index : Number.MAX_SAFE_INTEGER;
    const bIndex = Number.isFinite(b.index) ? b.index : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return String(a.location || a.response_location || "").localeCompare(String(b.location || b.response_location || ""));
  });
}

function endpointScore(endpoint, type) {
  let score = 0;
  if (endpoint.is_default === true) score += 10000;
  if (endpoint.is_default === false) score -= 5;

  const binding = endpoint.binding_label || "";
  if (type === "acs") {
    if (binding === "HTTP-POST") score += 700;
    if (binding === "HTTP-Artifact") score += 400;
    if (endpoint.index === 0) score += 250;
  } else if (type === "sso") {
    if (binding === "HTTP-Redirect") score += 700;
    if (binding === "HTTP-POST") score += 600;
    if (binding === "HTTP-Artifact") score += 300;
  } else if (type === "slo") {
    if (binding === "HTTP-Redirect") score += 700;
    if (binding === "HTTP-POST") score += 600;
    if (binding === "SOAP") score += 300;
  } else {
    if (binding === "SOAP") score += 700;
    if (binding === "HTTP-Artifact") score += 600;
  }

  const location = endpoint.location || endpoint.response_location || "";
  if (/^https:\/\//i.test(location)) score += 50;
  if (endpoint.index !== null && endpoint.index !== undefined) score += Math.max(0, 100 - Math.min(endpoint.index, 100));
  return score;
}

function shortBinding(binding) {
  return (binding || "")
    .replace(/^HTTP-/, "")
    .replace(/^urn:oasis:names:tc:SAML:2\.0:bindings:/, "") || "Unspecified";
}

function addNameIdField(formats) {
  const label = formats.length === 1 ? "NameID Format" : "NameID Formats";
  const field = makeField(label);
  if (!formats.length) {
    field.values.appendChild(emptyText("Not specified"));
    return;
  }

  formats.forEach((format) => {
    const friendly = friendlyNameId(format);
    field.values.appendChild(valueRow(
      friendly,
      friendly === format ? "" : format,
      [{ label: "Copy", action: () => copyText(format, "NameID format copied") }],
      false
    ));
  });
}

function addRequestedAttributesField(services) {
  const populated = (services || []).filter((service) => service.requested_attributes?.length);
  if (!populated.length) return;

  const sorted = sortAttributeServices(populated);
  const primary = sorted[0];
  const field = makeField("Requested Attributes");
  appendRequestedAttributes(field.values, primary.requested_attributes || []);

  const alternates = sorted.slice(1);
  if (alternates.length) {
    const details = document.createElement("details");
    details.className = "alternates";

    const summary = document.createElement("summary");
    summary.textContent = `${alternates.length} alternate attribute set${alternates.length === 1 ? "" : "s"}`;
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "alternate-list";
    alternates.forEach((service) => {
      const serviceName = service.service_names?.[0]?.value;
      if (serviceName) {
        const heading = document.createElement("div");
        heading.className = "attribute-service-name";
        heading.textContent = serviceName;
        list.appendChild(heading);
      }
      appendRequestedAttributes(list, service.requested_attributes || [], true);
    });
    details.appendChild(list);
    field.values.appendChild(details);
  }
}

function appendRequestedAttributes(container, attributes, alternate = false) {
  attributes.forEach((attribute) => {
    const name = attribute.friendly_name || friendlyAttributeName(attribute.name) || attribute.name || "Unnamed attribute";
    const meta = [];
    if (attribute.is_required === true) meta.push("Required");
    if (attribute.friendly_name && attribute.name && attribute.friendly_name !== attribute.name) meta.push(attribute.name);
    else if (!attribute.friendly_name && friendlyAttributeName(attribute.name) && friendlyAttributeName(attribute.name) !== attribute.name) meta.push(attribute.name);

    const row = valueRow(
      name,
      meta.join(" · "),
      attribute.name ? [{ label: "Copy", action: () => copyText(attribute.name, "Attribute name copied") }] : [],
      false,
      alternate ? "alternate" : ""
    );
    if (attribute.is_required === true) row.classList.add("required-attribute");
    container.appendChild(row);
  });
}

function sortAttributeServices(services) {
  return [...services].sort((a, b) => {
    if (a.is_default === true && b.is_default !== true) return -1;
    if (b.is_default === true && a.is_default !== true) return 1;
    const aIndex = Number.isFinite(a.index) ? a.index : Number.MAX_SAFE_INTEGER;
    const bIndex = Number.isFinite(b.index) ? b.index : Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex;
  });
}

function friendlyAttributeName(value) {
  const map = {
    "urn:oid:0.9.2342.19200300.100.1.3": "Email address",
    "urn:oid:2.5.4.42": "Given name",
    "urn:oid:2.5.4.4": "Surname",
    "urn:oid:2.5.4.3": "Common name",
    "urn:oid:0.9.2342.19200300.100.1.1": "User ID",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": "Email address",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname": "Given name",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname": "Surname",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name": "Name"
  };
  return map[value] || "";
}

function addRoleSettings(entity) {
  const sp = entity.role_settings?.sp;
  const idp = entity.role_settings?.idp;

  if (sp?.authn_requests_signed !== null && sp?.authn_requests_signed !== undefined) {
    addSimpleField("AuthnRequests Signed", sp.authn_requests_signed ? "Yes" : "No");
  }
  if (sp?.want_assertions_signed !== null && sp?.want_assertions_signed !== undefined) {
    addSimpleField("Want Assertions Signed", sp.want_assertions_signed ? "Yes" : "No");
  }
  if (idp?.want_authn_requests_signed !== null && idp?.want_authn_requests_signed !== undefined) {
    addSimpleField("Want AuthnRequests Signed", idp.want_authn_requests_signed ? "Yes" : "No");
  }
}

function addCertificateFields(certs) {
  if (!certs.length) return;

  const labels = certs.map((cert) => certificateUse(cert));
  const totals = labels.reduce((map, label) => {
    map[label] = (map[label] || 0) + 1;
    return map;
  }, {});
  const seen = {};

  certs.forEach((cert, index) => {
    const use = labels[index];
    seen[use] = (seen[use] || 0) + 1;
    const numbered = totals[use] > 1 ? ` ${seen[use]}` : "";
    const field = makeField(`${use} Certificate${numbered}`);
    const pem = toPem(cert.base64);
    const validity = certificateValidity(cert);

    const row = valueRow(
      validity.title,
      validity.meta,
      [
        { label: "Copy PEM", action: () => copyText(pem, "PEM certificate copied") },
        { label: "Download PEM", action: () => downloadBlob(pem, certificateFilename(use, seen[use], totals[use]), "application/x-pem-file") }
      ],
      false
    );
    if (validity.statusClass) row.classList.add(validity.statusClass);
    field.values.appendChild(row);
  });
}

function certificateValidity(cert) {
  if (!cert.not_after) {
    return { title: "Embedded X.509 certificate", meta: "" };
  }

  const expires = new Date(cert.not_after);
  if (Number.isNaN(expires.getTime())) {
    return { title: `Valid until ${cert.not_after}`, meta: "" };
  }

  const days = Math.ceil((expires.getTime() - Date.now()) / 86400000);
  if (days < 0) {
    const ago = Math.abs(days);
    return {
      title: `Expired ${formatDate(cert.not_after)}`,
      meta: `${ago} day${ago === 1 ? "" : "s"} ago`,
      statusClass: "status-expired"
    };
  }
  if (days <= 90) {
    return {
      title: `Valid until ${formatDate(cert.not_after)}`,
      meta: `Expires in ${days} day${days === 1 ? "" : "s"}`,
      statusClass: "status-warning"
    };
  }
  return { title: `Valid until ${formatDate(cert.not_after)}`, meta: "", statusClass: "status-valid" };
}

function certificateFilename(use, number, total) {
  const slug = use.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "certificate";
  return `${slug}${total > 1 ? `-${number}` : ""}.pem`;
}

function renderWarnings(entity) {
  el.warnings.replaceChildren();
  const findings = SimplifySamlAnalyzer.buildFindings(entity, state.analysis.document_info)
    .filter((finding) => finding.level === "warning")
    .slice(0, 1);

  if (!findings.length) {
    el.warnings.hidden = true;
    return;
  }

  findings.forEach((finding) => {
    const line = document.createElement("div");
    line.className = "warning-line";
    line.textContent = `⚠ ${finding.title}${finding.detail ? ` — ${finding.detail}` : ""}`;
    el.warnings.appendChild(line);
  });
  el.warnings.hidden = false;
}

function renderUnsupported() {
  const detected = state.analysis.detected_document || {};
  el.unsupported.replaceChildren();

  const h2 = document.createElement("h2");
  h2.textContent = detected.label ? `${detected.label} detected` : "Not SAML metadata";

  const p = document.createElement("p");
  p.textContent = state.analysis.error || "This document is not SAML metadata.";

  const hint = document.createElement("p");
  hint.className = "muted";
  hint.textContent = state.analysis.hint || "Open SAML metadata containing EntityDescriptor or EntitiesDescriptor.";

  const pasteLabel = document.createElement("label");
  pasteLabel.className = "paste-label";
  pasteLabel.htmlFor = "paste-metadata";
  pasteLabel.textContent = "Or paste SAML metadata";

  const textarea = document.createElement("textarea");
  textarea.id = "paste-metadata";
  textarea.className = "paste-metadata";
  textarea.rows = 7;
  textarea.spellcheck = false;
  textarea.placeholder = "<EntityDescriptor ...>";

  const pasteError = document.createElement("div");
  pasteError.className = "paste-error";
  pasteError.hidden = true;

  const actions = document.createElement("div");
  actions.className = "actions";

  const analyze = document.createElement("button");
  analyze.type = "button";
  analyze.className = "primary-inline";
  analyze.textContent = "Analyze Metadata";
  analyze.addEventListener("click", async () => {
    const xml = textarea.value.trim();
    if (!xml) {
      pasteError.textContent = "Paste SAML metadata first.";
      pasteError.hidden = false;
      return;
    }

    analyze.disabled = true;
    analyze.textContent = "Analyzing…";
    pasteError.hidden = true;

    try {
      const result = await SimplifySamlParser.analyzeXmlString(xml);
      if (!result.ok) {
        pasteError.textContent = result.error || "This does not appear to be SAML metadata.";
        pasteError.hidden = false;
        return;
      }

      showMetadataAnalysis({
        kind: "metadata",
        source_url: "pasted",
        source_title: "Pasted SAML metadata",
        raw_xml: xml,
        raw_xml_omitted: false,
        document_info: result.document_info,
        entities: result.entities
      });
    } catch (error) {
      pasteError.textContent = error?.message || "Unable to analyze the pasted metadata.";
      pasteError.hidden = false;
    } finally {
      analyze.disabled = false;
      analyze.textContent = "Analyze Metadata";
    }
  });

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => window.close());

  actions.append(analyze, close);
  el.unsupported.append(h2, p, hint, pasteLabel, textarea, pasteError, actions);
}

function makeField(label) {
  const field = document.createElement("div");
  field.className = "field";

  const labelEl = document.createElement("div");
  labelEl.className = "field-label";
  labelEl.textContent = label;

  const values = document.createElement("div");
  values.className = "field-values";

  field.append(labelEl, values);
  el.card.appendChild(field);
  return { field, values };
}

function valueRow(main, meta = "", actions = [], monospace = true, extraClass = "") {
  const row = document.createElement("div");
  row.className = `value-row${extraClass ? ` ${extraClass}` : ""}`;

  const content = document.createElement("div");
  content.className = "value-main" + (monospace ? " mono" : "");

  const mainEl = document.createElement("div");
  mainEl.textContent = main;
  content.appendChild(mainEl);

  if (meta) {
    const metaEl = document.createElement("div");
    metaEl.className = "value-meta";
    metaEl.textContent = meta;
    content.appendChild(metaEl);
  }

  row.appendChild(content);

  if (actions.length) {
    const actionWrap = document.createElement("div");
    actionWrap.className = "value-actions";
    actions.forEach(({ label, action }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", action);
      actionWrap.appendChild(btn);
    });
    row.appendChild(actionWrap);
  }

  return row;
}

function emptyText(text) {
  const div = document.createElement("div");
  div.className = "empty";
  div.textContent = text;
  return div;
}

function buildCopyText(entity) {
  if (!entity) return "";
  const lines = [roleLabel(entity.type)];
  const vendor = detectVendor(entity);
  if (vendor) lines.push(`Platform: ${vendor}`);
  const organizationName = entity.organization?.display_name || entity.organization?.name;
  if (organizationName && organizationName.toLowerCase() !== (vendor || "").toLowerCase()) lines.push(`Application: ${organizationName}`);
  lines.push("", `Entity ID: ${entity.entity_id || "Not found"}`);

  if (entity.type === "sp" || entity.type === "both") {
    appendEndpointText(lines, "ACS URL", entity.endpoints?.acs || [], "acs");
  }
  if (entity.type === "idp" || entity.type === "both") {
    appendEndpointText(lines, "SSO URL", entity.endpoints?.sso || [], "sso");
  }
  appendEndpointText(lines, "Single Logout URL", entity.endpoints?.slo || [], "slo");
  appendEndpointText(lines, "Artifact Resolution URL", entity.endpoints?.artifact_resolution || [], "artifact");

  (entity.nameid_formats || []).forEach((value, index) => {
    const suffix = entity.nameid_formats.length > 1 ? ` ${index + 1}` : "";
    lines.push(`NameID Format${suffix}: ${value}`);
  });

  const attributeServices = sortAttributeServices((entity.attribute_consuming_services || []).filter((service) => service.requested_attributes?.length));
  const primaryAttributeService = attributeServices[0];
  (primaryAttributeService?.requested_attributes || []).forEach((attribute, index) => {
    const suffix = primaryAttributeService.requested_attributes.length > 1 ? ` ${index + 1}` : "";
    const required = attribute.is_required === true ? " [required]" : "";
    lines.push(`Requested Attribute${suffix}: ${attribute.name || attribute.friendly_name || "Unnamed"}${required}`);
  });

  const sp = entity.role_settings?.sp;
  const idp = entity.role_settings?.idp;
  if (sp?.authn_requests_signed !== null && sp?.authn_requests_signed !== undefined) {
    lines.push(`AuthnRequests Signed: ${sp.authn_requests_signed ? "Yes" : "No"}`);
  }
  if (sp?.want_assertions_signed !== null && sp?.want_assertions_signed !== undefined) {
    lines.push(`Want Assertions Signed: ${sp.want_assertions_signed ? "Yes" : "No"}`);
  }
  if (idp?.want_authn_requests_signed !== null && idp?.want_authn_requests_signed !== undefined) {
    lines.push(`Want AuthnRequests Signed: ${idp.want_authn_requests_signed ? "Yes" : "No"}`);
  }

  const certLabels = (entity.certificates || []).map((cert) => certificateUse(cert));
  const certTotals = certLabels.reduce((map, label) => {
    map[label] = (map[label] || 0) + 1;
    return map;
  }, {});
  const certSeen = {};

  (entity.certificates || []).forEach((cert, index) => {
    const use = certLabels[index];
    certSeen[use] = (certSeen[use] || 0) + 1;
    const suffix = certTotals[use] > 1 ? ` ${certSeen[use]}` : "";
    lines.push(`${use} Certificate${suffix}: Embedded${cert.not_after ? `, valid until ${formatDate(cert.not_after)}` : ""}`);
  });

  return lines.join("\n");
}

function appendEndpointText(lines, label, endpoints, type) {
  if (!endpoints.length) return;
  const endpoint = sortEndpoints(endpoints, type)[0];
  const location = endpoint?.location || endpoint?.response_location;
  if (!location) return;
  const meta = [
    endpoint.binding_label ? shortBinding(endpoint.binding_label) : null,
    endpoint.is_default === true ? "default" : null
  ].filter(Boolean).join(", ");
  lines.push(`${label}: ${location}${meta ? ` [${meta}]` : ""}`);
}

function currentEntity() {
  return state.analysis?.entities?.[state.entityIndex] || null;
}

function roleLabel(type) {
  if (type === "sp") return "Service Provider (SP)";
  if (type === "idp") return "Identity Provider (IdP)";
  if (type === "both") return "Identity Provider + Service Provider";
  return "SAML Metadata";
}

function guidance(type) {
  if (type === "sp") return "Give these values to your Identity Provider.";
  if (type === "idp") return "Enter these values in your Service Provider.";
  if (type === "both") return "This metadata publishes both IdP and SP values.";
  return "Values extracted from this SAML metadata.";
}

function detectVendor(entity) {
  const values = [
    entity.entity_id,
    entity.organization?.display_name,
    entity.organization?.name,
    entity.organization?.url,
    ...Object.values(entity.endpoints || {}).flatMap((items) =>
      (items || []).flatMap((endpoint) => [endpoint.location, endpoint.response_location])
    )
  ].filter(Boolean).join(" ").toLowerCase();

  const checks = [
    ["Okta", /(?:^|[\s/:.-])okta(?:\.com|[\s/:.-])/i],
    ["Microsoft Entra ID", /login\.microsoftonline\.com|sts\.windows\.net|microsoft entra/i],
    ["AD FS", /\/adfs\/|active directory federation services|\badfs\b/i],
    ["PingFederate", /pingidentity|pingfederate|\/pf\/[^\s]*/i],
    ["Keycloak", /keycloak|\/realms\/[^\s/]+\/protocol\/saml/i],
    ["Shibboleth", /shibboleth|\/idp\/profile\/saml2|\/idp\/shibboleth/i],
    ["OneLogin", /onelogin\.com|\bonelogin\b/i],
    ["Auth0", /auth0\.com|\bauth0\b/i],
    ["Google Workspace", /accounts\.google\.com\/o\/saml2|google workspace/i]
  ];

  for (const [label, pattern] of checks) {
    if (pattern.test(values)) return label;
  }
  return "";
}

function certificateUse(cert) {
  const uses = cert.uses || [];
  if (uses.includes("signing") && uses.includes("encryption")) return "Signing + Encryption";
  if (uses.includes("signing")) return "Signing";
  if (uses.includes("encryption")) return "Encryption";
  if (uses.includes("unspecified")) return "Signing / Encryption";
  return "X.509";
}

function friendlyNameId(value) {
  const map = {
    "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress": "Email address",
    "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent": "Persistent",
    "urn:oasis:names:tc:SAML:2.0:nameid-format:transient": "Transient",
    "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified": "Unspecified",
    "urn:oasis:names:tc:SAML:1.1:nameid-format:X509SubjectName": "X.509 subject name",
    "urn:oasis:names:tc:SAML:1.1:nameid-format:WindowsDomainQualifiedName": "Windows domain-qualified",
    "urn:oasis:names:tc:SAML:2.0:nameid-format:kerberos": "Kerberos",
    "urn:oasis:names:tc:SAML:2.0:nameid-format:entity": "Entity"
  };
  return map[value] || value;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function toPem(base64) {
  const clean = (base64 || "").replace(/\s+/g, "");
  const lines = [];
  for (let i = 0; i < clean.length; i += 64) lines.push(clean.slice(i, i + 64));
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

async function copyText(text, message) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  showToast(message);
}

function downloadBlob(text, filename, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.remove("show"), 1200);
}

function showLoadError(message) {
  el.load.textContent = message;
  el.load.hidden = false;
  el.app.hidden = true;
}
