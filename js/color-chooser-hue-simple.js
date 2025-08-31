const hue = document.getElementById('hue');
const sat = document.getElementById('sat');
const light = document.getElementById('light');
const swatch = document.getElementById('swatch');
const hslChip = document.getElementById('hslChip');
const hexChip = document.getElementById('hexChip');
const rgbChip = document.getElementById('rgbChip');
const copyBtn = document.getElementById('copyHex');
const resetBtn = document.getElementById('resetBtn');

const SAR_COLOR_HSL = '_SAR_COLOR_HSL'

function hslToRgb(h, s, l) {
  // h: 0-360, s: 0-1, l: 0-1
  h = ((h % 360) + 360) % 360; // clamp
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1=0, g1=0, b1=0;
  if (0 <= h && h < 60)      { r1=c; g1=x; b1=0; }
  else if (60 <= h && h <120){ r1=x; g1=c; b1=0; }
  else if (120<= h && h<180){ r1=0; g1=c; b1=x; }
  else if (180<= h && h<240){ r1=0; g1=x; b1=c; }
  else if (240<= h && h<300){ r1=x; g1=0; b1=c; }
  else                       { r1=c; g1=0; b1=x; }
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return { r, g, b };
}

function toHex(n) {
  return n.toString(16).padStart(2, '0');
}

function update(byUser=true) {
  const h = Number(hue.value);
  const sPct = Number(sat.value);
  const lPct = Number(light.value);
  const s = sPct / 100;
  const l = lPct / 100;

  const { r, g, b } = hslToRgb(h, s, l);
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase();

  // Visuals (CSS variables + swatch)
  document.documentElement.style.setProperty('--h', h);
  document.documentElement.style.setProperty('--s', sPct);
  document.documentElement.style.setProperty('--l', lPct);
  swatch.style.background = `hsl(${h} ${sPct}% ${lPct}%)`;
  swatch.setAttribute('aria-label', `Selected color ${hex}`);

  // Readouts
  hslChip.textContent = `hsl(${h}, ${sPct}%, ${lPct}%)`;
  hexChip.textContent = hex;
  rgbChip.textContent = `rgb(${r}, ${g}, ${b})`;

  // Apply to parent document (if embedded)
  try { window.parent.document.documentElement.style.setProperty('--main-color', hex); } catch {}

  const slider = document.querySelector('input[type="range"].slider--sat');
  slider.style.setProperty('--sat-slider-color', h); // or whatever value you want
  const slider2 = document.querySelector('input[type="range"].slider--light');
  slider2.style.setProperty('--sat-slider-color', h); // or whatever value you want
  



  if (byUser) {
    // Save to localStorage
    const payload = { h, s: sPct, l: lPct, hex };
    localStorage.setItem(SAR_COLOR_HSL, JSON.stringify(payload));
  }
}


window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem(SAR_COLOR_HSL);
  if (saved) {
    try {
      const { h, s, l, hex } = JSON.parse(saved);
      if (Number.isFinite(h)) hue.value = h;
      if (Number.isFinite(s)) sat.value = s;
      if (Number.isFinite(l)) light.value = l;
      update(false);
      // Also apply saved color to parent doc
      try { window.parent.document.documentElement.style.setProperty('--main-color', hex); } catch {}
      return;
    } catch {}
  }
  else{
    setDefault()
  }
  // Initial render if nothing saved
  update(false);
});

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(hexChip.textContent);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => (copyBtn.textContent = 'Copy HEX'), 900);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(hexChip);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    alert('Select + copy the HEX value.');
  }
});

hue.addEventListener('input', () => update());
sat.addEventListener('input', () => update());
light.addEventListener('input', () => update());

function hexToHSL(hex) {
  // Remove leading "#"
  hex = hex.replace(/^#/, "");

  // Convert to RGB [0–1]
  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;

  let max = Math.max(r, g, b);
  let min = Math.min(r, g, b);
  let h, s, l;

  l = (max + min) / 2;

  if (max === min) {
    // achromatic
    h = s = 0;
  } else {
    let d = max - min;

    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0));
        break;
      case g:
        h = ((b - r) / d + 2);
        break;
      case b:
        h = ((r - g) / d + 4);
        break;
    }

    h /= 6;
  }

  return {
    h: Math.round(h * 360),      // 0–360
    s: Math.round(s * 100),      // 0–100%
    l: Math.round(l * 100)       // 0–100%
  };
}

// Reset to a nice default (matching initial values)
resetBtn.addEventListener('click', setDefault);

function setDefault(){
  const default_ = '#F3D32F'
  let hsldef = hexToHSL(default_)
  hue.value = hsldef.h
  sat.value = hsldef.s
  light.value = hsldef.l
  update();
}
