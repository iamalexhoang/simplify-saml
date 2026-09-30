# Changelog

## 1.1.7 — Visual Polish
- Added restrained color accents, blue brand treatment, and subtle visual hierarchy improvements.
- Highlighted primary endpoints more clearly while keeping alternate endpoints collapsed.
- Added tasteful status coloring for certificates and required attributes.
- Kept the same one-screen workflow and underlying behavior.


## 1.1.6 — Metadata Compatibility
- Apply nested `EntitiesDescriptor` validity/cache constraints to child entities using the shorter effective value.
- Preserve declared entity validity/cache values and nested collection path internally.
- Parse SP `AttributeConsumingService` and `RequestedAttribute` metadata.
- Show requested attributes only when present, marking `isRequired=true` entries as Required.
- Keep alternate attribute sets collapsed to preserve the one-screen workflow.
- Include primary requested attributes in Copy All output.

## 1.1.5 — Icon Refresh
- Replaced the extension icon with a new blue Simplify SAML brand icon for toolbar, extension management, and Chrome surfaces.
- No behavior changes; this is a visual polish release only.


## 1.1.4 — Certificate Simplicity

- Reduced certificate actions to **Copy PEM** and **Download PEM**.
- Removed Base64 and SHA-256 fingerprint actions from the main UI.
- Kept SHA-256 certificate parsing internally for analysis without exposing it on the quick-integration screen.
- Preserved the one-screen integration workflow.

## 1.1.3 — Smart Simplicity

- Added smarter primary endpoint selection.
- Collapsed alternate endpoints behind a small disclosure instead of giving every endpoint equal visual weight.
- Added certificate Base64 copying.
- Added inline certificate expiration state.
- Added conservative vendor recognition for common SAML platforms.
- Shortened IdP/SP role guidance.
- Kept the one-screen integration summary and avoided new tabs or settings.

## 1.1.2 — Quick Integration

- Added optional organization/application name from SAML metadata.
- Reduced actionable warnings to one compact line.
- Added certificate SHA-256 fingerprint copying.
- Improved Copy All output for ticket-ready integration notes.
- Added local paste-metadata fallback for non-metadata pages.
- Kept the one-screen summary design unchanged.

## 1.1.1 — Simple Summary

- Final UI refinement: hide the entity selector for single-entity metadata.
- Emphasize the primary/default endpoint and visually demote alternates.
- Separate signing and encryption certificates into clearly labeled rows.
- Pluralize NameID Formats when needed and simplify the footer.
- Remove Download Summary; Copy All is the fast summary workflow.

- Returned Simplify SAML to its original one-click, one-screen design.
- Removed dashboard tabs and nonessential inspector UI.
- Shows only integration-ready values: entity ID, ACS/SSO/SLO endpoints, NameID formats, signing settings, and certificates.
- Added Copy All plus per-value copy controls.
- Kept the 1.1 privacy, parser, endpoint-binding, certificate-role, session-storage, multi-entity, and document-detection improvements underneath.
- Important warnings appear only when they need attention.
