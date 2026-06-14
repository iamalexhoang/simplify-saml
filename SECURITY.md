# Security Policy

## Supported Versions

Simplify SAML is currently in early development. Security fixes will be applied to the latest version of the project.

| Version                | Supported |
| ---------------------- | --------- |
| Latest `main` branch   | ✅         |
| Older commits or forks | ❌         |

## Reporting a Vulnerability

If you discover a security vulnerability in Simplify SAML, please report it responsibly.

Please do **not** open a public GitHub issue for security vulnerabilities.

Instead, contact the maintainer privately:

**Email:** [forthehoangfamily@gmail.com](mailto:forthehoangfamily@gmail.com)

Please include as much detail as possible, including:

* A clear description of the vulnerability
* Steps to reproduce the issue
* The affected browser, extension version, or commit
* Any proof-of-concept details, screenshots, or sample metadata
* The potential impact

I will make a best effort to acknowledge reports within a reasonable time and address confirmed issues as quickly as possible.

## Scope

Security reports may include, but are not limited to:

* Cross-site scripting or unsafe HTML rendering
* Unsafe parsing of SAML metadata
* Exposure of sensitive metadata, certificates, URLs, or identifiers
* Chrome extension permission issues
* Local data handling concerns
* Dependency vulnerabilities
* Build or packaging issues that could affect users

## Privacy and Local Processing

Simplify SAML is designed to process SAML metadata locally in the browser.

The project should not transmit uploaded or pasted SAML metadata to external servers unless clearly documented and intentionally added in the future.

If you discover behavior that causes SAML metadata, certificates, entity IDs, ACS URLs, SLO URLs, or other sensitive information to be sent outside the local browser environment, please report it as a security issue.

## Disclosure

Please allow time for investigation and remediation before publicly disclosing a vulnerability.

Once a fix is available, the vulnerability may be documented in release notes or a security advisory when appropriate.

## Security Updates

Security updates may be released through:

* Commits to the `main` branch
* GitHub releases
* Chrome Web Store updates, if the extension is published there

Users are encouraged to update to the latest available version.
