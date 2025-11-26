chrome.storage.local.get(["saml_data", "raw_xml"], ({ saml_data, raw_xml }) => {
  const summaryContainer = document.getElementById("summary");
  const certButtonsContainer = document.getElementById("cert-buttons");
  const downloadSummaryBtn = document.getElementById("download-summary");
  const downloadXmlBtn = document.getElementById("download-xml");

  if (!saml_data) {
    summaryContainer.textContent =
      "No SAML data found. Click the Simplify SAML icon on a SAML metadata page first.";
    certButtonsContainer.innerHTML = "<i>No certificates available.</i>";
    downloadSummaryBtn.disabled = true;
    downloadXmlBtn.disabled = !raw_xml;
    return;
  }

  const lines = [];

  let typeLabel = "Unknown";
  if (saml_data.type === "idp") typeLabel = "Identity Provider (IdP)";
  else if (saml_data.type === "sp") typeLabel = "Service Provider (SP)";
  else if (saml_data.type === "both") typeLabel = "IdP + SP (combined)";

  lines.push("🧭 Type: " + typeLabel);

  if (saml_data.type === "idp") {
    lines.push(
      "ℹ️ Use this metadata to configure an external IdP (e.g., Okta, ADFS, Azure AD)."
    );
  } else if (saml_data.type === "sp") {
    lines.push(
      "ℹ️ Use this metadata to register this Service Provider in your IdP."
    );
  } else if (saml_data.type === "both") {
    lines.push(
      "ℹ️ This file contains both IdP and SP descriptors. Check which one your IdP expects."
    );
  } else {
    lines.push("⚠️ Unable to determine if this is IdP or SP metadata.");
  }

  lines.push("");
  lines.push("📌 Entity ID:");
  lines.push(saml_data.entity_id || "N/A");

  lines.push("");
  lines.push("📥 Assertion Consumer Service (ACS) URL(s) [HTTP-POST]:");
  if (Array.isArray(saml_data.acs_urls) && saml_data.acs_urls.length) {
    lines.push(...saml_data.acs_urls);
  } else {
    lines.push("None found.");
  }

  lines.push("");
  lines.push("🚪 Single Sign-On (SSO) URL(s) [HTTP-POST]:");
  if (Array.isArray(saml_data.sso_urls) && saml_data.sso_urls.length) {
    lines.push(...saml_data.sso_urls);
  } else {
    lines.push("None found.");
  }

  lines.push("");
  lines.push("🚪 Single Logout (SLO) URL(s) [HTTP-POST]:");
  if (Array.isArray(saml_data.slo_urls) && saml_data.slo_urls.length) {
    lines.push(...saml_data.slo_urls);
  } else {
    lines.push("None found.");
  }

  lines.push("");
  lines.push("🆔 NameID format(s):");
  if (Array.isArray(saml_data.nameid_formats) && saml_data.nameid_formats.length) {
    lines.push(...saml_data.nameid_formats);
  } else {
    lines.push("None found.");
  }

  lines.push("");
  lines.push("✍️ Signature:");
  if (saml_data.is_signed) {
    const algo = saml_data.signature_algorithm || "Algorithm not specified";
    lines.push("Metadata is signed.");
    lines.push("Signature algorithm: " + algo);
  } else {
    lines.push("Metadata not signed (no ds:Signature element found).");
  }

  lines.push("");
  if (Array.isArray(saml_data.certificates) && saml_data.certificates.length) {
    lines.push(
      `🔐 Certificate(s): ${saml_data.certificates.length} found. Use the buttons below to download as PEM files.`
    );
  } else {
    lines.push("🔐 Certificate(s): None found.");
  }

  const summaryText = lines.join("\n");

  const pre = document.createElement("pre");
  pre.textContent = summaryText;
  summaryContainer.innerHTML = "";
  summaryContainer.appendChild(pre);

  certButtonsContainer.innerHTML = "";
  if (Array.isArray(saml_data.certificates) && saml_data.certificates.length) {
    saml_data.certificates.forEach((certBase64, index) => {
      const btn = document.createElement("button");
      btn.textContent = `Download Certificate ${index + 1} (.pem)`;
      btn.addEventListener("click", () => {
        const pem = convertToPem(certBase64);
        downloadBlob(
          pem,
          "certificate_" + (index + 1) + ".pem",
          "application/x-pem-file"
        );
      });
      certButtonsContainer.appendChild(btn);
    });
  } else {
    certButtonsContainer.innerHTML = "<i>No certificates available.</i>";
  }

  downloadSummaryBtn.addEventListener("click", () => {
    downloadBlob(summaryText, "saml_summary.txt", "text/plain");
  });

  if (raw_xml) {
    downloadXmlBtn.addEventListener("click", () => {
      downloadBlob(raw_xml, "saml_metadata.xml", "application/xml");
    });
  } else {
    downloadXmlBtn.disabled = true;
  }
});

function downloadBlob(text, filename, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function convertToPem(base64) {
  const clean = (base64 || "").replace(/[\s\r\n]+/g, "");
  const lines = [];
  for (let i = 0; i < clean.length; i += 64) {
    lines.push(clean.slice(i, i + 64));
  }
  return (
    "-----BEGIN CERTIFICATE-----\n" +
    lines.join("\n") +
    "\n-----END CERTIFICATE-----\n"
  );
}
