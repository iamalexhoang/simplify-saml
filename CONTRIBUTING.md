# Contributing to Simplify SAML

Thank you for your interest in contributing to Simplify SAML.

Simplify SAML is a privacy-first browser tool for making SAML metadata easier to read, review, and understand. The goal is to help identity, security, IT, and application teams inspect SAML metadata safely and quickly.

## Ways to Contribute

You can contribute by:

* Reporting bugs
* Suggesting improvements
* Improving documentation
* Adding SAML metadata test cases
* Improving metadata parsing
* Improving validation and warnings
* Reviewing Chrome extension permissions and security
* Helping with UI and accessibility improvements

## Project Goals

When contributing, please keep these goals in mind:

1. **Privacy first**
   SAML metadata should be processed locally in the browser. The extension should not send metadata, certificates, entity IDs, ACS URLs, SLO URLs, or other sensitive information to external services.

2. **Simple and readable**
   The tool should make SAML metadata easier to understand without overwhelming the user.

3. **Security-conscious**
   SAML metadata can contain sensitive internal URLs, certificates, and identifiers. Changes should avoid unsafe rendering, unnecessary permissions, and risky parsing behavior.

4. **Useful for real IAM workflows**
   Features should help with common identity and SSO review tasks, such as identifying entity IDs, endpoints, NameID formats, certificates, expiration dates, signing settings, and metadata structure.

## Getting Started

1. Fork the repository.
2. Clone your fork locally.

```bash
git clone https://github.com/YOUR-USERNAME/simplify-saml.git
cd simplify-saml
```

3. Create a new branch.

```bash
git checkout -b feature/your-feature-name
```

4. Make your changes.
5. Test the extension locally.
6. Commit your changes.
7. Open a pull request.

## Running Locally

Simplify SAML is a Chrome extension.

To test it locally:

1. Open Chrome.
2. Go to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder.
6. Test the extension with sample SAML metadata.

Please avoid testing with sensitive production metadata unless you are sure it remains local and private.

## Pull Request Guidelines

Before opening a pull request, please make sure:

* The change has a clear purpose.
* The code is easy to read and maintain.
* The change does not introduce unnecessary browser permissions.
* The change does not send metadata to external services.
* The UI remains simple and focused.
* Any new parsing or validation logic is tested with sample metadata.
* Documentation is updated when behavior changes.

## Good First Contributions

Good first issues may include:

* Fixing typos in documentation
* Adding screenshots to the README
* Improving sample SAML metadata files
* Adding support for more metadata fields
* Improving error messages
* Adding basic certificate expiration detection
* Adding warnings for missing ACS URLs or expired certificates
* Improving accessibility labels and keyboard navigation

## SAML Metadata Test Cases

Contributions that add test metadata examples are welcome.

Useful examples include:

* IdP metadata
* SP metadata
* Metadata with multiple ACS URLs
* Metadata with multiple certificates
* Metadata with expired certificates
* Metadata with missing optional fields
* Metadata with SLO endpoints
* Metadata using different NameID formats
* Metadata from common identity providers

Please do not include private, internal, customer, vendor, or production metadata unless it has been fully sanitized.

## Security Issues

Please do not report security vulnerabilities in public GitHub issues.

If you discover a vulnerability, follow the instructions in `SECURITY.md`.

Security-related concerns may include:

* Unsafe HTML rendering
* Cross-site scripting risks
* Unexpected external network calls
* Overly broad Chrome extension permissions
* Unsafe XML parsing behavior
* Exposure of SAML metadata or certificates

## Code Style

Please keep the code straightforward and readable.

General guidelines:

* Prefer clear names over clever code.
* Keep functions small when possible.
* Avoid unnecessary dependencies.
* Avoid adding permissions unless clearly required.
* Keep UI changes minimal and purposeful.
* Add comments when logic may not be obvious to future maintainers.

## Commit Messages

Use clear commit messages that explain the change.

Examples:

```text
Add certificate expiration warning
Improve ACS URL parsing
Fix README installation steps
Add sample IdP metadata
Reduce required extension permissions
```

## Feature Requests

Feature requests are welcome.

When suggesting a feature, please explain:

* What problem it solves
* Who would benefit from it
* What SAML metadata field or workflow it relates to
* Whether it affects privacy, permissions, or security

## Questions

If you are unsure whether a contribution fits the project, open a GitHub issue with your idea before starting a large change.

Thank you for helping make SAML metadata easier and safer to understand.
