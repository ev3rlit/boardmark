# Design System Specification: High-End Light Editorial

## 1. Overview & Creative North Star: "The Luminous Curator"

The Creative North Star for this design system is **The Luminous Curator**. This is not a standard functional UI; it is an editorial experience that treats digital content with the same reverence as a high-end physical gallery.

By leveraging the "Vivid Mono" DNA—high-contrast whites and grays punctuated by a singular electric purple—we move away from "app-like" grids toward an intentional, asymmetric layout. The goal is to break the "template" look through expansive breathing room, overlapping elements, and a hierarchy driven by tonal depth rather than structural lines.

### Scope Clarification

This document defines the design language for the **canvas app's UI/UX shell**: app surfaces, panels, overlays, controls, preview chrome, typography, and interaction affordances around content.

It does **not** directly define the visual design contract for canvas-internal objects themselves. In particular, object-level semantics such as node shape, connector logic, canvas geometry, object ownership boundaries, or the intrinsic visual language of content placed inside the canvas should not be inferred from this file alone.

Practical rule:

- Use this document for app chrome and embedded preview surface styling.
- Do not treat this document as the canonical source for canvas object appearance or object-model semantics.

---

## 2. Colors & Surface Architecture

The palette is rooted in a monochromatic foundation of `surface` and `surface-container` tiers, allowing the `primary` (#6042d6) to act as a high-energy focal point.

### The "No-Line" Rule

**Explicit Instruction:** Traditional 1px solid borders are prohibited for sectioning. Contrast and containment must be achieved solely through background color shifts. For example, a `surface-container-low` (#f1f4f6) section should sit directly against a `surface` (#f8f9fa) background to define its boundary.

### Surface Hierarchy & Nesting

Treat the UI as a series of stacked, physical layers.

- **Base:** `surface` (#f8f9fa) or `surface-container-lowest` (#ffffff).
- **Sectioning:** Use `surface-container` (#eaeff1) to block out major content areas.
- **Nesting:** Place a `surface-container-lowest` card inside a `surface-container-low` section to create a soft, natural lift without a border.

### The "Glass & Gradient" Rule

To escape the "flat" look of generic systems:

- **Glassmorphism:** Use semi-transparent `surface-container-lowest` with a `backdrop-blur` (20px-40px) for floating navigation bars or overlays.
- **Signature Textures:** Apply a subtle linear gradient from `primary` (#6042d6) to `primary-dim` (#5433c9) on Hero CTAs. This adds "visual soul" and a premium finish.

---

## 3. Typography: Editorial Authority

We use **Manrope** for its geometric clarity and modern professional tone. The hierarchy is designed to create a rhythmic flow across the page.

- **Display (lg/md/sm):** Used for "Hero" moments. Use `on-surface` (#2b3437) with tight letter-spacing (-0.02em). These should often be placed with intentional asymmetry (e.g., extreme left alignment with significant right-side white space).
- **Headline (lg/md):** The workhorse for section titles. Ensure high contrast against the light background to maintain readability.
- **Body (lg/md):** Set `body-lg` (1rem) as the standard for readability. Use `on-surface-variant` (#586064) for secondary body text to create a soft visual hierarchy.
- **Label (md/sm):** Reserved for uppercase "micro-copy" or category tags. Always pair with `primary` color or `on-surface-variant` to distinguish from body content.

---

## 4. Elevation & Depth: Tonal Layering

Traditional shadows and borders create "visual noise." This system utilizes **Tonal Layering** to convey importance.

- **The Layering Principle:** Depth is achieved by "stacking." A `surface-container-highest` (#dbe4e7) element naturally feels "closer" to the user than a `surface-dim` (#d1dce0) element.
- **Ambient Shadows:** If a "floating" effect is mandatory (e.g., a modal), use an ultra-diffused shadow: `box-shadow: 0 20px 40px rgba(43, 52, 55, 0.06)`. The shadow color is a low-opacity version of `on-surface` to mimic natural light.
- **The "Ghost Border" Fallback:** If accessibility requires a container boundary, use a **Ghost Border**: `outline-variant` (#abb3b7) at **15% opacity**. Never use 100% opaque lines.

---

## 5. Components & Interaction

### Buttons

- **Primary:** Solid `primary` (#6042d6) with `on-primary` (#fbf6ff) text. Corner radius: `ROUND_EIGHT` (0.5rem).
- **Secondary:** `primary-container` (#e6deff) background with `on-primary-container` (#5332c9) text. No border.
- **Tertiary:** Ghost style. No background, `primary` text. Use for low-emphasis actions.

### Cards & Lists

- **Strict Rule:** No divider lines. Separate list items using `spacing-4` (1rem) or subtle background shifts between `surface-container-low` and `surface-container-lowest`.
- **Cards:** Use `surface-container-lowest` (#ffffff) on a `surface` background. Apply `lg` (1rem) corner radius for a softer, premium feel.

### Input Fields

- **State:** Background should be `surface-container-high` (#e3e9ec).
- **Focus:** Transition background to `surface-container-lowest` and add a 2px `primary` ghost-border (20% opacity).

### Specialized Component: The Curator Hero

A layout component where a `display-lg` headline overlaps a `surface-container-highest` image container by `spacing-8` (2rem), creating an editorial, non-grid-restricted look.

---

## 6. Do’s and Don’ts

### Do:

- **Do** use extreme white space. If you think there is enough padding, add `spacing-4` (1rem) more.
- **Do** use `primary` (#6042d6) sparingly. It should be an "event" on the page, not the dominant color.
- **Do** align text and elements to a strict baseline, but feel free to vary the horizontal widths to create asymmetry.

### Don't:

- **Don't** use 1px black or dark grey borders.
- **Don't** use standard "drop shadows" with high opacity.
- **Don't** crowd the layout. If an interface feels "busy," move secondary information into a `surface-container` drawer or tooltip.
- **Don't** use pure black (#000000) for text. Always use `on-surface` (#2b3437) to maintain a sophisticated, high-end optical balance.
