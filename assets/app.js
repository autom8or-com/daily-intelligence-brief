/* ============================================
   Daily Intelligence Brief — App Logic
   Timeline, filters, deadlines, dedup
   ============================================ */

// Load data
let archive = { articles: [], deadlines: [], meta: {} };
let filteredArticles = [];

const API_BASE = window.location.pathname.replace(/\/$/, '') || '';

async function loadArchive() {
  try {
    const resp = await fetch(API_BASE + '/digests/index.json');
    if (!resp.ok) throw new Error('Not found');
    archive = await resp.json();
    document.getElementById('loading').classList.add('hidden');
    render();
  } catch (e) {
    // Try loading example data for development
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('empty-state').querySelector('p').textContent =
      'No brief data yet. The cron job will populate this after the next run.';
  }
}

// Render everything
function render() {
  const articles = archive.articles || [];
  const deadlines = archive.deadlines || [];
  const meta = archive.meta || {};

  // Header meta
  document.getElementById('brief-count').textContent =
    `${articles.length} articles · ${countDays(articles)} days`;

  const lastDate = articles.length > 0 ? articles[articles.length - 1].date : null;
  document.getElementById('last-updated').textContent =
    lastDate ? `Last brief: ${formatDate(lastDate)}` : '—';

  // Deadline badge
  const deadlineBadge = document.getElementById('deadline-count');
  if (deadlines.length > 0) {
    deadlineBadge.textContent = deadlines.length;
    deadlineBadge.classList.add('visible');
  } else {
    deadlineBadge.classList.remove('visible');
  }

  // Deadline panel
  renderDeadlines(deadlines);

  // Articles
  applyFilters();
}

function countDays(articles) {
  const days = new Set(articles.map(a => a.date));
  return days.size;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ======= Deadline Rendering =======
function renderDeadlines(deadlines) {
  const panel = document.getElementById('deadline-panel');
  const list = document.getElementById('deadline-list');

  if (!deadlines || deadlines.length === 0) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  list.innerHTML = deadlines
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(d => {
      const daysLeft = Math.ceil((new Date(d.date + 'T23:59:59Z') - new Date()) / (1000 * 60 * 60 * 24));
      const urgent = daysLeft <= 3;
      return `
        <div class="deadline-item${urgent ? ' urgent' : ''}">
          <span class="deadline-icon-item">${urgent ? '🔴' : '⏰'}</span>
          <div class="deadline-info">
            <span class="deadline-title">${escapeHtml(d.title)}</span>
            <span class="deadline-meta">First noted: ${formatDate(d.first_seen)}${d.source ? ' · ' + escapeHtml(d.source) : ''}</span>
          </div>
          <span class="deadline-countdown">${daysLeft}d</span>
        </div>
      `;
    })
    .join('');
}

// ======= Filtering =======
function applyFilters() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  const activeFilter = document.querySelector('.filter-pill.active');
  const filter = activeFilter ? activeFilter.dataset.filter : 'all';

  let articles = archive.articles || [];

  // Filter
  if (filter === 'deadline') {
    articles = articles.filter(a => a.tags && a.tags.includes('deadline'));
  } else if (filter === 'duplicate') {
    articles = articles.filter(a => a.duplicate_of);
  } else if (filter !== 'all') {
    articles = articles.filter(a => a.tags && a.tags.includes(filter));
  }

  // Search
  if (query) {
    articles = articles.filter(a =>
      (a.title && a.title.toLowerCase().includes(query)) ||
      (a.angle && a.angle.toLowerCase().includes(query)) ||
      (a.source && a.source.toLowerCase().includes(query))
    );
  }

  filteredArticles = articles;
  renderTimeline(articles);
}

// ======= Timeline Rendering =======
function renderTimeline(articles) {
  const timeline = document.getElementById('timeline');
  const empty = document.getElementById('empty-state');

  if (articles.length === 0) {
    timeline.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  // Group by date
  const groups = {};
  for (const a of articles) {
    if (!groups[a.date]) groups[a.date] = [];
    groups[a.date].push(a);
  }

  const sortedDates = Object.keys(groups).sort().reverse();

  timeline.innerHTML = sortedDates.map(date => {
    const items = groups[date];
    return `
      <div class="day-group">
        <div class="day-header">
          <span class="day-date">${formatDayDate(date)}</span>
          <span class="day-line"></span>
          <span class="day-count">${items.length}</span>
        </div>
        ${items.map(a => renderArticle(a)).join('')}
      </div>
    `;
  }).join('');

  // Attach click handlers
  document.querySelectorAll('.article').forEach(el => {
    el.addEventListener('click', function(e) {
      // Don't toggle when clicking links inside
      if (e.target.tagName === 'A') return;
      this.classList.toggle('open');
    });
  });
}

function renderArticle(a) {
  const tags = a.tags || [];
  const tagBadges = tags.map(t => {
    const cls = `tag-${t}`;
    const label = t.charAt(0).toUpperCase() + t.slice(1);
    return `<span class="tag ${cls}">${label}</span>`;
  }).join('');

  const dupBadge = a.duplicate_of
    ? `<span class="dup-indicator">🔁 same as ${formatDate(a.duplicate_of)}</span>`
    : '';

  return `
    <div class="article${a.duplicate_of ? ' is-duplicate' : ''}">
      <div class="article-header">
        <span class="article-toggle">▶</span>
        <div class="article-content">
          <div class="article-title">${escapeHtml(a.title)}${dupBadge}</div>
          <div class="article-meta">
            <span class="article-source">${escapeHtml(a.source || '')}</span>
            ${tagBadges ? `<div class="article-tags">${tagBadges}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="article-body">
        ${a.angle ? `<div class="angle-label">Your angle</div><div class="angle-text">${escapeHtml(a.angle)}</div>` : ''}
        ${a.summary ? `<p>${escapeHtml(a.summary)}</p>` : ''}
        ${a.url ? `<div class="article-links"><a href="${escapeHtml(a.url)}" target="_blank">🔗 Read more</a></div>` : ''}
      </div>
    </div>
  `;
}

function formatDayDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
  return d.toLocaleDateString('en-US', options);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ======= Event Listeners =======
document.addEventListener('DOMContentLoaded', () => {
  loadArchive();

  // Filter clicks
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
  });

  // Search with debounce
  let debounceTimer;
  document.getElementById('search-input').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyFilters, 200);
  });

  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('brief-theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light');
    themeToggle.textContent = '◑';
  }
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light');
    const isLight = document.body.classList.contains('light');
    themeToggle.textContent = isLight ? '◑' : '◐';
    localStorage.setItem('brief-theme', isLight ? 'light' : 'dark');
  });
});
