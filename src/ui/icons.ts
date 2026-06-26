import type { Category, ComponentType } from "../sim";

// Vendor accent colors used for the highlighted parts of each schematic.
const VENDOR_ACCENT: Record<string, string> = {
  NVIDIA: "#76b900",
  AMD: "#ed1c24",
  AWS: "#ff9900",
  Google: "#4285f4",
  Utility: "#f2c744",
  Generic: "#7aa2c2",
  "N/A": "#7aa2c2",
};

function accentFor(t: ComponentType): string {
  return VENDOR_ACCENT[t.vendor] ?? "#7aa2c2";
}

// Each builder returns the inner markup for a 48x32 viewBox. Outlines use
// currentColor (so they inherit the surrounding text color); accented parts
// are filled/stroked with the vendor color `a`.
const SHAPES: Record<Category, (a: string) => string> = {
  accelerator: (a) => `
    <rect x="3" y="8" width="42" height="16" rx="2"/>
    <rect x="3" y="8" width="42" height="3" fill="${a}" stroke="none"/>
    <line x1="8" y1="14" x2="8" y2="22"/><line x1="11" y1="14" x2="11" y2="22"/>
    <line x1="14" y1="14" x2="14" y2="22"/><line x1="17" y1="14" x2="17" y2="22"/>
    <circle cx="34" cy="17" r="4.2" stroke="${a}"/>
    <line x1="34" y1="13" x2="34" y2="21" stroke="${a}"/><line x1="30" y1="17" x2="38" y2="17" stroke="${a}"/>
    <rect x="10" y="24" width="4" height="3" fill="${a}" stroke="none"/>
    <rect x="18" y="24" width="4" height="3" fill="${a}" stroke="none"/>`,
  cpu: (a) => `
    <rect x="15" y="9" width="18" height="14" rx="2"/>
    <rect x="20" y="13" width="8" height="6" fill="${a}" stroke="none"/>
    <line x1="19" y1="6" x2="19" y2="9"/><line x1="24" y1="6" x2="24" y2="9"/><line x1="29" y1="6" x2="29" y2="9"/>
    <line x1="19" y1="23" x2="19" y2="26"/><line x1="24" y1="23" x2="24" y2="26"/><line x1="29" y1="23" x2="29" y2="26"/>`,
  server: (a) => `
    <rect x="3" y="11" width="42" height="10" rx="1.5"/>
    <line x1="10" y1="11" x2="10" y2="21"/>
    <rect x="13" y="13" width="5" height="6"/><rect x="20" y="13" width="5" height="6"/><rect x="27" y="13" width="5" height="6"/>
    <circle cx="40" cy="14.5" r="1.2" fill="${a}" stroke="none"/><circle cx="40" cy="18" r="1.2" fill="${a}" stroke="none"/>`,
  rack: (a) => `
    <rect x="14" y="3" width="20" height="26" rx="1.5"/>
    <line x1="14" y1="9" x2="34" y2="9"/><line x1="14" y1="14" x2="34" y2="14"/>
    <line x1="14" y1="19" x2="34" y2="19"/><line x1="14" y1="24" x2="34" y2="24"/>
    <rect x="17" y="5" width="6" height="2.4" fill="${a}" stroke="none"/>`,
  power: (a) => `
    <rect x="4" y="11" width="18" height="12" rx="2"/>
    <line x1="22" y1="17" x2="30" y2="17"/>
    <path d="M33 8 L27 18 L32 18 L29 26 L39 15 L34 15 Z" fill="${a}" stroke="${a}" stroke-width="1"/>`,
  cooling: (a) => `
    <rect x="7" y="6" width="34" height="20" rx="2"/>
    <circle cx="17" cy="16" r="5" stroke="${a}"/>
    <line x1="17" y1="11" x2="17" y2="21" stroke="${a}"/><line x1="12" y1="16" x2="22" y2="16" stroke="${a}"/>
    <line x1="30" y1="11" x2="30" y2="21" stroke="${a}"/><line x1="25" y1="16" x2="35" y2="16" stroke="${a}"/>
    <line x1="26.5" y1="12.5" x2="33.5" y2="19.5" stroke="${a}"/><line x1="26.5" y1="19.5" x2="33.5" y2="12.5" stroke="${a}"/>`,
  network: (a) => `
    <rect x="4" y="12" width="40" height="9" rx="1.5"/>
    <rect x="8" y="14.5" width="3" height="4" fill="${a}" stroke="none"/>
    <rect x="13" y="14.5" width="3" height="4" fill="${a}" stroke="none"/>
    <rect x="18" y="14.5" width="3" height="4" fill="${a}" stroke="none"/>
    <rect x="23" y="14.5" width="3" height="4" fill="${a}" stroke="none"/>
    <rect x="28" y="14.5" width="3" height="4" fill="${a}" stroke="none"/>
    <rect x="33" y="14.5" width="3" height="4" fill="${a}" stroke="none"/>`,
  space: (a) => `
    <rect x="7" y="7" width="34" height="18" rx="1"/>
    <line x1="18" y1="7" x2="18" y2="25"/><line x1="30" y1="7" x2="30" y2="25"/>
    <line x1="7" y1="13" x2="41" y2="13"/><line x1="7" y1="19" x2="41" y2="19"/>
    <circle cx="12.5" cy="10" r="0.8" fill="${a}" stroke="none"/>`,
};

function wrap(inner: string, label?: string): string {
  const aria = label ? ` aria-label="${label}"` : "";
  return `<svg viewBox="0 0 48 32" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" role="img"${aria}>${inner}</svg>`;
}

/** Returns an inline SVG string (48x32 viewBox) representing the component. */
export function iconFor(t: ComponentType): string {
  return wrap(SHAPES[t.category](accentFor(t)), t.name);
}

/** Returns an inline SVG for a bare category (used by the infra board). */
export function iconForCategory(cat: Category, accent = "#7aa2c2"): string {
  return wrap(SHAPES[cat](accent));
}
