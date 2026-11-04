const byId = (id) => document.getElementById(id);

const el = {
  searchInput: byId('searchInput'),
  searchInputNav: byId('searchInputNav'),
  searchClear: byId('searchClear'),
  nav: document.querySelector('.nav'),
  heroSection: byId('heroSection'),
  status: byId('status'),
  resultsSection: byId('results-section'),
  resultCount: byId('resultCount'),
  filterSeg: byId('filterSeg'),
  grid: byId('grid'),
  modal: byId('modal'),
  playerCard: byId('playerCard'),
  modalArtwork: byId('modalArtwork'),
  modalCloseBtn: byId('modalCloseBtn'),
  artMode: byId('artMode'),
  qualityBadges: byId('qualityBadges'),
  mTitle: byId('mTitle'),
  mArtist: byId('mArtist'),
  seekBar: byId('seekBar'),
  curTime: byId('curTime'),
  durTime: byId('durTime'),
  scrubRow: document.querySelector('.player-scrub'),
  scrubLabel: byId('scrubLabel'),
  playBtn: byId('playBtn'),
  prevBtn: byId('prevBtn'),
  nextBtn: byId('nextBtn'),
  adjBtn: byId('adjBtn'),
  menuBtn: byId('menuBtn'),
  playerMenu: byId('playerMenu'),
  adjustPanel: byId('adjustPanel'),
  sizeSeg: byId('sizeSeg'),
  orientSeg: byId('orientSeg'),
  resSeg: byId('resSeg'),
  animRow: byId('animRow'),
  previewAudio: byId('previewAudio'),
  volRow: byId('volRow'),
  volBar: byId('volBar'),
  muteBtn: byId('muteBtn'),
  dlBtn: byId('dlBtn'),
  copyBtn: byId('copyBtn'),
  appleBtn: byId('appleBtn'),
  urlBox: byId('urlBox'),
};

const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
const COPY_HTML = el.copyBtn.innerHTML;
const CHECK_HTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Copied</span>';

el.playBtn.innerHTML = ICON_PLAY;

let lastResults = [];
let shownOrder = [];       // lastResults indices, in displayed (filtered) order
let currentShownPos = -1;  // position within shownOrder for the open modal
let currentFilter = 'all';
let current = null;
let currentSize = 1000;
let currentAnim = null;         // motion file for download / copy (resolution select)
let currentAnimDisplay = null;  // smaller motion file actually played in the card
let currentTall = false;
let warmer = null;              // detached <video> pre-buffering the next motion file
// Remembered motion on/off preference, applied when opening the next track.
let motionOn = (() => { try { return localStorage.getItem('motion') === 'on'; } catch { return false; } })();
let tallPref = (() => { try { return localStorage.getItem('motionTall') === 'on'; } catch { return false; } })();

function savePref(key, on) {
  try { localStorage.setItem(key, on ? 'on' : 'off'); } catch {}
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function urlForSize(it, size) {
  if (!it.artworkSmall) return it.artwork;
  return it.artworkSmall.replace(/\/\d+x\d+bb\.(jpg|png)/i, `/${size}x${size}bb.$1`);
}

// ── Dynamic palette from Apple's artwork colors ──
function hexRgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function shade(h, p) { // p<0 darkens toward black, p>0 lightens toward white
  const [r, g, b] = hexRgb(h); const t = p < 0 ? 0 : 255; const f = Math.abs(p);
  const m = (v) => Math.round((t - v) * f + v);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

// Musique-style backdrop: palette gradient + the cover itself, blurred. Text stays
// white; the CSS bottom fade keeps it readable even on light covers.
function applyColors(c, it) {
  const s = el.playerCard.style;
  ['--pg1', '--pg2', '--pg3'].forEach(v => s.removeProperty(v)); // fall back to the .player defaults
  if (c && c.bg) {
    s.setProperty('--pg1', c.bg);
    s.setProperty('--pg2', shade(c.bg, -0.3));
    s.setProperty('--pg3', shade(c.bg, -0.55));
  }
  const img = byId('backdropImg');
  const src = it && urlForSize(it, 600);
  if (src) img.src = src;
  else img.removeAttribute('src');
}

async function search() {
  const term = el.searchInputNav.value.trim() || el.searchInput.value.trim();
  if (!term) return;

  el.searchInput.value = term;
  el.searchInputNav.value = term;

  document.body.classList.add('has-results');
  el.heroSection.classList.add('hidden');
  el.resultsSection.hidden = true;
  el.status.hidden = false;
  el.status.className = 'loading';
  el.status.textContent = 'Searching…';

  try {
    const r = await fetch('/api/search?term=' + encodeURIComponent(term));
    const data = await r.json();
    lastResults = data.results || [];
    setAmbient(lastResults);

    if (!lastResults.length) {
      el.status.className = '';
      el.status.textContent = 'No results found. Try a different keyword.';
      return;
    }

    renderGrid();
  } catch (e) {
    el.status.className = '';
    el.status.textContent = 'Something went wrong: ' + e.message;
  }
}

// Map Apple's audioTraits into display badges (highest lossless tier + Atmos).
function qualityBadges(traits) {
  if (!Array.isArray(traits)) return [];
  const b = [];
  if (traits.includes('hi-res-lossless')) b.push({ cls: 'hires', label: 'Hi-Res Lossless' });
  else if (traits.includes('lossless')) b.push({ cls: 'lossless', label: 'Lossless' });
  if (traits.includes('atmos')) b.push({ cls: 'atmos', label: 'Dolby Atmos' });
  return b;
}

function hasMotion(it) {
  return !!(it.animation && (it.animation.best || it.animation.bestTall));
}

// Tint the page's ambient backdrop with the most colourful cover palettes in
// the results (greys and near-black/white covers would just muddy it). Slots
// with no good colour fall back to the theme's default blobs.
function setAmbient(results) {
  const scored = [];
  for (const r of results) {
    const hex = r.colors && r.colors.bg;
    if (!hex) continue;
    const [R, G, B] = hexRgb(hex).map(v => v / 255);
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    const l = (max + min) / 2;
    const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    if (s < 0.25 || l < 0.15 || l > 0.85) continue;
    if (scored.some(x => x.hex === hex)) continue;
    scored.push({ hex, score: s * (1 - Math.abs(l - 0.5)) });
  }
  scored.sort((a, b) => b.score - a.score);
  const root = document.documentElement.style;
  ['--amb1', '--amb2', '--amb3'].forEach((v, k) => {
    if (scored[k]) root.setProperty(v, scored[k].hex);
    else root.removeProperty(v);
  });
}

function renderGrid() {
  // Keep original indices so openModal(lastResults[i]) stays correct after filtering.
  const shown = lastResults
    .map((it, i) => ({ it, i }))
    .filter(({ it }) =>
      currentFilter === 'motion' ? hasMotion(it) :
      currentFilter === 'static' ? !hasMotion(it) : true);

  shownOrder = shown.map(({ i }) => i);

  el.grid.innerHTML = shown.map(({ it, i }, n) => `
    <div class="card" data-index="${i}" style="animation-delay:${Math.min(n * 40, 400)}ms">
      <div class="card-art-wrap">
        <img class="card-art" src="${it.artwork}" loading="lazy" alt="${escapeHtml(it.track)}">
        ${hasMotion(it) ? '<span class="motion-badge"><span class="motion-dot"></span>Motion</span>' : ''}
      </div>
      <div class="card-meta">
        <div class="card-title">${escapeHtml(it.track)}</div>
        <div class="card-artist">${escapeHtml(it.artist)}</div>
      </div>
    </div>
  `).join('');

  el.resultCount.textContent = `${shown.length} result${shown.length !== 1 ? 's' : ''}`;
  el.resultsSection.hidden = false;
  el.status.hidden = true;

  el.grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => openModal(Number(card.dataset.index)));
  });
}

// ── Preview audio ──
function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

function setProgress(pct) {
  el.seekBar.value = pct;
  el.seekBar.style.setProperty('--pct', pct + '%');
}

function resetPreview() {
  el.previewAudio.pause();
  el.playBtn.innerHTML = ICON_PLAY;
  setProgress(0);
  el.curTime.textContent = '0:00';
}

// ── Preview volume (remembered across tracks and reloads) ──
const ICON_VOL_LOW = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_VOL_MUTED = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m16 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function renderVolume() {
  const a = el.previewAudio;
  const pct = Math.round(a.volume * 100);
  const silent = a.muted || pct === 0;
  el.volBar.value = pct;
  el.volBar.style.setProperty('--pct', (a.muted ? 0 : pct) + '%');
  el.volRow.classList.toggle('muted', a.muted);
  el.muteBtn.innerHTML = silent ? ICON_VOL_MUTED : ICON_VOL_LOW;
  el.muteBtn.setAttribute('aria-pressed', String(a.muted));
  el.muteBtn.setAttribute('aria-label', a.muted ? 'Unmute' : 'Mute');
}

function saveVolume() {
  const a = el.previewAudio;
  try { localStorage.setItem('volume', String(a.volume)); localStorage.setItem('muted', a.muted ? 'on' : 'off'); } catch {}
}

(() => {
  let v = 1, m = false;
  try {
    const saved = parseFloat(localStorage.getItem('volume'));
    if (saved >= 0 && saved <= 1) v = saved;
    m = localStorage.getItem('muted') === 'on';
  } catch {}
  el.previewAudio.volume = v;
  el.previewAudio.muted = m;
  renderVolume();
})();

function setupPreview(it) {
  resetPreview();
  const has = !!it.previewUrl;
  el.scrubRow.hidden = !has;
  el.volRow.hidden = !has;
  el.playBtn.disabled = !has;
  if (has) {
    el.previewAudio.src = it.previewUrl;
    el.durTime.textContent = '-0:30';
  } else {
    el.previewAudio.removeAttribute('src');
  }
}

// Smallest variant that still looks sharp at the card's size (~272px square,
// 320px-wide tall, on a 2x screen); downloads keep the full-size file.
function displayVariant(map, tall) {
  const keys = Object.keys(map).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const minH = tall ? 640 : 480;
  const k = keys.find(k => parseInt(k, 10) >= minH) || keys[keys.length - 1];
  return map[k];
}

function warmVideo(url) {
  if (warmer) { warmer.removeAttribute('src'); warmer.load(); }
  warmer = null;
  if (!url) return;
  warmer = document.createElement('video');
  warmer.muted = true;
  warmer.preload = 'auto';
  warmer.src = url;
}

function openModal(i) {
  const it = lastResults[i];
  if (!it) return;
  quietArtMode = true;
  current = it;
  currentSize = 1000;
  currentAnim = null;
  currentAnimDisplay = null;
  currentTall = false;
  warmVideo(null);
  currentShownPos = shownOrder.indexOf(i);

  applyColors(it.colors, it);

  el.mTitle.textContent = it.track;
  el.mArtist.textContent = it.artist + (it.album ? ' · ' + it.album : '');
  el.appleBtn.href = it.trackViewUrl || it.collectionViewUrl || '#';

  const badges = qualityBadges(it.audioTraits);
  el.qualityBadges.innerHTML = badges.map(b => `<span class="qb qb-${b.cls}">${b.label}</span>`).join('');

  setupPreview(it);

  // Prev/next browse within the currently shown (filtered) results.
  el.prevBtn.disabled = currentShownPos <= 0;
  el.nextBtn.disabled = currentShownPos < 0 || currentShownPos >= shownOrder.length - 1;

  // Collapse the size/motion panel and the ⋯ menu each time.
  closeMenu();
  el.adjustPanel.hidden = true;
  el.adjBtn.setAttribute('aria-expanded', 'false');

  el.animRow.hidden = true;
  el.resSeg.innerHTML = '';
  el.orientSeg.innerHTML = '';

  el.sizeSeg.querySelectorAll('button').forEach(b => {
    const on = b.dataset.size === '1000';
    b.classList.toggle('active', on);
    b.classList.toggle('on', on);
  });

  const anim = it.animation;
  if (anim) {
    const square = anim.square || {};
    const tall = anim.tall || {};
    const hasSquare = Object.keys(square).length > 0;
    const hasTall = Object.keys(tall).length > 0;

    if (hasSquare || hasTall) {
      el.animRow.hidden = false;

      const orientations = [];
      if (hasSquare) orientations.push({ key: 'square', label: 'Square 1:1', map: square });
      if (hasTall) orientations.push({ key: 'tall', label: 'Tall 9:16', map: tall });

      // The select picks the download file; the card itself always plays the
      // small display variant, so changing it only updates the links.
      const renderResButtons = (map) => {
        const keys = Object.keys(map).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
        const preferred = keys.find(k => parseInt(k, 10) <= 1080) || keys[0];
        el.resSeg.innerHTML = `<select>${keys.map(k =>
          `<option value="${map[k]}" ${k === preferred ? 'selected' : ''}>${k}</option>`
        ).join('')}</select>`;
        const sel = el.resSeg.querySelector('select');
        sel.addEventListener('change', () => {
          currentAnim = sel.value;
          setMotionLinks();
        });
        currentAnim = map[preferred];
        currentAnimDisplay = displayVariant(map, currentTall);
      };

      // Start buffering the variant the Motion toggle would play, so turning
      // it on doesn't wait on Apple's CDN (often seconds for a cold file).
      if (!motionOn) {
        const o = (tallPref && orientations.find(x => x.key === 'tall')) || orientations[0];
        warmVideo(displayVariant(o.map, o.key === 'tall'));
      }

      // "Still" toggles motion off; orientation buttons turn it on.
      el.orientSeg.innerHTML =
        `<button data-key="still" class="active">Still</button>` +
        orientations.map(o => `<button data-key="${o.key}">${o.label}</button>`).join('');

      el.orientSeg.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => {
          el.orientSeg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          if (b.dataset.key === 'still') {
            currentAnim = null;
            currentAnimDisplay = null;
            currentTall = false;
            el.resSeg.hidden = true;
          } else {
            const o = orientations.find(x => x.key === b.dataset.key);
            currentTall = o.key === 'tall';
            el.resSeg.hidden = false;
            renderResButtons(o.map);
          }
          renderArt();
        });
      });

      el.resSeg.hidden = true;
    }
  }

  renderArt();
  // Open first so the Classic card has a measurable height before a
  // remembered 9:16 choice switches it to Immersive.
  el.modal.classList.add('open');
  if (motionOn) motionTarget()?.click();
  quietArtMode = false;
}

function orientButtons() {
  return [...el.orientSeg.querySelectorAll('button')];
}

function orientBtn(key) {
  return el.orientSeg.querySelector(`button[data-key="${key}"]`);
}

// The orientation motion should open in: tall when preferred and available.
function motionTarget() {
  return (tallPref && orientBtn('tall')) || orientButtons()[1];
}

// The Still / 1:1 / 9:16 control beside the close button. It drives the Motion
// segment's own buttons, so the segment, this control and renderArt() stay in
// sync, and it remembers the choice for the next track.
function setArtMode(key) {
  const btn = orientBtn(key);
  if (!btn) return;
  motionOn = key !== 'still';
  savePref('motion', motionOn);
  if (motionOn) { tallPref = key === 'tall'; savePref('motionTall', tallPref); }
  btn.click();
}

const MODE_ICONS = {
  still: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/></svg>',
  square: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none"/></svg>',
  tall: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 9v6l5-3z" fill="currentColor" stroke="none"/></svg>',
};
let quietArtMode = false; // true while openModal sets up, so opening doesn't animate
let liftTimer = 0;

// Glass tab bar. Tabs are rebuilt only when the set of modes changes; a mode
// change just moves the indicator (--i), lifting it into a lens on the way.
function renderArtMode() {
  const box = el.artMode;
  const modes = [['still', 'Still'], ['square', '1:1'], ['tall', '9:16']].filter(([k]) => orientBtn(k));
  box.hidden = modes.length < 2;
  const key = modes.map(([k]) => k).join();
  if (box.dataset.modes !== key) {
    box.dataset.modes = key;
    box.style.setProperty('--n', modes.length);
    box.style.removeProperty('--i');
    box.innerHTML = '<span class="glass-ind"><span class="glass-lens"></span></span>' +
      modes.map(([k, label]) => `<button data-mode="${k}" aria-pressed="false">${MODE_ICONS[k]}<span>${label}</span></button>`).join('');
  }

  const active = !currentAnim ? 'still' : (currentTall ? 'tall' : 'square');
  const idx = Math.max(0, modes.findIndex(([k]) => k === active));
  const prev = box.style.getPropertyValue('--i');
  const animate = !quietArtMode && el.modal.classList.contains('open') && prev !== '' && Number(prev) !== idx;

  if (!animate) box.classList.add('no-anim');
  box.style.setProperty('--i', idx);
  box.querySelectorAll('button').forEach(b => {
    const on = b.dataset.mode === active;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (animate) {
    box.classList.add('lift');
    clearTimeout(liftTimer);
    liftTimer = setTimeout(() => box.classList.remove('lift'), 340);
  } else {
    void box.offsetWidth; // apply the jump before transitions come back
    box.classList.remove('no-anim', 'lift');
  }
}

function renderArt() {
  const art = el.modalArtwork;
  const tallMotion = !!currentAnim && currentTall;
  const card = el.playerCard;
  // Immersive keeps whatever height the Classic card had, so switching
  // 1:1 → 9:16 doesn't resize the modal. Measured before the class flips.
  if (tallMotion && !card.classList.contains('immersive')) {
    const h = card.offsetHeight;
    if (h) card.style.height = h + 'px';
  } else if (!tallMotion) {
    card.style.removeProperty('height');
  }
  art.classList.toggle('tall', tallMotion);
  card.classList.toggle('immersive', tallMotion);
  renderArtMode();

  if (currentAnim) {
    // Keep the still cover underneath until the video has a frame: Apple's
    // CDN can take seconds on a cold file, which otherwise shows a blank card.
    art.innerHTML =
      `<img class="poster" src="${urlForSize(current, currentSize)}" alt="">` +
      `<video src="${currentAnimDisplay || currentAnim}" autoplay loop muted playsinline></video>`;
    art.classList.add('loading');
    el.artMode.classList.add('loading');
    const video = art.querySelector('video');
    const ready = () => {
      if (!art.contains(video)) return;
      art.classList.remove('loading');
      el.artMode.classList.remove('loading');
    };
    video.addEventListener('loadeddata', ready, { once: true });
    video.addEventListener('error', ready, { once: true });
    setMotionLinks();
  } else {
    const url = urlForSize(current, currentSize);
    art.classList.remove('loading');
    el.artMode.classList.remove('loading');
    art.innerHTML = `<img src="${url}" alt="">`;
    el.dlBtn.href = url;
    el.dlBtn.download = (current.track || 'artwork') + `-${currentSize}.jpg`;
    el.urlBox.textContent = url;
  }
}

function setMotionLinks() {
  el.dlBtn.href = currentAnim;
  el.dlBtn.download = (current.track || 'artwork') + (currentTall ? '-tall.mp4' : '.mp4');
  el.urlBox.textContent = currentAnim;
}

function closeModal() {
  closeMenu();
  el.modal.classList.remove('open');
  resetPreview();
  warmVideo(null);
}

// ── ⋯ menu ──
function closeMenu() {
  el.playerMenu.hidden = true;
  el.menuBtn.setAttribute('aria-expanded', 'false');
}

// Open above the button; flip below it when the body has been scrolled so the
// bar sits near the top of the card.
function openMenu() {
  el.playerMenu.hidden = false;
  el.menuBtn.setAttribute('aria-expanded', 'true');
  const c = el.playerCard.getBoundingClientRect();
  const b = el.menuBtn.getBoundingClientRect();
  const m = el.playerMenu.style;
  m.right = (c.right - b.right) + 'px';
  if (b.top - c.top >= el.playerMenu.offsetHeight + 12) {
    m.top = 'auto';
    m.bottom = (c.bottom - b.top + 6) + 'px';
  } else {
    m.bottom = 'auto';
    m.top = (b.bottom - c.top + 6) + 'px';
  }
}

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(el.urlBox.textContent);
    el.copyBtn.innerHTML = CHECK_HTML;
    setTimeout(() => { el.copyBtn.innerHTML = COPY_HTML; closeMenu(); }, 900);
  } catch {}
}

// ── Events ──
el.searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
el.searchInputNav.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });

el.searchInput.addEventListener('input', () => {
  el.searchClear.classList.toggle('show', el.searchInput.value.length > 0);
});
el.searchClear.addEventListener('click', () => {
  el.searchInput.value = '';
  el.searchClear.classList.remove('show');
  el.searchInput.focus();
});

el.modal.addEventListener('click', (e) => { if (e.target === el.modal) closeModal(); });
el.modalCloseBtn.addEventListener('click', closeModal);

el.sizeSeg.querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    el.sizeSeg.querySelectorAll('button').forEach(x => { x.classList.remove('active'); x.classList.remove('on'); });
    b.classList.add('active');
    b.classList.add('on');
    currentSize = Number(b.dataset.size);
    currentAnim = null;
    currentAnimDisplay = null;
    currentTall = false;
    el.orientSeg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.key === 'still'));
    el.resSeg.hidden = true;
    renderArt();
  });
});

el.filterSeg.querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    el.filterSeg.querySelectorAll('button').forEach(x => { x.classList.remove('active'); x.classList.remove('on'); });
    b.classList.add('active');
    b.classList.add('on');
    currentFilter = b.dataset.filter;
    renderGrid();
  });
});

el.copyBtn.addEventListener('click', copyUrl);
el.artMode.addEventListener('click', (e) => {
  const mode = e.target.closest('button')?.dataset.mode;
  if (mode) setArtMode(mode);
});

// Press-and-drag, like the iOS glass tab bar: pressing lifts the lens, dragging
// slides it under the pointer (the tab beneath it lights up), and releasing
// springs it into the nearest tab. A plain tap still goes through 'click'.
let drag = null;

function dragSlot(clientX) {
  const box = el.artMode;
  const r = box.getBoundingClientRect();
  const n = Number(box.style.getPropertyValue('--n')) || 3;
  const w = (r.width - 8) / n; // 4px capsule padding each side, as in CSS
  const x = Math.min(Math.max(clientX - r.left - 4 - w / 2, 0), (n - 1) * w);
  return { x, near: Math.round(x / w) };
}

el.artMode.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  drag = { startX: e.clientX, moved: false, near: -1 };
  clearTimeout(liftTimer);
  el.artMode.classList.add('lift');
});

el.artMode.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved) {
    if (Math.abs(e.clientX - drag.startX) < 4) return;
    drag.moved = true;
    // Capture only once it's a drag, so a plain tap still clicks its button.
    try { el.artMode.setPointerCapture(e.pointerId); } catch {}
    el.artMode.classList.add('dragging');
  }
  const { x, near } = dragSlot(e.clientX);
  drag.near = near;
  el.artMode.querySelector('.glass-ind').style.transform = `translateX(${x}px)`;
  el.artMode.querySelectorAll('button').forEach((b, k) => b.classList.toggle('peek', k === near));
});

function endDrag() {
  if (!drag) return;
  const { moved, near } = drag;
  drag = null;
  const box = el.artMode;
  box.classList.remove('dragging');
  box.querySelectorAll('button').forEach(b => b.classList.remove('peek'));
  box.querySelector('.glass-ind').style.removeProperty('transform'); // spring back to --i
  const target = moved ? box.querySelectorAll('button')[near] : null;
  if (target && !target.classList.contains('on')) {
    setArtMode(target.dataset.mode); // re-renders; that path drops the lift itself
  } else {
    liftTimer = setTimeout(() => box.classList.remove('lift'), moved ? 260 : 180);
  }
}
el.artMode.addEventListener('pointerup', endDrag);
el.artMode.addEventListener('pointercancel', endDrag);
el.prevBtn.addEventListener('click', () => { if (currentShownPos > 0) openModal(shownOrder[currentShownPos - 1]); });
el.nextBtn.addEventListener('click', () => { if (currentShownPos < shownOrder.length - 1) openModal(shownOrder[currentShownPos + 1]); });

el.adjBtn.addEventListener('click', () => {
  const show = el.adjustPanel.hidden;
  el.adjustPanel.hidden = !show;
  el.adjBtn.setAttribute('aria-expanded', String(show));
  closeMenu();
  if (show) el.adjustPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

el.menuBtn.addEventListener('click', () => {
  if (el.playerMenu.hidden) openMenu();
  else closeMenu();
});
el.dlBtn.addEventListener('click', closeMenu);
el.appleBtn.addEventListener('click', closeMenu);
document.addEventListener('click', (e) => {
  if (!el.playerMenu.hidden && !e.target.closest('#playerMenu, #menuBtn')) closeMenu();
});
document.querySelector('.player-body').addEventListener('scroll', closeMenu);

// Preview playback wiring
el.playBtn.addEventListener('click', () => {
  if (el.previewAudio.paused) el.previewAudio.play().catch(() => {});
  else el.previewAudio.pause();
});
el.volBar.addEventListener('input', () => {
  const a = el.previewAudio;
  a.volume = el.volBar.value / 100;
  if (a.muted && a.volume > 0) a.muted = false; // dragging the bar unmutes
  renderVolume();
  saveVolume();
});
el.muteBtn.addEventListener('click', () => {
  const a = el.previewAudio;
  a.muted = !a.muted;
  if (!a.muted && a.volume === 0) a.volume = 0.5; // unmuting from zero needs something audible
  renderVolume();
  saveVolume();
});
el.previewAudio.addEventListener('play', () => { el.playBtn.innerHTML = ICON_PAUSE; });
el.previewAudio.addEventListener('pause', () => { el.playBtn.innerHTML = ICON_PLAY; });
el.previewAudio.addEventListener('ended', () => { el.playBtn.innerHTML = ICON_PLAY; setProgress(0); });
el.previewAudio.addEventListener('loadedmetadata', () => {
  if (isFinite(el.previewAudio.duration)) el.durTime.textContent = '-' + fmtTime(el.previewAudio.duration);
});
el.previewAudio.addEventListener('timeupdate', () => {
  const a = el.previewAudio;
  const d = a.duration || 0;
  if (d) {
    setProgress((a.currentTime / d) * 100);
    el.durTime.textContent = '-' + fmtTime(d - a.currentTime);
  }
  el.curTime.textContent = fmtTime(a.currentTime);
});
el.seekBar.addEventListener('input', () => {
  const d = el.previewAudio.duration;
  el.seekBar.style.setProperty('--pct', el.seekBar.value + '%');
  if (isFinite(d)) el.previewAudio.currentTime = (el.seekBar.value / 100) * d;
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!el.playerMenu.hidden) closeMenu();
  else closeModal();
});

byId('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
});
