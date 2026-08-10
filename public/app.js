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
  modalArtwork: byId('modalArtwork'),
  modalCloseBtn: byId('modalCloseBtn'),
  mTitle: byId('mTitle'),
  mArtist: byId('mArtist'),
  sizeSeg: byId('sizeSeg'),
  orientSeg: byId('orientSeg'),
  resSeg: byId('resSeg'),
  animRow: byId('animRow'),
  dlBtn: byId('dlBtn'),
  copyBtn: byId('copyBtn'),
  appleBtn: byId('appleBtn'),
  urlBox: byId('urlBox'),
};

let lastResults = [];
let currentFilter = 'all';
let current = null;
let currentSize = 1000;
let currentAnim = null;
let currentTall = false;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function urlForSize(it, size) {
  if (!it.artworkSmall) return it.artwork;
  return it.artworkSmall.replace(/\/\d+x\d+bb\.(jpg|png)/i, `/${size}x${size}bb.$1`);
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
  el.status.textContent = 'Searching\u2026';

  try {
    const r = await fetch('/api/search?term=' + encodeURIComponent(term));
    const data = await r.json();
    lastResults = data.results || [];

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

function hasMotion(it) {
  return !!(it.animation && (it.animation.best || it.animation.bestTall));
}

function renderGrid() {
  // Keep original indices so openModal(lastResults[i]) stays correct after filtering.
  const shown = lastResults
    .map((it, i) => ({ it, i }))
    .filter(({ it }) =>
      currentFilter === 'motion' ? hasMotion(it) :
      currentFilter === 'static' ? !hasMotion(it) : true);

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

function openModal(i) {
  const it = lastResults[i];
  if (!it) return;
  current = it;
  currentSize = 1000;
  currentAnim = null;
  currentTall = false;

  el.mTitle.textContent = it.track;
  el.mArtist.textContent = it.artist + (it.album ? ' \u00b7 ' + it.album : '');
  el.appleBtn.href = it.trackViewUrl || it.collectionViewUrl || '#';
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

      const renderResButtons = (map) => {
        const keys = Object.keys(map).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
        const preferred = keys.find(k => parseInt(k, 10) <= 1080) || keys[0];
        el.resSeg.innerHTML = `<select>${keys.map(k =>
          `<option value="${map[k]}" ${k === preferred ? 'selected' : ''}>${k}</option>`
        ).join('')}</select>`;
        const sel = el.resSeg.querySelector('select');
        sel.addEventListener('change', () => {
          currentAnim = sel.value;
          renderArt();
        });
        currentAnim = map[preferred];
      };

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
  el.modal.classList.add('open');
}

function renderArt() {
  const art = el.modalArtwork;
  art.classList.toggle('tall', !!currentAnim && currentTall);

  if (currentAnim) {
    const badge = currentTall ? 'Tall \u00b7 9:16' : 'Square \u00b7 1:1';
    art.innerHTML =
      `<video src="${currentAnim}" autoplay loop muted playsinline></video>` +
      `<div class="badge">${badge}</div>`;
    el.dlBtn.href = currentAnim;
    el.dlBtn.download = (current.track || 'artwork') + (currentTall ? '-tall.mp4' : '.mp4');
    el.urlBox.textContent = currentAnim;
  } else {
    const url = urlForSize(current, currentSize);
    art.innerHTML =
      `<img src="${url}" alt="">` +
      `<div class="badge">${currentSize}\u00d7${currentSize}</div>`;
    el.dlBtn.href = url;
    el.dlBtn.download = (current.track || 'artwork') + `-${currentSize}.jpg`;
    el.urlBox.textContent = url;
  }
}

function closeModal() {
  el.modal.classList.remove('open');
}

async function copyUrl() {
  const url = el.urlBox.textContent;
  try {
    await navigator.clipboard.writeText(url);
    el.copyBtn.querySelector('span').textContent = 'Copied!';
    setTimeout(() => { el.copyBtn.querySelector('span').textContent = 'Copy URL'; }, 1200);
  } catch {}
}

el.searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') search();
});

el.searchInputNav.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') search();
});

el.searchInput.addEventListener('input', () => {
  el.searchClear.classList.toggle('show', el.searchInput.value.length > 0);
});

el.searchClear.addEventListener('click', () => {
  el.searchInput.value = '';
  el.searchClear.classList.remove('show');
  el.searchInput.focus();
});

el.modal.addEventListener('click', (e) => {
  if (e.target === el.modal) closeModal();
});

el.modalCloseBtn.addEventListener('click', closeModal);

el.sizeSeg.querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    el.sizeSeg.querySelectorAll('button').forEach(x => { x.classList.remove('active'); x.classList.remove('on'); });
    b.classList.add('active');
    b.classList.add('on');
    currentSize = Number(b.dataset.size);
    currentAnim = null;
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

el.dlBtn.addEventListener('click', () => {});
el.copyBtn.addEventListener('click', copyUrl);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

byId('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
});
