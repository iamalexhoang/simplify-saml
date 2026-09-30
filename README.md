# Simplify SAML

**One-click SAML metadata inspection for Chrome.**

Simplify SAML turns SAML 2.0 metadata into the values you actually need to configure an integration.

Open a SAML metadata page, click the extension, and get a clean one-screen summary — no uploading metadata, no account, no analytics, and no digging through XML.

[Chrome Web Store](https://chromewebstore.google.com/detail/simplify-saml/bhabmigcggnkhhhaaddbfipgngpcnakf) · [Project page](https://iamalexhoang.com/projects/simplify-saml) · [Privacy policy](https://iamalexhoang.com/projects/simplify-saml#privacy)

---

## What it shows

Depending on the metadata, Simplify SAML can surface:

- Entity ID
- Primary ACS, SSO, and SLO endpoints
- Alternate endpoints, kept collapsed until needed
- NameID formats
- Requested attributes, including required attributes
- `AuthnRequestsSigned`, `WantAssertionsSigned`, and `WantAuthnRequestsSigned`
- Signing and encryption certificates
- Certificate validity dates
- One-click **Copy PEM** and **Download PEM**
- Multiple entities from federation metadata
- Nested `EntitiesDescriptor` metadata
- Application / organization names when published
- Conservative IdP/vendor recognition

The goal is intentionally simple:

> **Click → copy the integration values → close.**

---

## Smart simplicity

Simplify SAML keeps complicated metadata simple.

### Primary endpoint selection

When metadata contains multiple endpoints, Simplify SAML quietly chooses the most useful primary value and keeps the rest behind an **alternate** disclosure.

For example:

- Default ACS wins when explicitly marked
- HTTP-POST is preferred for ACS
- HTTP-Redirect / HTTP-POST are preferred for SSO and SLO
- HTTPS is preferred when otherwise equivalent

### Complex federation metadata

Simplify SAML supports:

- Multiple `EntityDescriptor` entries
- Nested `EntitiesDescriptor` groups
- Inherited `validUntil` and `cacheDuration`
- Multiple signing certificates / rollover metadata
- `AttributeConsumingService`
- `RequestedAttribute`

Complexity stays in the parser — not in the interface.

---

## Privacy first

Simplify SAML is designed for identity and security workflows where metadata may contain internal URLs, entity identifiers, certificates, and other configuration details.

- Metadata is processed **locally in Chrome**
- Nothing is uploaded to a Simplify SAML server
- No analytics
- No advertising
- No tracking or telemetry
- No user accounts
- No persistent access to every website
- Analysis results use temporary `chrome.storage.session`

Page access happens only when you explicitly click the extension.

Read the full [Privacy Policy](https://iamalexhoang.com/projects/simplify-saml#privacy).

---

## Permissions

Simplify SAML uses a small Manifest V3 permission set:

### `activeTab`

Temporarily allows access to the current tab after you explicitly click the extension.

### `scripting`

Injects the packaged Simplify SAML content script into that active tab so the displayed metadata can be read.

### `storage`

Uses `chrome.storage.session` to temporarily pass the parsed result and raw XML to the summary page.

Simplify SAML does **not** require `<all_urls>`.

---

## Install

### Chrome Web Store

[**Install Simplify SAML from the Chrome Web Store →**](https://chromewebstore.google.com/detail/simplify-saml/bhabmigcggnkhhhaaddbfipgngpcnakf)

### Developer mode

1. Clone this repository:

   ```bash
   git clone https://github.com/iamalexhoang/simplify-saml.git
   ```

2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the repository folder
6. Pin **Simplify SAML** to the toolbar if desired

---

## How it works

The extension is intentionally small:

- `background.js` — handles the user click, temporary session result, and summary-tab flow
- `content.js` — reads the XML displayed in the active tab
- `parser.js` — parses SAML metadata into structured data
- `analyzer.js` — generates limited actionable observations
- `summary.html` / `summary.js` / `summary.css` — renders the one-screen integration summary

All parsing happens locally.

---

## Supported metadata

Simplify SAML is focused on SAML 2.0 metadata containing:

- `EntityDescriptor`
- `EntitiesDescriptor`
- `SPSSODescriptor`
- `IDPSSODescriptor`

If the extension detects a SAML Response, AuthnRequest, Logout message, or other non-metadata SAML XML, it identifies the document type instead of pretending it is metadata.

---

## Current release

### 1.1.7 — Visual Polish

The current release keeps the one-screen workflow while adding restrained color and clearer visual hierarchy.

Recent releases also added:

- Metadata Compatibility
- Nested federation support
- Requested attributes
- Smart primary endpoint selection
- Collapsed alternates
- Session-only storage
- Minimal `activeTab` permissions
- Signing/encryption certificate context
- New Simplify SAML icon

---

## Contributing

Issues and pull requests are welcome. Please keep the product philosophy in mind:

> If a feature does not make **click → integrate** faster or safer, it probably does not belong on the main screen.

See [CONTRIBUTING.md](CONTRIBUTING.md) for additional guidance.

---

## Security

For security-related information, see [SECURITY.md](SECURITY.md).

Please avoid posting real internal SAML metadata, private URLs, or sensitive identity configuration in public issues.

---

## License

MIT License. See [LICENSE.md](LICENSE.md).
