# Minimalist Engineering Design System & Style Specification
*A portable, high-density, zero-clutter interface standard for modern web applications.*

> **Usage for AI Agents & Developers**:  
> You can drop this entire document directly into any `AGENTS.md`, system prompt, or design reference. When instructed to redesign or build an application, adhere strictly to the philosophy, color tokens, typographic hierarchy, component patterns, and interaction rules outlined below.

---

## 1. Core Philosophy: The Engineering Standard

This design system is modeled after elite developer tooling (Vercel, Linear, Supabase) and focused on **speed, information density, and zero cognitive friction**:

1. **High Signal, Zero Fluff**:
   - **Strictly eliminate visual clutter**: Never include tutorial hints, instructional subtext, or redundant state labels (e.g. `(click to edit)`, `(collapse)`, `(expand)`, `(hide/show)`).
   - Interface states and controls must be immediately obvious through crisp iconography, clear visual contrast, and direct manipulation affordances.
   - Empty states must be quiet and single-lined (e.g. `text-xs text-neutral-400 font-mono py-12 text-center`), never filled with giant illustrations or patronizing paragraphs.

2. **Speed & Native Tactility**:
   - Every clickable button, pill, checkbox, and navigation tab must provide immediate spring feedback: `active:scale-95 transition-all duration-150`.
   - Pages and panels transition with subtle opacity and scale entries (`animate-fadeIn`, `animate-scaleIn`), avoiding slow, distracting slide effects.

3. **Neutral Canvas with Disciplined Semantic Color**:
   - The interface is predominantly monochrome: a calm, off-white canvas (`#fafafa`), bright crisp white card surfaces (`#ffffff`), hairline borders (`#ebebeb`), and deep near-black ink (`#171717`).
   - Vibrant color is never used as decoration or background noise; it is strictly reserved for **functional semantics** (categories, tags, priority status, and completion state).

4. **Desktop & Mobile Parity**:
   - Mobile is never a stripped-down afterthought. The desktop experience uses floating pill docks and clean split views; the mobile experience seamlessly transforms into an iOS-grade native feel with bottom tab navigation, bottom-sheet modals, and safe-area padding (`pb-safe`, `pt-safe`).

---

## 2. Color System & Surface Tokens

### 2.1 Neutral Foundation Tokens
| Token Name | Hex Code | Tailwind Equivalent | Purpose & Role |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `#fafafa` | `bg-[#fafafa]` | Global page canvas, sticky header backdrop, and soft input wells |
| **Surface Card** | `#ffffff` | `bg-white` | Primary container surface for lists, forms, modals, and active pills |
| **Subtle Surface** | `#f5f5f5` | `bg-neutral-100` | Inactive pill trays, hovering rows, and secondary backgrounds |
| **Hairline Border** | `#ebebeb` | `border-[#ebebeb]` | Crisp 1px borders on cards, inputs, tabs, dividers, and modal frames |
| **Divider Line** | `#ebebeb` / `70%` | `divide-[#ebebeb]/70` | Subtle horizontal dividers separating list rows |
| **Ink Primary** | `#171717` | `text-neutral-900` | Primary headings, active item text, solid black buttons, dark icons |
| **Ink Secondary** | `#525252` | `text-neutral-600` | Subtitles, field labels, inactive tabs, and secondary actions |
| **Ink Muted / Mono** | `#737373` | `text-neutral-500` | Quantities, monospace dates, filter labels, and inactive icons |
| **Ink Disabled** | `#a8a8a8` | `text-neutral-400` | Strikethrough completed text, empty state messages, disabled buttons |

---

### 2.2 Curated Semantic Accent Palette
| Color Accent | Hex Value | 10% Background Tint (`hex12`) | Semantic Examples |
| :--- | :--- | :--- | :--- |
| **Ink Black** | `#171717` | `#17171712` | General, default, system, root |
| **Amber** | `#f59e0b` | `#f59e0b12` | Mathematics, warnings, finance, calculation |
| **Cyan** | `#06b6d4` | `#06b6d412` | Engineering, algebra, infrastructure |
| **Purple** | `#8b5cf6` | `#8b5cf612` | Science, physics, intelligence, AI |
| **Crimson** | `#ef4444` | `#ef444412` | Programming, urgent bugs, critical paths |
| **Electric Blue** | `#0070f3` | `#0070f312` | Communications, client syncs, product |
| **Emerald** | `#10b981` | `#10b98112` | Studio, design, creative projects, success |
| **Slate Gray** | `#64748b` | `#64748b12` | Documentation, governance, architecture |
| **Cobalt** | `#0068d6` | `#0068d612` | Career, recruitment, executive goals |
| **Vibrant Pink** | `#ec4899` | `#ec489912` | Personal, community, extracurricular |

---

## 3. Typography & Hierarchy
1. **Sans-Serif (Primary UI Stack)**: `font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`
2. **Monospace (Data & Precision Stack)**: `font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;`

---

## 4. Shadows, Borders & Zero-Clipping Rules
```js
boxShadow: {
  '2xs': '0 1px 2px rgba(0, 0, 0, 0.04)',
  'subtle': '0 0 0 1px #00000014, 0px 2px 2px #0000000a',
  'subtle-hover': '0 0 0 1px #00000020, 0px 4px 6px #0000000f',
  'modal': '0 0 0 1px #00000014, 0px 8px 16px -4px #0000000a, 0px 24px 32px -8px #0000000f'
}
```

Border Radii:
- Outer Cards: `rounded-xl` (`12px` or `16px`)
- Inner Panels / Inputs: `rounded-lg` (`8px`) or `rounded-md` (`6px`)
- Buttons & Pills: `rounded-full` (`9999px`)
- Hairline Border: `1px solid #ebebeb`
