# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| Latest `main` / 1.1.x | Yes |
| Older builds and forks | No guarantee |

## Reporting a vulnerability

Please do not open a public GitHub issue for a security vulnerability.

Contact the maintainer privately at **forthehoangfamily@gmail.com** and include the affected version, reproduction steps, impact, and sanitized proof-of-concept material where possible.

## Security and privacy design

Simplify SAML 1.1 is intentionally local-first:

- It does not send SAML metadata to an external service.
- It does not include analytics or tracking.
- It does not request `<all_urls>` host permission.
- Page access is granted temporarily through `activeTab` only after a user clicks the extension action.
- Analysis data is stored in `chrome.storage.session`, which is in-memory for the browser session rather than persistent `storage.local`.
- Each analysis uses an independent identifier so concurrent inspection tabs do not share one mutable result slot.
- Old analysis entries are pruned after four hours when a new analysis is created.
- The UI renders untrusted metadata values with DOM `textContent`, not executable HTML.

## XML signature limitation

Version 1.1 can observe XML Signature elements and their declared signature/digest algorithm URIs. It does **not** cryptographically verify XML signatures, establish a certificate trust chain, validate metadata schema conformance, or make a trust decision about the metadata publisher.

The UI and exports should never describe a Signature element as a verified signature unless cryptographic verification is explicitly implemented and succeeds in a future version.

## Certificate limitation

Simplify SAML parses X.509 certificate metadata for inspection, fingerprints, key-use context, and validity dates. Certificate parsing does not establish that a key is trusted or that the metadata is authentic.

## Scope for security reports

Reports may include:

- Unsafe DOM rendering / XSS
- XML parsing edge cases that produce unsafe behavior
- Exposure or persistence of metadata, entity IDs, internal URLs, or certificates
- Unexpected network calls
- Chrome extension permission issues
- Session isolation failures
- Incorrect security claims in the UI
- Certificate parser crashes or malformed-input handling
- Packaging issues that alter the security/privacy model

Please sanitize private production metadata before attaching it to a report whenever possible.
