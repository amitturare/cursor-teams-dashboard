---
name: coditas-brand
description: This skill provides Coditas and Safi brand guidelines including logos, colors, typography, and usage rules. Use when creating UI, marketing materials, presentations, or any visual content for Coditas. Triggers on requests involving Coditas branding, Safi logos, brand colors (#9900E6 violet, #11CAE6 turquoise), or visual identity.
---

<objective>
Apply official Coditas brand guidelines to ensure consistent visual identity across all materials. This skill provides direct access to logo URLs, exact color values, typography specs, and usage rules.
</objective>

## Quick Reference

### Brand Colors

| Color | Hex | RGB | Use |
|-------|-----|-----|-----|
| **Primary Violet** | `#9900E6` | 153, 0, 230 | Primary brand color |
| **Turquoise** | `#11CAE6` | 17, 202, 230 | Secondary, accents |
| **Torch Red** | `#FF174F` | 255, 23, 79 | Accents, CTAs |
| **Ham Purple** | `#5B0FFE` | 91, 15, 254 | Accents |
| **Body Text** | `#171717` | 23, 23, 23 | Primary text |
| **Grey 1** | `#736A85` | 115, 106, 133 | Secondary text |
| **Grey 2** | `#EBE9EF` | 235, 233, 239 | Borders |
| **Grey 3** | `#f5f5f5` | 245, 245, 245 | Backgrounds |

### Gradients

```css
/* Primary - Use for headers, CTAs, hero sections */
background: linear-gradient(135deg, #9900E6, #11CAE6);

/* Secondary - Use for accents */
background: linear-gradient(135deg, #9900E6, #FF174F);

/* Accent - Use for highlights */
background: linear-gradient(135deg, #11CAE6, #5B0FFE);
```

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| H1 | Urbanist | Bold/Extra Bold | 96px or 72px |
| H2 | Urbanist | Bold | 56px or 48px |
| Body | Inter | Regular/Medium | 32px or 24px |
| CTA | Inter | Semi Bold | 24px |

**Line Heights:** H1 = 120%, H2/Body = 140%

**Font Links:**
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Urbanist:wght@600;700;800&display=swap" rel="stylesheet">
```

## Logo Assets

### Coditas Logos

| Variant | URL | Background |
|---------|-----|------------|
| Light (white) | `https://coditas-brand-assets.web.app/logos/lite.png` | Dark backgrounds |
| Dark | `https://coditas-brand-assets.web.app/logos/dark.png` | Light backgrounds |
| Gradient | `https://coditas-brand-assets.web.app/logos/gradient.png` | General use |

### Safi Icon Logos

| Variant | URL | Background |
|---------|-----|------------|
| White (transparent) | `https://coditas-brand-assets.web.app/logos/safi-white-transparent.png` | Dark, overlays |
| White (solid) | `https://coditas-brand-assets.web.app/logos/safi-white.jpg` | Dark backgrounds |
| Gradient (transparent) | `https://coditas-brand-assets.web.app/logos/safi-gradient-transparent.png` | Any, overlays |
| Gradient (solid) | `https://coditas-brand-assets.web.app/logos/safi-gradient.jpg` | General use |
| Blue (solid) | `https://coditas-brand-assets.web.app/logos/coditas_logo_bluebg.png` | Social media, app icons |

### Logo Usage Rules

1. **Always use symbol + wordmark together** - Never separate the Saafi icon from "coditas" text
2. **Never modify** - Do not distort, redraw, or alter the logo
3. **Minimum size** - Use small logo variant below 80px × 15px
4. **Clear space** - Maintain padding around logo equal to the height of the "i" dot
5. **Partner logos** - Separate with 1px white stroke

### Logo Placement

| Layout | Dimensions | Position |
|--------|------------|----------|
| Standard | 1080 × 1080 | Top-left |
| Portrait | 1080 × 1920 | Top-left or top-center |
| Landscape | 1920 × 1080 | Top-left |

## CSS Variables Template

```css
:root {
  /* Colors */
  --coditas-violet: #9900E6;
  --coditas-turquoise: #11CAE6;
  --coditas-red: #FF174F;
  --coditas-purple: #5B0FFE;
  --coditas-text: #171717;
  --coditas-grey-1: #736A85;
  --coditas-grey-2: #EBE9EF;
  --coditas-grey-3: #f5f5f5;

  /* Gradients */
  --coditas-gradient: linear-gradient(135deg, #9900E6, #11CAE6);
  --coditas-gradient-alt: linear-gradient(135deg, #9900E6, #FF174F);

  /* Typography */
  --coditas-font-heading: 'Urbanist', sans-serif;
  --coditas-font-body: 'Inter', sans-serif;
}
```

## Implementation Examples

### HTML Logo Embed
```html
<img src="https://coditas-brand-assets.web.app/logos/gradient.png" alt="Coditas" height="40">
```

### Markdown Logo
```markdown
![Coditas](https://coditas-brand-assets.web.app/logos/gradient.png)
```

### Download Logo via CLI
```bash
curl -O https://coditas-brand-assets.web.app/logos/gradient.png
```

## Video & Thumbnail Specs

| Property | Value |
|----------|-------|
| Thumbnail size | 1280 × 720 (16:9) |
| Min width | 640px |
| Max file size | 2MB |
| Formats | JPG, PNG, GIF |
| Audio peaks | -3db to -8db |

## Brand Resources

- **Full Guidelines PDF:** https://coditas-brand-assets.web.app/Brand%20guidelines.pdf
- **Assets Page:** https://coditas-brand-assets.web.app/

## Core Values

When creating content, reflect these values:
1. **People First**
2. **Quality Coding**
3. **Ownership**
4. **User Perspective**

**Tagline:** Clean code evangelists delivering exceptional products with clean code and exceptional UX.
