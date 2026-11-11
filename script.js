const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#site-nav');
const themeButton = document.querySelector('#theme-toggle');
const searchInput = document.querySelector('#entry-search');
const statusMessage = document.querySelector('#entry-status');
const staticDataUrl = new URL('./portfolio-data.json', window.location.href);
const knownTerms = new Set(['prelim', 'midterm', 'final']);
const categoryLabels = {
  classroom: 'Classroom Activities and Exercises',
  laboratory: 'Laboratory Activities',
  quiz: 'Quizzes and Assessments',
  project: 'Projects and Performance Tasks',
  exam: 'Examination Results',
  other: 'Other course material'
};
const categoryOrder = Object.keys(categoryLabels);
const titleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
let entries = [];

function createId() {
  return (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}

function safeWebLink(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function normalizeStaticAttachment(attachment, manifestUrl) {
  if (!attachment || typeof attachment !== 'object') return null;
  const name = String(attachment.name || 'Portfolio file');
  if (typeof attachment.dataUrl === 'string') {
    const comma = attachment.dataUrl.indexOf(',');
    const header = comma > 0 ? attachment.dataUrl.slice(0, comma) : '';
    if (/^data:[^;,]+;base64$/i.test(header)) {
      const type = String(attachment.type || header.slice(5, header.indexOf(';')) || 'application/octet-stream');
      return { name, type, size: Number(attachment.size) || 0, url: attachment.dataUrl };
    }
  }
  if (typeof attachment.src === 'string' && attachment.src.trim()) {
    try {
      const url = new URL(attachment.src, manifestUrl);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      return {
        name,
        type: String(attachment.type || 'application/octet-stream'),
        size: Number(attachment.size) || 0,
        url: url.href
      };
    } catch {}
  }
  return null;
}

async function readStaticEntries() {
  if (window.location.protocol === 'file:') {
    throw new Error('Open the portfolio through VS Code Live Server or GitHub Pages so it can load portfolio-data.json.');
  }
  const response = await fetch(staticDataUrl, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Could not load portfolio-data.json (HTTP ' + response.status + ').');
  const staticData = await response.json();
  if (!staticData || !Array.isArray(staticData.entries)) {
    throw new Error('portfolio-data.json must contain an entries array.');
  }
  return staticData.entries
    .filter((item) => item && knownTerms.has(item.term) && typeof item.title === 'string' && item.title.trim())
    .map((item) => ({
      id: String(item.id || createId()),
      term: item.term,
      category: categoryLabels[item.category] ? item.category : 'other',
      title: item.title.slice(0, 120),
      instructions: String(item.instructions || ''),
      solution: String(item.solution || ''),
      results: String(item.results || ''),
      link: safeWebLink(item.link),
      createdAt: item.createdAt || Date.now(),
      files: (Array.isArray(item.files) ? item.files : []).map((file) => normalizeStaticAttachment(file, staticDataUrl)).filter(Boolean),
      screenshots: (Array.isArray(item.screenshots) ? item.screenshots : []).map((file) => normalizeStaticAttachment(file, staticDataUrl)).filter(Boolean)
    }));
}

function formatBytes(size) {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / (1024 * 1024)).toFixed(1) + ' MB';
}

function appendDetail(container, label, value) {
  if (!value) return;
  const paragraph = document.createElement('p');
  paragraph.className = 'document-detail';
  const heading = document.createElement('strong');
  heading.textContent = label;
  const text = document.createElement('span');
  text.textContent = value;
  paragraph.append(heading, text);
  container.append(paragraph);
}

function createDocumentCard(item, expandedEntryIds) {
  const card = document.createElement('article');
  card.className = 'entry-item';
  card.dataset.entryId = item.id;

  const disclosure = document.createElement('details');
  disclosure.className = 'entry-disclosure';
  disclosure.open = expandedEntryIds.has(item.id);
  const summary = document.createElement('summary');
  summary.className = 'entry-summary';
  summary.addEventListener('click', () => {
    for (const openDisclosure of document.querySelectorAll('.entry-disclosure[open]')) {
      if (openDisclosure !== disclosure) openDisclosure.open = false;
    }
  });
  const title = document.createElement('span');
  title.className = 'entry-summary-title';
  title.textContent = item.title;
  summary.append(title);
  disclosure.append(summary);

  const content = document.createElement('div');
  content.className = 'entry-content';
  const heading = document.createElement('div');
  heading.className = 'document-heading';
  const badge = document.createElement('span');
  badge.className = 'category-badge';
  badge.textContent = categoryLabels[item.category] || categoryLabels.other;
  heading.append(badge);
  content.append(heading);

  const createdAt = new Date(item.createdAt);
  if (Number.isFinite(createdAt.getTime())) {
    const date = document.createElement('p');
    date.className = 'entry-date';
    date.textContent = 'Added ' + new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(createdAt);
    content.append(date);
  }

  const primarySection = document.createElement('section');
  primarySection.className = 'document-section';
  const primaryHeading = document.createElement('h5');
  primaryHeading.textContent = 'Primary document';
  primarySection.append(primaryHeading);
  const files = document.createElement('ul');
  files.className = 'document-files';
  for (const file of item.files || []) {
    if (!file || !file.url) continue;

    const fileName = file.name || 'Uploaded document';
    const fileType = String(file.type || 'application/octet-stream');
    const fileSize = Number(file.size) || 0;
    const fileUrl = file.url;

    const row = document.createElement('li');
    row.className = 'document-file';
    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = fileType.startsWith('image/') ? '▧' : '▤';
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = fileName;
    const download = document.createElement('a');
    download.href = fileUrl;
    download.download = fileName;
    download.className = 'file-download';
    download.textContent = 'Download';
    download.setAttribute('aria-label', 'Download ' + fileName);
    const size = document.createElement('span');
    size.className = 'file-size';
    size.textContent = fileType + ' · ' + formatBytes(fileSize);
    row.append(icon, name, download, size);

    if (/^image\/(png|jpeg|gif|webp)$/i.test(fileType)) {
      const preview = document.createElement('img');
      preview.className = 'file-preview';
      preview.src = fileUrl;
      preview.alt = 'Preview of ' + fileName;
      preview.loading = 'lazy';
      row.append(preview);
    } else if (fileType === 'application/pdf' || /\.pdf$/i.test(fileName)) {
      const preview = document.createElement('iframe');
      preview.className = 'file-preview file-preview-pdf';
      preview.src = fileUrl + '#toolbar=0';
      preview.title = 'Preview of ' + fileName;
      preview.loading = 'lazy';
      row.append(preview);
    }
    files.append(row);
  }
  if (files.childElementCount) primarySection.append(files);
  else {
    const emptyPrimary = document.createElement('p');
    emptyPrimary.className = 'screenshot-empty';
    emptyPrimary.textContent = 'No primary document attached to this entry.';
    primarySection.append(emptyPrimary);
  }
  content.append(primarySection);

  const screenshots = (Array.isArray(item.screenshots) ? item.screenshots : [])
    .filter((screenshot) => screenshot && screenshot.url);
  const screenshotSection = document.createElement('section');
  screenshotSection.className = 'document-section screenshot-section';
  const screenshotHeading = document.createElement('h5');
  screenshotHeading.textContent = 'Submission screenshots';
  screenshotSection.append(screenshotHeading);
  if (screenshots.length) {
    const screenshotGrid = document.createElement('div');
    screenshotGrid.className = 'screenshot-grid';
    for (const screenshot of screenshots) {
      const figure = document.createElement('figure');
      figure.className = 'screenshot-card';
      const preview = document.createElement('div');
      preview.className = 'screenshot-preview';
      const image = document.createElement('img');
      image.src = screenshot.url;
      image.alt = 'Submission screenshot: ' + screenshot.name + ' for ' + item.title;
      image.loading = 'lazy';
      image.decoding = 'async';
      preview.append(image);
      const caption = document.createElement('figcaption');
      caption.className = 'screenshot-caption';
      const fileName = document.createElement('span');
      fileName.className = 'screenshot-name';
      fileName.textContent = screenshot.name;
      caption.append(fileName);
      figure.append(caption, preview);
      screenshotGrid.append(figure);
    }
    screenshotSection.append(screenshotGrid);
  } else {
    const emptyScreenshots = document.createElement('p');
    emptyScreenshots.className = 'screenshot-empty';
    emptyScreenshots.textContent = 'No submission screenshots attached yet.';
    screenshotSection.append(emptyScreenshots);
  }
  content.append(screenshotSection);

  const details = document.createElement('section');
  details.className = 'document-details';
  const detailsHeading = document.createElement('h5');
  detailsHeading.textContent = 'Activity details';
  details.append(detailsHeading);
  appendDetail(details, 'Instructions or problem statement', item.instructions);
  appendDetail(details, 'Code, procedures, or solutions', item.solution);
  appendDetail(details, 'Results explanation', item.results);
  if (item.link) {
    const link = document.createElement('a');
    link.href = safeWebLink(item.link);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'related-link';
    link.textContent = 'Open related link';
    details.append(link);
  }
  if (details.childElementCount > 1) content.append(details);

  disclosure.append(content);
  card.append(disclosure);
  return card;
}

function renderDocuments() {
  const query = (searchInput.value || '').trim().toLocaleLowerCase();
  const expandedEntry = document.querySelector('.entry-item details[open]');
  const expandedEntryId = expandedEntry?.closest('.entry-item')?.dataset.entryId;
  const expandedEntryIds = new Set(expandedEntryId ? [expandedEntryId] : []);
  for (const term of knownTerms) {
    const list = document.querySelector('[data-entry-list="' + term + '"]');
    const empty = document.querySelector('[data-empty-state="' + term + '"]');
    const count = document.querySelector('[data-count="' + term + '"]');
    const matching = entries.filter((item) => {
      if (item.term !== term) return false;
      const fileNames = [...(item.files || []), ...(item.screenshots || [])]
        .map((file) => file?.name || '').join(' ');
      const searchable = [
        item.title, categoryLabels[item.category], item.instructions,
        item.solution, item.results, fileNames
      ].join(' ').toLocaleLowerCase();
      return !query || searchable.includes(query);
    }).sort((first, second) => {
      const firstCategory = categoryLabels[first.category] ? first.category : 'other';
      const secondCategory = categoryLabels[second.category] ? second.category : 'other';
      const categoryDifference = categoryOrder.indexOf(firstCategory) - categoryOrder.indexOf(secondCategory);
      if (categoryDifference) return categoryDifference;
      const titleDifference = titleCollator.compare(first.title || '', second.title || '');
      if (titleDifference) return titleDifference;
      return (first.createdAt || 0) - (second.createdAt || 0);
    });

    const categoryGroups = categoryOrder.flatMap((category) => {
      const categoryItems = matching.filter((item) => (categoryLabels[item.category] ? item.category : 'other') === category);
      if (!categoryItems.length) return [];

      const group = document.createElement('section');
      group.className = 'entry-category-group';
      const groupHeading = document.createElement('div');
      groupHeading.className = 'entry-category-heading';
      const groupTitle = document.createElement('h4');
      groupTitle.textContent = categoryLabels[category];
      const groupCount = document.createElement('span');
      groupCount.textContent = categoryItems.length + (categoryItems.length === 1 ? ' entry' : ' entries');
      groupHeading.append(groupTitle, groupCount);
      const groupList = document.createElement('div');
      groupList.className = 'entry-category-list';
      groupList.append(...categoryItems.map((item) => createDocumentCard(item, expandedEntryIds)));
      group.append(groupHeading, groupList);
      return [group];
    });

    list.replaceChildren(...categoryGroups);
    count.textContent = matching.length + (matching.length === 1 ? ' item' : ' items');
    empty.hidden = matching.length > 0;
    empty.textContent = query
      ? 'No matching course materials. Clear the search to see all published entries.'
      : 'No course materials have been published in this section yet.';
  }
}

searchInput.addEventListener('input', renderDocuments);

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const light = theme === 'light';
  themeButton.setAttribute('aria-pressed', String(light));
  themeButton.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
  try { localStorage.setItem('mikaClassPortfolioThemeEditorial', theme); } catch {}
}
let savedTheme = 'light';
try { savedTheme = localStorage.getItem('mikaClassPortfolioThemeEditorial') || 'light'; } catch {}
setTheme(savedTheme === 'dark' ? 'dark' : 'light');
themeButton.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});

function closeNavigation() {
  navigation.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation');
}
menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation');
  navigation.classList.toggle('is-open', !isOpen);
});
let navFeedbackTimer;
navigation.addEventListener('click', (event) => {
  const clickedLink = event.target instanceof Element
    ? event.target.closest('a[href^="#"]')
    : null;
  if (!clickedLink) return;

  for (const link of navigation.querySelectorAll('a[href^="#"]')) {
    link.removeAttribute('aria-current');
    link.classList.remove('is-activating');
  }
  clickedLink.setAttribute('aria-current', 'location');
  void clickedLink.offsetWidth;
  clickedLink.classList.add('is-activating');
  window.clearTimeout(navFeedbackTimer);
  navFeedbackTimer = window.setTimeout(() => clickedLink.classList.remove('is-activating'), 380);
  closeNavigation();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeNavigation();
});

if ('IntersectionObserver' in window) {
  const links = [...navigation.querySelectorAll('a[href^="#"]')];
  const observer = new IntersectionObserver((observed) => {
    const current = observed.filter((item) => item.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!current) return;
    for (const link of links) {
      if (link.hash === '#' + current.target.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }, { rootMargin: '-18% 0px -68% 0px', threshold: [0, .2, .5, .8] });
  for (const section of document.querySelectorAll('main section[id]')) observer.observe(section);
}

async function initializePortfolio() {
  try {
    entries = await readStaticEntries();
    renderDocuments();
    statusMessage.textContent = 'Loaded ' + entries.length + ' published entries.';
  } catch (error) {
    entries = [];
    renderDocuments();
    statusMessage.textContent = 'Could not load the published portfolio documents. ' + error.message;
  }
}

initializePortfolio();
