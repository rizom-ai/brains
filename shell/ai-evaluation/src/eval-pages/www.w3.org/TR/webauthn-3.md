Title: Web Authentication: An API for accessing Public Key Credentials - Level 3

URL Source: https://www.w3.org/TR/webauthn-3/

Markdown Content:

# Web Authentication: An API for accessing Public Key Credentials, Level 3

W3C Candidate Recommendation

## Abstract

This specification defines an API enabling the creation and use of strong, attested, scoped, public key-based credentials by web applications, for the purpose of strongly authenticating users. A public key credential is created and stored by a WebAuthn Authenticator at the behest of a WebAuthn Relying Party, subject to user consent. Each credential is scoped to a single relying party, and only that relying party can use it.

## Overview

The API has two operations: registration, through `navigator.credentials.create()`, which creates a new credential bound to the user's account, and authentication, through `navigator.credentials.get()`, which proves possession of that credential. Authenticators may be built into the client device, such as a platform authenticator, or roam between devices, such as a security key.

Level 3 adds features including passkeys that sync across devices, hints for the kind of authenticator a relying party prefers, and related origin requests.
