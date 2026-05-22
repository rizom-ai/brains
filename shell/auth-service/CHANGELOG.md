# @brains/auth-service

## 0.2.0-alpha.81

### Patch Changes

- Updated dependencies []:
  - @brains/notifications@0.2.0-alpha.81
  - @brains/utils@0.2.0-alpha.81
  - @brains/plugins@0.2.0-alpha.81

## 0.2.0-alpha.80

### Patch Changes

- Updated dependencies []:
  - @brains/notifications@0.2.0-alpha.80
  - @brains/utils@0.2.0-alpha.80
  - @brains/plugins@0.2.0-alpha.80

## 0.2.0-alpha.79

### Patch Changes

- Updated dependencies []:
  - @brains/notifications@0.2.0-alpha.79
  - @brains/utils@0.2.0-alpha.79
  - @brains/plugins@0.2.0-alpha.79

## 0.2.0-alpha.78

### Patch Changes

- Updated dependencies []:
  - @brains/notifications@0.2.0-alpha.78
  - @brains/utils@0.2.0-alpha.78
  - @brains/plugins@0.2.0-alpha.78

## 0.2.0-alpha.77

### Patch Changes

- Updated dependencies []:
  - @brains/notifications@0.2.0-alpha.77
  - @brains/utils@0.2.0-alpha.77
  - @brains/plugins@0.2.0-alpha.77

## 0.2.0-alpha.76

### Patch Changes

- Updated dependencies []:
  - @brains/notifications@0.2.0-alpha.76
  - @brains/utils@0.2.0-alpha.76
  - @brains/plugins@0.2.0-alpha.76

## 0.2.0-alpha.75

### Patch Changes

- Updated dependencies []:
  - @brains/notifications@0.2.0-alpha.75
  - @brains/utils@0.2.0-alpha.75
  - @brains/plugins@0.2.0-alpha.75

## 0.2.0-alpha.74

### Patch Changes

- Updated dependencies []:
  - @brains/notifications@0.2.0-alpha.74
  - @brains/utils@0.2.0-alpha.74
  - @brains/plugins@0.2.0-alpha.74

## 0.2.0-alpha.73

### Patch Changes

- Updated dependencies []:
  - @brains/notifications@0.2.0-alpha.73
  - @brains/utils@0.2.0-alpha.73
  - @brains/plugins@0.2.0-alpha.73

## 0.2.0-alpha.72

### Minor Changes

- [`e7e4205`](https://github.com/rizom-ai/brains/commit/e7e4205282726e6c092841bc4a4c9a6b9d35efdf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Auth-service can now request passkey setup emails via the notifications router, with persistent dedupe keyed to the active setup token (SHA-256 hashed at rest, 0o600). Rover bundles the setup email delivery plugins by default, and brains-ops renders `setup.delivery: email` configuration for pilot users — including the required `SETUP_EMAIL_API_KEY` and `SETUP_EMAIL_FROM` GitHub Secrets.

### Patch Changes

- Updated dependencies [[`e7e4205`](https://github.com/rizom-ai/brains/commit/e7e4205282726e6c092841bc4a4c9a6b9d35efdf)]:
  - @brains/notifications@0.2.0-alpha.72
  - @brains/utils@0.2.0-alpha.72
  - @brains/plugins@0.2.0-alpha.72

## 0.2.0-alpha.71

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.71
  - @brains/plugins@0.2.0-alpha.71

## 0.2.0-alpha.70

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.70
  - @brains/plugins@0.2.0-alpha.70

## 0.2.0-alpha.69

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.69
  - @brains/plugins@0.2.0-alpha.69

## 0.2.0-alpha.68

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.68
  - @brains/plugins@0.2.0-alpha.68

## 0.2.0-alpha.67

### Patch Changes

- [`ace43f9`](https://github.com/rizom-ai/brains/commit/ace43f9c2c34db1159d6b91ba76411691e596c9f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Default local development auth issuer URLs to the running localhost origin while preserving explicit and production issuer behavior.

- Updated dependencies [[`ace43f9`](https://github.com/rizom-ai/brains/commit/ace43f9c2c34db1159d6b91ba76411691e596c9f)]:
  - @brains/plugins@0.2.0-alpha.67
  - @brains/utils@0.2.0-alpha.67

## 0.2.0-alpha.66

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.66
  - @brains/plugins@0.2.0-alpha.66

## 0.2.0-alpha.65

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.65
  - @brains/plugins@0.2.0-alpha.65

## 0.2.0-alpha.64

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.64
  - @brains/plugins@0.2.0-alpha.64

## 0.2.0-alpha.63

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.63
  - @brains/plugins@0.2.0-alpha.63

## 0.2.0-alpha.62

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.62
  - @brains/plugins@0.2.0-alpha.62

## 0.2.0-alpha.61

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.61
  - @brains/plugins@0.2.0-alpha.61

## 0.2.0-alpha.60

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.60
  - @brains/plugins@0.2.0-alpha.60

## 0.2.0-alpha.59

### Patch Changes

- [`6eef964`](https://github.com/rizom-ai/brains/commit/6eef964c712f71f30301bbbaedb9b8a019f8ead5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Improve MCP Inspector OAuth compatibility by allowing browser CORS preflights on OAuth machine endpoints, accepting MCP protocol headers in CORS responses, tolerating loopback redirect URI variations, preserving registered client scopes when authorize requests omit scope, and handling raw WebCrypto ECDSA signatures.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.59
  - @brains/plugins@0.2.0-alpha.59

## 0.2.0-alpha.58

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.58
  - @brains/plugins@0.2.0-alpha.58

## 0.2.0-alpha.57

### Minor Changes

- [`3a7978b`](https://github.com/rizom-ai/brains/commit/3a7978b1e53e21ddc22046ed3f421df772de4e76) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add an anchor-visible auth-service tool for retrieving the active first-passkey setup URL and cover it with Rover/Relay eval cases.

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.57
  - @brains/plugins@0.2.0-alpha.57

## 0.2.0-alpha.56

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.56
  - @brains/plugins@0.2.0-alpha.56

## 0.2.0-alpha.55

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.55
  - @brains/plugins@0.2.0-alpha.55
