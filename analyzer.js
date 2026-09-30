(() => {
  if (globalThis.SimplifySamlAnalyzer) return;

  const SAML2_PROTOCOL = "urn:oasis:names:tc:SAML:2.0:protocol";

  function roleLabel(type) {
    if (type === "idp") return "Identity Provider (IdP)";
    if (type === "sp") return "Service Provider (SP)";
    if (type === "both") return "IdP + SP (combined)";
    return "Unknown role";
  }

  function guidance(type) {
    if (type === "idp") {
      return "Use these Identity Provider values when configuring the IdP connection in a Service Provider.";
    }
    if (type === "sp") {
      return "Use these Service Provider values when registering this application with an Identity Provider.";
    }
    if (type === "both") {
      return "This entity publishes both IdP and SP roles. Review the role required by the system you are configuring.";
    }
    return "Simplify SAML could not determine whether this entity publishes an IdP or SP role.";
  }

  function buildFindings(entity, documentInfo) {
    const findings = [];
    const push = (level, title, detail) => findings.push({ level, title, detail });

    if (!entity.entity_id) {
      push("warning", "Entity ID missing", "No entityID attribute was found on this EntityDescriptor.");
    }

    if (entity.type === "sp" || entity.type === "both") {
      const acs = entity.endpoints?.acs || [];
      if (!acs.length) {
        push("warning", "No ACS endpoint found", "SP metadata normally publishes at least one Assertion Consumer Service.");
      } else {
        const defaults = acs.filter((endpoint) => endpoint.is_default === true);
        if (defaults.length === 1) {
          const target = defaults[0].location || defaults[0].response_location || "Default ACS";
          push("ok", "Default ACS identified", target);
        } else if (defaults.length > 1) {
          push("warning", "Multiple ACS endpoints marked default", `${defaults.length} AssertionConsumerService entries have isDefault=true.`);
        } else {
          push("info", "No ACS explicitly marked default", "The relying platform may choose an ACS by index or its own defaulting rules.");
        }

        const duplicateIndexes = duplicateEndpointIndexes(acs);
        if (duplicateIndexes.length) {
          push("warning", "Duplicate ACS index detected", `Repeated index value${duplicateIndexes.length === 1 ? "" : "s"}: ${duplicateIndexes.join(", ")}`);
        }
      }
    }

    if (entity.type === "idp" || entity.type === "both") {
      const sso = entity.endpoints?.sso || [];
      if (!sso.length) {
        push("warning", "No SSO endpoint found", "IdP metadata normally publishes at least one Single Sign-On Service.");
      } else {
        push("ok", "SSO endpoint available", bindingSummary(sso));
      }
    }

    const allEndpoints = [
      ...(entity.endpoints?.acs || []),
      ...(entity.endpoints?.sso || []),
      ...(entity.endpoints?.slo || []),
      ...(entity.endpoints?.artifact_resolution || [])
    ];
    const insecureEndpoints = allEndpoints
      .flatMap((endpoint) => [endpoint.location, endpoint.response_location])
      .filter((value) => /^http:\/\//i.test(value || ""));
    const secureEndpoints = allEndpoints
      .flatMap((endpoint) => [endpoint.location, endpoint.response_location])
      .filter((value) => /^https:\/\//i.test(value || ""));

    if (insecureEndpoints.length) {
      push("warning", "HTTP endpoint detected", insecureEndpoints[0]);
    } else if (secureEndpoints.length) {
      push("ok", "Web endpoints use HTTPS", `${secureEndpoints.length} HTTPS endpoint${secureEndpoints.length === 1 ? "" : "s"} found.`);
    }

    const slo = entity.endpoints?.slo || [];
    if (!slo.length) {
      push("info", "No Single Logout endpoint published", "SLO is optional, but some integrations expect it.");
    }

    const certs = entity.certificates || [];
    const signing = certs.filter((cert) => cert.uses?.includes("signing") || cert.uses?.includes("unspecified"));
    const encryption = certs.filter((cert) => cert.uses?.includes("encryption") || cert.uses?.includes("unspecified"));

    if (signing.length) {
      push("ok", "Signing certificate available", signing.length > 1 ? `${signing.length} certificates may be usable for signing.` : "A signing-capable certificate is embedded in the metadata.");
    } else if (certs.length) {
      push("info", "No certificate explicitly marked for signing", "Review KeyDescriptor use values if the integration expects signed messages.");
    } else {
      push("info", "No embedded X.509 certificate found", "Some metadata does not embed keys, but signing/encryption integrations commonly do.");
    }

    if (encryption.length) {
      push("info", "Encryption certificate available", encryption.length > 1 ? `${encryption.length} certificates may be usable for encryption.` : "An encryption-capable certificate is embedded in the metadata.");
    }
    if (signing.length > 1) {
      push("info", "Multiple signing certificates detected", "This can be normal during signing-key rollover.");
    }

    const expired = certs.filter((cert) => certificateState(cert).state === "expired");
    const expiringSoon = certs.filter((cert) => certificateState(cert).state === "soon");
    if (expired.length) {
      push("warning", `${expired.length} certificate notAfter date${expired.length === 1 ? " has" : "s have"} passed`, "Treat this as an operational signal; SAML metadata certificates are not evaluated exactly like WebPKI/TLS certificates.");
    } else if (expiringSoon.length) {
      push("warning", `${expiringSoon.length} certificate${expiringSoon.length === 1 ? " is" : "s are"} within 30 days of notAfter`, "Review planned signing/encryption key rollover.");
    }

    const metadataValidity = dateState(entity.valid_until || documentInfo?.valid_until);
    if (metadataValidity.state === "expired") {
      push("warning", "Metadata validUntil has passed", "Refresh or confirm the metadata source before relying on this copy.");
    } else if (metadataValidity.state === "soon") {
      push("warning", `Metadata validUntil is ${metadataValidity.days} day${metadataValidity.days === 1 ? "" : "s"} away`, "Plan to refresh the metadata before the validity window ends.");
    }

    const signature = entity.signature || {};
    if (signature.element_present) {
      push("info", "Metadata XML signature present", "Signature data is present; cryptographic verification is not performed.");
    } else if (documentInfo?.signature?.element_present) {
      push("info", "Collection-level XML signature present", "The containing metadata document has a Signature element; cryptographic verification is not performed.");
    } else {
      push("info", "Metadata XML signature not present", "This is an observation, not a trust decision.");
    }

    const algorithms = [
      ...(signature.signature_algorithms || []),
      ...(signature.digest_algorithms || []),
      ...(documentInfo?.signature?.signature_algorithms || []),
      ...(documentInfo?.signature?.digest_algorithms || [])
    ];
    if (algorithms.some((value) => /sha1/i.test(value))) {
      push("warning", "SHA-1 algorithm reference detected", "Review whether the relying system still requires this legacy algorithm.");
    }

    const spProtocols = entity.role_settings?.sp?.protocol_support_enumeration || [];
    const idpProtocols = entity.role_settings?.idp?.protocol_support_enumeration || [];
    const publishedProtocols = [...new Set([...spProtocols, ...idpProtocols])];
    if (publishedProtocols.length && !publishedProtocols.includes(SAML2_PROTOCOL)) {
      push("warning", "SAML 2.0 protocol URI not listed", publishedProtocols.join(", "));
    }

    return findings;
  }

  function duplicateEndpointIndexes(endpoints) {
    const counts = new Map();
    for (const endpoint of endpoints || []) {
      if (endpoint.index === null || endpoint.index === undefined) continue;
      counts.set(endpoint.index, (counts.get(endpoint.index) || 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 1).map(([index]) => index);
  }

  function certificateState(cert) {
    if (!cert?.not_after) return { state: "unknown", days: null };
    return dateState(cert.not_after);
  }

  function dateState(value) {
    if (!value) return { state: "unknown", days: null };
    const end = Date.parse(value);
    if (!Number.isFinite(end)) return { state: "unknown", days: null };
    const days = Math.ceil((end - Date.now()) / 86400000);
    if (days < 0) return { state: "expired", days };
    if (days <= 30) return { state: "soon", days };
    if (days <= 90) return { state: "upcoming", days };
    return { state: "valid", days };
  }

  function bindingSummary(endpoints) {
    return [...new Set((endpoints || []).map((endpoint) => endpoint.binding_label || "Unspecified"))].join(", ");
  }

  function buildTextSummary(entity, analysis) {
    const lines = [];
    lines.push("Simplify SAML 1.1.6 — Metadata Compatibility");
    lines.push("");
    lines.push(`Role: ${roleLabel(entity.type)}`);
    lines.push(`Entity ID: ${entity.entity_id || "Not present"}`);
    if (analysis?.source_url) lines.push(`Source: ${analysis.source_url}`);
    if (entity.valid_until) lines.push(`Metadata valid until: ${entity.valid_until}`);
    if (entity.cache_duration) lines.push(`Cache duration: ${entity.cache_duration}`);
    lines.push("");
    lines.push("Endpoints");
    appendEndpoints(lines, "Assertion Consumer Service (ACS)", entity.endpoints?.acs || []);
    appendEndpoints(lines, "Single Sign-On (SSO)", entity.endpoints?.sso || []);
    appendEndpoints(lines, "Single Logout (SLO)", entity.endpoints?.slo || []);
    appendEndpoints(lines, "Artifact Resolution", entity.endpoints?.artifact_resolution || []);
    lines.push("");
    lines.push("NameID formats");
    if (entity.nameid_formats?.length) entity.nameid_formats.forEach((value) => lines.push(`- ${value}`));
    else lines.push("- None found");
    const attributeServices = (entity.attribute_consuming_services || []).filter((service) => service.requested_attributes?.length);
    if (attributeServices.length) {
      const primary = [...attributeServices].sort((a, b) => {
        if (a.is_default === true && b.is_default !== true) return -1;
        if (b.is_default === true && a.is_default !== true) return 1;
        const ai = Number.isFinite(a.index) ? a.index : Number.MAX_SAFE_INTEGER;
        const bi = Number.isFinite(b.index) ? b.index : Number.MAX_SAFE_INTEGER;
        return ai - bi;
      })[0];
      lines.push("");
      lines.push("Requested attributes");
      for (const attribute of primary.requested_attributes || []) {
        lines.push(`- ${attribute.name || attribute.friendly_name || "Unnamed"}${attribute.is_required === true ? " [required]" : ""}`);
      }
    }
    lines.push("");
    lines.push("Metadata XML signature");
    lines.push(`- Signature element present: ${entity.signature?.element_present ? "Yes" : "No"}`);
    lines.push("- Cryptographic verification: Not performed");
    for (const algorithm of entity.signature?.signature_algorithms || []) lines.push(`- Signature algorithm: ${algorithm}`);
    lines.push("");
    lines.push("Certificates");
    if (entity.certificates?.length) {
      entity.certificates.forEach((cert, index) => {
        lines.push(`Certificate ${index + 1}`);
        lines.push(`- Key use: ${(cert.uses || []).join(", ") || "Unspecified"}`);
        lines.push(`- Published by: ${(cert.roles || []).join(", ") || "Unspecified"}`);
        lines.push(`- Subject: ${cert.subject || "Unavailable"}`);
        lines.push(`- Issuer: ${cert.issuer || "Unavailable"}`);
        lines.push(`- Not after: ${cert.not_after || "Unavailable"}`);
        lines.push(`- SHA-256: ${cert.fingerprint_sha256 || "Unavailable"}`);
      });
    } else {
      lines.push("- None found");
    }
    lines.push("");
    lines.push("Checks & observations");
    for (const finding of buildFindings(entity, analysis?.document_info)) {
      lines.push(`- ${finding.level.toUpperCase()}: ${finding.title}${finding.detail ? ` — ${finding.detail}` : ""}`);
    }
    return lines.join("\n");
  }

  function appendEndpoints(lines, title, endpoints) {
    lines.push(`${title}:`);
    if (!endpoints.length) {
      lines.push("- None found");
      return;
    }
    for (const endpoint of endpoints) {
      const attrs = [endpoint.binding_label || "Unspecified"];
      if (endpoint.index !== null && endpoint.index !== undefined) attrs.push(`index ${endpoint.index}`);
      if (endpoint.is_default === true) attrs.push("default");
      if (endpoint.role) attrs.push(endpoint.role.toUpperCase());
      lines.push(`- ${endpoint.location || endpoint.response_location || "(no location)"} [${attrs.join(", ")}]`);
      if (endpoint.response_location && endpoint.response_location !== endpoint.location) {
        lines.push(`  ResponseLocation: ${endpoint.response_location}`);
      }
    }
  }

  globalThis.SimplifySamlAnalyzer = {
    roleLabel,
    guidance,
    buildFindings,
    certificateState,
    buildTextSummary
  };
})();
