# Simplify SAML

Simplify SAML is a Chrome extension that turns messy SAML XML metadata into a clear, human-readable summary.  
With a single click, it extracts the key settings you actually care about: entity IDs, ACS / SSO / SLO URLs, NameID formats, and certificates.

No random scanning, no tracking — just click on a SAML metadata page and get the important bits in plain English.

---

## ✨ Features

- Parses SAML 2.0 metadata (`<EntityDescriptor>`) directly from the current page  
- Automatically detects:
  - Entity ID  
  - Assertion Consumer Service (ACS) URLs (HTTP-POST)  
  - Single Sign-On (SSO) URLs (HTTP-POST)  
  - Single Logout (SLO) URLs (HTTP-POST)  
  - NameID formats  
  - Whether the metadata is signed, and the signature algorithm (if present)  
  - Embedded X.509 certificates (with one-click PEM export)
- Shows a clean, human-readable summary in a separate tab
- One-click download for:
  - Summary text (`.txt`)
  - Raw XML (`.xml`)
  - Certificates as PEM (`.pem`)
- All parsing happens **locally** in your browser — nothing is sent to any server

---

## 🖼️ Preview

> (Optional: add your own screenshots here once you capture them)

### Raw SAML Metadata

Screenshot idea: a page full of XML from a SAML metadata URL.

### Simplify SAML Summary View

Screenshot idea: the summary tab showing:
- Type (IdP / SP / both)  
- Entity ID  
- ACS / SSO / SLO URLs  
- NameID formats  
- Signature status  

### Certificates & Downloads

Screenshot idea: certificate download buttons and the “Download Summary / Download XML” buttons.

---

## 🚀 Installation

### Chrome Web Store

> **Chrome Web Store:** _Coming soon_  

### Manual Install (Developer Mode)

1. Clone this repo:
   ```bash
   git clone https://github.com/iamalexhoang/simplify-saml.git
   ```
2. Go to `chrome://extensions` in Chrome
3. Turn on **Developer mode** (top right)
4. Click **“Load unpacked”**
5. Select the `simplify-saml/` folder

The extension icon should now appear in your toolbar.

---

## ⚙️ How It Works

- `background.js`  
  - Listens for a click on the Simplify SAML icon  
  - Injects `content.js` into the current tab using the `scripting` API  
  - Opens `summary.html` when parsing is finished

- `content.js`  
  - Reads the current page and tries to find SAML metadata (`<EntityDescriptor>`)  
  - Extracts:
    - Entity ID  
    - ACS / SSO / SLO URLs (HTTP-POST only)  
    - NameID formats  
    - Signature info (presence + algorithm)  
    - Any embedded X.509 certificates  
  - Saves the results into `chrome.storage.local`

- `summary.html` + `summary.js`  
  - Loads the parsed SAML data from `chrome.storage.local`  
  - Renders a readable summary  
  - Provides buttons to download:
    - Summary (`saml_summary.txt`)  
    - Raw XML (`saml_metadata.xml`)  
    - Certificates as `.pem`

---

## 🔐 Permissions

This extension uses a minimal set of permissions:

- `scripting`  
  - Used only to inject `content.js` into the active tab when you click the icon.

- `storage`  
  - Used to store the parsed SAML metadata summary and raw XML locally so the summary tab can display them and offer downloads.

- `host_permissions: "<all_urls>"`  
  - SAML metadata can live on many different domains (cloud IdPs, internal portals, test environments, and file URLs).  
  - This is required so the extension can read the page content on whatever metadata URL you’re viewing — **but only when you click the icon**.

The extension does **not**:

- Auto-run on every page
- Track your browsing history
- Send any data to external servers

All parsing happens locally in your browser.

---

## 🔏 Privacy

Simplify SAML is designed to be privacy-first:

- No analytics  
- No tracking  
- No external network calls  
- All data stays in your browser and is only used to render the summary and downloads

---

## 📄 License

MIT License © 2025 Alex Hoang  
See `LICENSE` for full terms.
