# @brains/ui-library

## 0.2.0-alpha.68

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.68

## 0.2.0-alpha.67

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.67

## 0.2.0-alpha.66

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.66

## 0.2.0-alpha.65

## 0.2.0-alpha.64

## 0.2.0-alpha.63

## 0.2.0-alpha.62

## 0.2.0-alpha.61

## 0.2.0-alpha.60

## 0.2.0-alpha.59

## 0.2.0-alpha.58

## 0.2.0-alpha.57

## 0.2.0-alpha.56

## 0.2.0-alpha.55

## 0.2.0-alpha.54

## 0.2.0-alpha.53

## 0.2.0-alpha.52

### Patch Changes

- [`22bb0fc`](https://github.com/rizom-ai/brains/commit/22bb0fc26d76e6b48fa9952fe4eb0ce560d04cf0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Generalize `@rizom/ui`'s `Wordmark` and add a wordmark slot to the brain header so non-rizom sites (like yeehaa.io) can render a structured `name.suffix` brand mark.
  - `Wordmark` now accepts an optional `name` prop (defaulting to `"rizom"`) and widens `brandSuffix` to `RizomBrandSuffix | string`. Unknown suffixes fall back to `text-accent` for the dot color.
  - Brain `Header` accepts a `wordmark?: ComponentChildren` prop that, when provided, replaces the default title/logo rendering.
  - `ProfessionalLayout` forwards a new `wordmark` prop through to `Header` so site packages can override the header brand mark without rewriting the layout.

## 0.2.0-alpha.51

### Patch Changes

- [`2988101`](https://github.com/rizom-ai/brains/commit/29881019994e060d8ae18d73586d98014bba1d66) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Tighten typography and editorial layout on the professional site to match the rizom-aligned mock. Load Fraunces with the SOFT axis range (was inert), introduce `--color-rule` / `--color-rule-strong` / `--color-accent-soft` / `--color-bg-deep` tokens and matching utilities, refine the light palette toward the mock's warmer cream, and wire `.hero-bg-pattern` / `.cta-bg-pattern` / `.section-divider` / `.section-rule` to actual CSS rules. UI library updates: 3-column header (wordmark | nav | toggle), `.nav-link` utility, single-moon ThemeToggle, editorial entry styling with hover→accent + 1px rule separators, mono pill CTA button, and a footer wordmark size override. Drop the unused `--font-serif` token + `.font-serif` utility.

## 0.2.0-alpha.50

## 0.2.0-alpha.49

## 0.2.0-alpha.48

## 0.2.0-alpha.47

## 0.2.0-alpha.46

## 0.2.0-alpha.45

## 0.2.0-alpha.44

## 0.2.0-alpha.43

## 0.2.0-alpha.42

## 0.2.0-alpha.41

## 0.2.0-alpha.40

## 0.2.0-alpha.39

## 0.2.0-alpha.38

## 0.2.0-alpha.37

## 0.2.0-alpha.36

## 0.2.0-alpha.35

## 0.2.0-alpha.34

## 0.2.0-alpha.33

## 0.2.0-alpha.32

## 0.2.0-alpha.31

## 0.2.0-alpha.30

## 0.2.0-alpha.29

## 0.2.0-alpha.28

## 0.2.0-alpha.27

## 0.2.0-alpha.26

## 0.2.0-alpha.25

## 0.2.0-alpha.24

## 0.2.0-alpha.23

## 0.2.0-alpha.22

## 0.2.0-alpha.21

## 0.2.0-alpha.20

## 0.2.0-alpha.19

## 0.2.0-alpha.18

## 0.2.0-alpha.17

## 0.2.0-alpha.16

## 0.2.0-alpha.15

## 0.2.0-alpha.14

## 0.2.0-alpha.13

## 0.2.0-alpha.12

## 0.2.0-alpha.11

## 0.2.0-alpha.10

## 0.2.0-alpha.9

## 0.2.0-alpha.8

## 0.2.0-alpha.7

## 0.2.0-alpha.6

## 0.2.0-alpha.5

## 0.2.0-alpha.4

## 0.2.0-alpha.3

## 0.2.0-alpha.2

## 0.2.0-alpha.1

## 1.0.1-alpha.17
