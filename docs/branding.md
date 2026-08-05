# Branding

Official branding guidance for Fishman. The source code is open under Apache-2.0;
the Fishman brand is not.

## Official name

- **Product name:** Fishman
- **Correct:** Fishman
- **Avoid:** FishMan, fish-man, FISHMAN (except logos/all-caps stylization)

## Official logo

- Place canonical logo assets under `docs/images/brand/` (or `public/`) when
  published
- Prefer SVG for docs; PNG for GitHub social preview
- Do not distort, recolor arbitrarily, or add unauthorized effects
- Maintain clear space around the mark roughly equal to the mark’s stroke width

Until final assets are checked in, use the in-app splash / icon as the reference.

## Official colors

Approximate product palette (align with the running app / CSS variables):

| Token | Role | Guidance |
|-------|------|----------|
| Background | App chrome | Follow light / dark theme tokens in `src/index.css` |
| Foreground | Primary text | High contrast against background |
| Accent | Interactive / brand | Use existing accent from the design system |
| Success / danger | Status | Semantic colors only — not brand decoration |

When designing marketing pages, prefer the app’s real theme tokens over inventing
a new palette. Avoid generic “AI purple gradient” looks that clash with the
product UI.

## Typography

- In-app: system / UI stack defined by the application CSS
- Marketing docs: clear sans for body; do not introduce random display fonts in
  the repository README

## Icon usage

- App icon and tray / window icons must remain recognizable at small sizes
- Do not place the logo on noisy backgrounds that harm legibility
- Third-party sites may use the logo to **refer** to Fishman (e.g. “Works with
  Fishman”) but not to brand a competing fork as Fishman

## Trademark

"Fishman", the Fishman logo, and related branding are trademarks of
**Narendra Nishad**.

The Apache-2.0 license applies to the source code only. It does not grant
permission to use the Fishman name, logo, or branding for derivative products in
a way that implies endorsement or official affiliation.

### Allowed

- Stating that software is a fork of Fishman / based on Fishman source
- Factual references in articles, reviews, and documentation
- Using unmodified logos to link to the official project

### Not allowed without written permission

- Naming a competing product “Fishman” or confusingly similar names
- Using the logo as the primary mark of a fork or commercial redistribution
- Implying official partnership, certification, or endorsement

Questions: open a Discussion or contact the maintainers via GitHub.

## Social preview

Recommended GitHub social image: 1280×640 PNG under `docs/images/social.png`
(add when available).
