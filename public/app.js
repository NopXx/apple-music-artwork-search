const byId = (id) => document.getElementById(id);

const el = {
  searchInput: byId('searchInput'),
  searchInputInline: byId('searchInputInline'),
  searchClear: byId('searchClear'),
  searchClearInline: byId('searchClearInline'),
  heroSection: byId('heroSection'),
  status: byId('status'),
  resultsSection: byId('results-section'),
  resultCount: byId('resultCount'),
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
  const term = el.searchInputInline.value.trim() || el.searchInput.value.trim();
  if (!term) return;

  el.searchInput.value = term;
  el.searchInputInline.value = term;

  el.heroSection.classList.add('hidden');
  el.resultsSection.style.display = 'none';
  el.status.style.display = '';
  el.status.className = 'loading';
  el.status.innerHTML = '<div class="spinner"></div>Searching\u2026';

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

function renderGrid() {
  el.grid.innerHTML = lastResults.map((it, i) => `
    <div class="card" data-index="${i}" style="animation-delay:${Math.min(i * 40, 400)}ms">
      <img class="card-art" src="${it.artwork}" loading="lazy" alt="${escapeHtml(it.track)}">
      <div class="card-meta">
        <div class="card-title">${escapeHtml(it.track)}</div>
        <div class="card-artist">${escapeHtml(it.artist)}</div>
      </div>
    </div>
  `).join('');

  el.resultCount.textContent = `${lastResults.length} result${lastResults.length !== 1 ? 's' : ''}`;
  el.resultsSection.style.display = 'block';
  el.status.style.display = 'none';

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
  el.animRow.style.display = 'none';
  el.resSeg.innerHTML = '';
  el.orientSeg.innerHTML = '';

  el.sizeSeg.querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', b.dataset.size === '1000')
  );

  const anim = it.animation;
  if (anim) {
    const square = anim.square || {};
    const tall = anim.tall || {};
    const hasSquare = Object.keys(square).length > 0;
    const hasTall = Object.keys(tall).length > 0;

    if (hasSquare || hasTall) {
      el.animRow.style.display = '';

      const orientations = [];
      if (hasSquare) orientations.push({ key: 'square', label: 'Square 1:1', map: square });
      if (hasTall) orientations.push({ key: 'tall', label: 'Tall 9:16', map: tall });

      const renderResButtons = (map) => {
        const keys = Object.keys(map).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
        const preferred = keys.find(k => parseInt(k, 10) <= 1080) || keys[0];
        el.resSeg.innerHTML = keys.map(k =>
          `<button data-url="${map[k]}" ${k === preferred ? 'class="active"' : ''}>${k}</button>`
        ).join('');
        el.resSeg.querySelectorAll('button').forEach(b => {
          b.addEventListener('click', () => {
            el.resSeg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            currentAnim = b.dataset.url;
            renderArt();
          });
        });
        currentAnim = map[preferred];
      };

      el.orientSeg.innerHTML = orientations.map((o, idx) =>
        `<button data-key="${o.key}" ${idx === 0 ? 'class="active"' : ''}>${o.label}</button>`
      ).join('');

      el.orientSeg.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => {
          el.orientSeg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          const o = orientations.find(x => x.key === b.dataset.key);
          currentTall = o.key === 'tall';
          renderResButtons(o.map);
          renderArt();
        });
      });

      currentTall = orientations[0].key === 'tall';
      renderResButtons(orientations[0].map);
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

el.searchInputInline.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') search();
});

el.searchInput.addEventListener('input', () => {
  el.searchClear.classList.toggle('visible', el.searchInput.value.length > 0);
});

el.searchInputInline.addEventListener('input', () => {
  el.searchClearInline.classList.toggle('visible', el.searchInputInline.value.length > 0);
});

el.searchClear.addEventListener('click', () => {
  el.searchInput.value = '';
  el.searchClear.classList.remove('visible');
  el.searchInput.focus();
});

el.searchClearInline.addEventListener('click', () => {
  el.searchInputInline.value = '';
  el.searchClearInline.classList.remove('visible');
  el.searchInputInline.focus();
});

el.modal.addEventListener('click', (e) => {
  if (e.target === el.modal) closeModal();
});

el.modalCloseBtn.addEventListener('click', closeModal);

el.sizeSeg.querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    el.sizeSeg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    currentSize = Number(b.dataset.size);
    currentAnim = null;
    currentTall = false;
    el.resSeg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    renderArt();
  });
});

el.dlBtn.addEventListener('click', () => {});
el.copyBtn.addEventListener('click', copyUrl);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
