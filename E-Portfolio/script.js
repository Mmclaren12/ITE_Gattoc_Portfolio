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
const portfolioDatabaseName = 'mikaClassPortfolio';
const portfolioStoreName = 'documents';
let entries = [];
let staticEntries = [];
let localRecordsById = new Map();
let localDatabase;
const localObjectUrls = [];

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

function openPortfolioDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support local portfolio storage.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(portfolioDatabaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(portfolioStoreName)) {
        request.result.createObjectStore(portfolioStoreName, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error('Could not open local portfolio storage.'));
    request.onblocked = () => reject(new Error('Close other portfolio tabs and try again.'));
  });
}

function getLocalRecords(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(portfolioStoreName, 'readonly');
    const request = transaction.objectStore(portfolioStoreName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Could not read local portfolio entries.'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not read local portfolio entries.'));
  });
}

function saveLocalRecord(record) {
  return new Promise((resolve, reject) => {
    const transaction = localDatabase.transaction(portfolioStoreName, 'readwrite');
    transaction.objectStore(portfolioStoreName).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save this entry.'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not save this entry.'));
  });
}

function revokeLocalUrls() {
  for (const url of localObjectUrls.splice(0)) URL.revokeObjectURL(url);
}

function normalizeLocalAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') return null;
  if (attachment.blob instanceof Blob) {
    const url = URL.createObjectURL(attachment.blob);
    localObjectUrls.push(url);
    return {
      name: String(attachment.name || attachment.blob.name || 'Portfolio file'),
      type: String(attachment.type || attachment.blob.type || 'application/octet-stream'),
      size: Number(attachment.size) || attachment.blob.size,
      url
    };
  }
  return normalizeStaticAttachment(attachment, staticDataUrl);
}

function mergeAttachments(staticFiles, localFiles) {
  const merged = [];
  const keys = new Set();
  for (const file of [...(localFiles || []), ...(staticFiles || [])]) {
    const normalized = normalizeLocalAttachment(file);
    if (!normalized) continue;
    const key = normalized.name + '\u0000' + normalized.size;
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(normalized);
  }
  return merged;
}

async function hydrateStaticAttachment(attachment) {
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error('Could not read ' + attachment.name + ' from the published portfolio.');
  const blob = await response.blob();
  const file = new File([blob], attachment.name, { type: attachment.type || blob.type, lastModified: Date.now() });
  return { name: file.name, type: file.type || 'application/octet-stream', size: file.size, blob: file };
}

async function makeLocalRecord(entry) {
  return {
    id: entry.id,
    term: entry.term,
    category: entry.category,
    title: entry.title,
    instructions: entry.instructions || '',
    solution: entry.solution || '',
    results: entry.results || '',
    link: entry.link || '',
    createdAt: entry.createdAt || Date.now(),
    files: await Promise.all((entry.files || []).map(hydrateStaticAttachment)),
    screenshots: await Promise.all((entry.screenshots || []).map(hydrateStaticAttachment))
  };
}

async function loadPortfolioData() {
  staticEntries = await readStaticEntries();
  localDatabase = await openPortfolioDatabase();
  const localRecords = await getLocalRecords(localDatabase);
  localRecordsById = new Map(localRecords.filter(item => item && item.id).map(item => [String(item.id), item]));
  revokeLocalUrls();

  const combined = new Map(staticEntries.map(item => [item.id, item]));
  for (const record of localRecordsById.values()) {
    const id = String(record.id);
    const published = combined.get(id);
    const localEntry = {
      ...(published || {}),
      ...record,
      files: mergeAttachments(published?.files, record.files),
      screenshots: mergeAttachments(published?.screenshots, record.screenshots)
    };
    combined.set(id, localEntry);
  }
  entries = [...combined.values()];
  renderDocuments();
  statusMessage.textContent = 'Loaded ' + entries.length + ' entries. New uploads save in this browser profile.';
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

function appendFilePicker(form, labelText, name, accept) {
  const label = document.createElement('label');
  label.className = 'attachment-picker';
  label.append(document.createTextNode(labelText));
  const input = document.createElement('input');
  input.type = 'file';
  input.name = name;
  input.multiple = true;
  if (accept) input.accept = accept;
  label.append(input);
  form.append(label);
}

function createAttachmentEditor(item) {
  const form = document.createElement('form');
  form.className = 'entry-attachment-form';
  form.dataset.entryId = item.id;
  const heading = document.createElement('h5');
  heading.textContent = 'Add files to this entry';
  form.append(heading);
  appendFilePicker(form, 'Add documents', 'files');
  appendFilePicker(form, 'Add submission screenshots', 'screenshots', 'image/*');
  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Add selected files to this entry';
  const status = document.createElement('p');
  status.className = 'form-status';
  status.setAttribute('aria-live', 'polite');
  actions.append(button, status);
  form.append(actions);
  return form;
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
  content.append(createAttachmentEditor(item));

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

function storedAttachments(input) {
  return Array.from(input?.files || []).map(file => ({
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    blob: file
  }));
}

function setFormStatus(form, message, isError = false) {
  const status = form.querySelector('.form-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = isError ? 'error' : 'success';
}

async function handleNewEntry(form) {
  const title = String(form.elements.namedItem('title')?.value || '').trim();
  const files = storedAttachments(form.elements.namedItem('files'));
  const screenshots = storedAttachments(form.elements.namedItem('screenshots'));
  if (!title) return setFormStatus(form, 'Enter an activity or document title.', true);
  if (!files.length && !screenshots.length) return setFormStatus(form, 'Choose at least one document or screenshot.', true);

  const record = {
    id: createId(),
    term: form.dataset.term,
    category: String(form.elements.namedItem('category')?.value || 'other'),
    title,
    instructions: String(form.elements.namedItem('instructions')?.value || '').trim(),
    solution: String(form.elements.namedItem('solution')?.value || '').trim(),
    results: String(form.elements.namedItem('results')?.value || '').trim(),
    link: safeWebLink(String(form.elements.namedItem('link')?.value || '').trim()),
    createdAt: Date.now(),
    files,
    screenshots
  };

  try {
    await saveLocalRecord(record);
    form.reset();
    await loadPortfolioData();
    setFormStatus(form, 'Entry saved in this browser profile.');
  } catch (error) {
    const message = error?.name === 'QuotaExceededError'
      ? 'This browser is out of storage space. Remove large files or free browser storage, then try again.'
      : 'Could not save this entry. ' + (error?.message || 'Try again.');
    setFormStatus(form, message, true);
  }
}

async function handleAttachmentAdd(form) {
  const files = storedAttachments(form.elements.namedItem('files'));
  const screenshots = storedAttachments(form.elements.namedItem('screenshots'));
  if (!files.length && !screenshots.length) return setFormStatus(form, 'Choose at least one document or screenshot.', true);
  const id = form.dataset.entryId;

  try {
    let record = localRecordsById.get(id);
    if (!record) {
      const published = staticEntries.find(item => item.id === id);
      if (!published) throw new Error('Could not find this entry. Reload the portfolio and try again.');
      record = await makeLocalRecord(published);
    }
    record.files = [...(record.files || []), ...files];
    record.screenshots = [...(record.screenshots || []), ...screenshots];
    await saveLocalRecord(record);
    localRecordsById.set(id, record);
    form.reset();
    await loadPortfolioData();
    const updatedForm = [...document.querySelectorAll('.entry-attachment-form')].find(item => item.dataset.entryId === id);
    setFormStatus(updatedForm || form, 'Files added to this entry in this browser profile.');
  } catch (error) {
    const message = error?.name === 'QuotaExceededError'
      ? 'This browser is out of storage space. Remove large files or free browser storage, then try again.'
      : 'Could not add these files. ' + (error?.message || 'Try again.');
    setFormStatus(form, message, true);
  }
}

document.addEventListener('submit', event => {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form) return;
  if (form.matches('.entry-form')) {
    event.preventDefault();
    void handleNewEntry(form);
  } else if (form.matches('.entry-attachment-form')) {
    event.preventDefault();
    void handleAttachmentAdd(form);
  }
});

async function initializePortfolio() {
  try {
    await loadPortfolioData();
  } catch (error) {
    revokeLocalUrls();
    entries = staticEntries;
    renderDocuments();
    statusMessage.textContent = 'Loaded the published entries, but browser uploads are unavailable. ' + error.message;
  }
}

initializePortfolio();
