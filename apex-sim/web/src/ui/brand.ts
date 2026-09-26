// The APEX_SIM wordmark: wide brushed-metal lettering with the underscore as a slanted accent cut (theme.css).
export function brandmark(className = '', tag: 'h1' | 'div' = 'h1'): HTMLElement {
  const h = document.createElement(tag);
  h.className = `brandmark ${className}`.trim();
  h.setAttribute('aria-label', 'APEX_SIM');
  h.innerHTML = '<span class="bm-word">APEX</span><i class="bm-cut" aria-hidden="true"></i><span class="bm-word">SIM</span>';
  return h;
}
