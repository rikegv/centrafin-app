# Design System Specification: The Financial Architect

## 1. Overview & Creative North Star
**The Creative North Star: "The Editorial Ledger"**

This design system rejects the "cluttered dashboard" trope of legacy ERPs. Instead, it treats financial data with the prestige of a high-end editorial publication. We move beyond "Modern" into "Architectural"—where trust is built through generous white space, intentional asymmetry, and a rigorous hierarchy of information. 

By utilizing high-contrast typography scales (Manrope for headers) and a sophisticated layering system, we transform dense data into a navigable narrative. The experience should feel like a premium physical workspace: tactile, layered, and profoundly organized.

---

## 2. Colors: Tonal Depth & The "No-Line" Rule

The palette is anchored in corporate authority (`secondary`: `#4059aa`) and punctuated by high-energy action (`primary`: `#9d4300`). 

### The "No-Line" Rule
To achieve a premium, custom feel, **1px solid borders for sectioning are strictly prohibited.** Structural boundaries must be defined solely through background color shifts or tonal transitions.
- **Sectioning:** Use `surface-container-low` (`#f3f4f6`) for the main workspace background.
- **Nesting:** Place a `surface-container-lowest` (`#ffffff`) card onto that background to define a zone. 
- **Separation:** Use `surface-container-high` (`#e7e8ea`) for headers or footers within a card.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. 
- **Base Layer:** `surface` (`#f8f9fb`)
- **Inset Content:** `surface-container` (`#edeef0`)
- **Primary Work Area:** `surface-container-low` (`#f3f4f6`)
- **Active Floating Cards:** `surface-container-lowest` (`#ffffff`)

### The "Glass & Gradient" Rule
Standard flat buttons are insufficient for a signature system. 
- **Signature CTAs:** Use a subtle linear gradient from `primary` (`#9d4300`) to `primary_container` (`#f97316`) at 135 degrees.
- **Floating Overlays:** Use `surface_container_lowest` at 85% opacity with a `20px` backdrop-blur to create a "frosted glass" effect for modals and dropdowns.

---

## 3. Typography: The Editorial Scale

We pair **Manrope** (Display/Headlines) with **Inter** (Body/Labels) to balance character with technical precision.

- **Display (Manrope):** Large, bold, and authoritative. Use `display-md` (2.75rem) for total portfolio balances or "hero" metrics.
- **Headline (Manrope):** Use `headline-sm` (1.5rem) for section titles. This provides a "book-like" feel to the financial reports.
- **Body (Inter):** High-readability sans-serif. Use `body-md` (0.875rem) for all data table entries.
- **Labels (Inter):** Use `label-md` (0.75rem) with `on_surface_variant` (`#584237`) for metadata and micro-copy.

**Editorial Tip:** Use intentional asymmetry. Align primary headlines to the left while keeping secondary metrics right-aligned within the same container to create a dynamic visual flow.

---

## 4. Elevation & Depth: Tonal Layering

Traditional shadows often look "muddy." We prioritize **Tonal Layering** over structural lines.

- **The Layering Principle:** Depth is achieved by stacking. A `surface-container-lowest` card sitting on a `surface-container-low` background creates a natural 3D lift without any CSS effects.
- **Ambient Shadows:** For floating elements (Modals, Popovers), use an extra-diffused shadow: `0px 20px 40px rgba(25, 28, 30, 0.06)`. Note the tint: the shadow uses the `on_surface` color, not pure black.
- **The "Ghost Border" Fallback:** If a divider is mandatory for accessibility, use the `outline_variant` token at **15% opacity**. It should be felt, not seen.

---

## 5. Components: Precision Primitives

### Metric Cards
- **Construction:** Use `surface-container-lowest`. No borders.
- **Spacing:** `spacing-5` (1.1rem) internal padding.
- **Detail:** Use `tertiary` (`#006398`) for positive trend sparks and `error` (`#ba1a1a`) for negative alerts.

### Data Tables
- **Rule:** **Forbid divider lines.** 
- **Separation:** Use alternating row colors (Zebra striping) with `surface-container-low` or simply use vertical white space `spacing-4` (0.9rem) between rows.
- **Headers:** Use `label-md` in all-caps with `0.05em` letter spacing for a professional, tabular feel.

### Buttons
- **Primary:** Gradient (`primary` to `primary_container`), `rounded-md` (0.375rem). Text: `on_primary` (white).
- **Secondary:** Transparent background with a "Ghost Border" of `secondary` (`#4059aa`) at 30% opacity. 

### Status Badges
- **Success:** `tertiary_container` background with `on_tertiary_container` text.
- **Warning:** `primary_container` background (at 20% opacity) with `on_primary_fixed_variant` text.
- **Shape:** Use `rounded-full` for a soft, modern pill shape.

---

## 6. Do's and Don'ts

### Do
- **Do** use `surface-container-highest` for the Sidebar background to provide deep corporate contrast.
- **Do** allow financial figures to "breathe" by using `spacing-8` between major data clusters.
- **Do** use `manrope` for any number larger than 24px to emphasize the "Editorial" look.

### Don't
- **Don't** use 1px #000000 or #CCCCCC borders. Ever. 
- **Don't** use pure black for text. Always use `on_surface` (`#191c1e`) to maintain a premium, softened contrast.
- **Don't** use standard "drop shadows" on cards; rely on the background color shifts defined in the Surface Hierarchy.
- **Don't** cram data. If a table feels tight, increase the row height and use a smaller font size (`body-sm`) rather than removing padding.