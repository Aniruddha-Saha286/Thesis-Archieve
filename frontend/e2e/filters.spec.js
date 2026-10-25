import { test, expect } from '@playwright/test';

const paper = { id: 'filter-fixture', _id: 'filter-fixture', title: 'Synthetic filter audit paper', abstract: 'Browser fixture for testing filter controls.', authors: [{ name: 'Test Author' }], publishedYear: 2025, publicationType: 'thesis', source: 'local', metrics: { citationCount: 120 } };

async function installFixtures(page) {
  const catalog = [], radar = [];
  await page.addInitScript(() => localStorage.setItem('thesis_vault_token', 'synthetic-test-token'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let body = {};
    if (path === '/api/auth/me') body = { user: { id: 'fixture-user', role: 'student', status: 'approved', isProfileComplete: true, name: 'Test Reader', email: 'test@example.org' } };
    else if (path === '/api/system/status') body = { maintenance: { enabled: false } };
    else if (path === '/api/thesis') {
      catalog.push(Object.fromEntries(url.searchParams));
      if (Number(url.searchParams.get('yearMin')) > Number(url.searchParams.get('yearMax')) && url.searchParams.get('yearMax')) return route.fulfill({ status: 400, json: { message: 'Start year must not exceed end year.' } });
      body = { records: [paper], pagination: { hasMore: true }, sessionId: 'fixture-session', totalReturned: 40 };
    } else if (path === '/api/research/radar') {
      radar.push(Object.fromEntries(url.searchParams));
      body = { records: [paper], sync: [], nextCursor: url.searchParams.has('cursor') ? null : 'fixture-cursor', health: { hasIndexedPapers: true, ingestionEnabled: true, state: 'indexed' } };
    } else if (path === '/api/institutions/suggest') body = [{ id: 'I123', name: 'Fixture University', countryCode: 'BD', type: 'education' }];
    else if (path === '/api/thesis/suggest') body = [];
    else if (path.includes('membership')) body = { plan: 'free', entitlements: { quotas: {} } };
    else if (['/api/subjects', '/api/thesis/publishers/list', '/api/user/notifications', '/api/user/alerts', '/api/user/saved-papers'].includes(path)) body = [];
    await route.fulfill({ json: body });
  });
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('https://accounts.google.com/**', route => route.abort());
  return { catalog, radar };
}

const last = requests => requests.at(-1) || {};
async function hasParams(requests, expected) {
  await expect.poll(() => Object.fromEntries(Object.keys(expected).map(key => [key, last(requests)[key] ?? '']))).toEqual(expected);
}
async function openFilters(page) {
  const drawer = page.getByRole('button', { name: /^More filters/ });
  if (await drawer.isVisible()) await drawer.click();
  return page.getByRole('complementary', { name: 'Search filters' });
}

test('every catalog control combines, persists on reload, and fully resets', async ({ page }) => {
  const { catalog } = await installFixtures(page);
  await page.goto('/?q=coastal');
  await hasParams(catalog, { search: 'coastal' });
  await page.getByLabel('Publication type', { exact: true }).selectOption('thesis');
  for (const name of ['Has code', 'Has open dataset', 'Has a PDF', 'Open access']) await page.getByRole('checkbox', { name, exact: true }).check();
  const panel = await openFilters(page);
  await panel.getByRole('button', { name: /^Publisher/ }).click();
  await panel.getByRole('button', { name: 'IEEE', exact: true }).click();
  await panel.getByRole('button', { name: 'AI & ML', exact: true }).click();
  await panel.getByRole('button', { name: /^Publication Year/ }).click();
  await page.getByLabel('Filter from publication year').fill('2020');
  await page.getByLabel('Filter to publication year').fill('2025');
  await page.getByLabel('Search venue', { exact: true }).selectOption('cvpr');
  await page.getByLabel('Search universities').fill('Fixture');
  await expect(page.getByRole('option', { name: /Fixture University/ })).toBeVisible();
  await page.getByLabel('Search universities').press('ArrowDown');
  await page.getByLabel('Search universities').press('Enter');
  await panel.getByRole('button', { name: 'Awarding (Theses)', exact: true }).click();
  await panel.getByRole('button', { name: /^Country/ }).click();
  await panel.getByTitle('Filter by Bangladesh (BD)', { exact: true }).click();
  await panel.getByLabel('Country code').fill('FR');
  await panel.getByRole('button', { name: '+ Add', exact: true }).click();
  await panel.getByRole('button', { name: /^Citation Impact/ }).click();
  await panel.getByRole('button', { name: '100+', exact: true }).click();
  await page.getByText('Bangladesh university & program shortcuts', { exact: true }).click();
  await page.getByLabel('Degree shortcut').selectOption('msc');
  await page.getByLabel('Program shortcut').selectOption('cse');
  await page.getByLabel('Sort results', { exact: true }).selectOption('citations');
  const expected = { search: 'coastal', publicationType: 'thesis', hasCode: 'true', hasOpenDataset: 'true', hasPdf: 'true', isOpenAccess: 'true', publisher: 'IEEE', subjectId: 'ai-ml', yearMin: '2020', yearMax: '2025', venue: 'cvpr', institutionId: 'I123', institutionMode: 'awarding', minCitations: '100', degree: 'msc', program: 'cse', sort: 'citations', page: '1' };
  await hasParams(catalog, expected);
  expect(last(catalog).countryCodes.split(',').sort()).toEqual(['BD', 'FR']);
  await expect.poll(() => new URL(page.url()).searchParams.get('publisher')).toBe('IEEE');
  await page.reload();
  await hasParams(catalog, expected);
  expect(last(catalog).countryCodes).toBe('BD,FR');
  await expect(page.getByLabel('Publication type', { exact: true })).toHaveValue('thesis');
  await expect(page.getByRole('checkbox', { name: 'Has a PDF', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Remove all', exact: true }).click();
  await hasParams(catalog, Object.fromEntries(Object.keys(expected).map(key => [key, key === 'page' ? '1' : key === 'sort' ? 'relevance' : ''])));
  await hasParams(catalog, { countryCodes: '' });
  await expect.poll(() => new URL(page.url()).search).toBe('');
});

test('filter removal, Back, Forward and pagination use the current selection', async ({ page }) => {
  const { catalog } = await installFixtures(page);
  await page.goto('/?q=coastal&publisher=IEEE&countries=BD&citations=50&author=A123&authorName=Test+Author&field=1702&fieldName=AI');
  await hasParams(catalog, { publisher: 'IEEE', authorId: 'A123', fieldId: '1702', minCitations: '50', countryCodes: 'BD', page: '1' });
  await page.getByRole('button', { name: 'Remove publisher filter' }).click();
  await hasParams(catalog, { publisher: '' });
  await expect.poll(() => new URL(page.url()).searchParams.get('publisher')).toBeNull();
  await page.goBack();
  await hasParams(catalog, { publisher: 'IEEE' });
  await page.goForward();
  await hasParams(catalog, { publisher: '' });
  await page.getByRole('button', { name: 'Next', exact: true }).last().click();
  await hasParams(catalog, { page: '2', sessionId: 'fixture-session' });
  await page.getByRole('button', { name: 'Remove minimum citations filter' }).click();
  await hasParams(catalog, { page: '1', minCitations: '', sessionId: '' });
  for (const name of ['Remove author filter', 'Remove field filter', 'Remove country BD filter', 'Remove search query filter']) await page.getByRole('button', { name, exact: true }).last().click();
  await hasParams(catalog, { authorId: '', fieldId: '', countryCodes: '', search: '' });
});

test('invalid year ranges show an error and correcting them recovers', async ({ page }) => {
  const { catalog } = await installFixtures(page);
  await page.goto('/?q=coastal');
  const panel = await openFilters(page);
  await panel.getByRole('button', { name: /^Publication Year/ }).click();
  await page.getByLabel('Filter from publication year').fill('2025');
  await page.getByLabel('Filter to publication year').fill('2020');
  await expect(page.getByRole('alert')).toContainText('Start year must not exceed end year');
  await page.getByLabel('Filter to publication year').fill('2026');
  await hasParams(catalog, { yearMin: '2025', yearMax: '2026' });
  await expect(page.getByRole('alert')).not.toBeVisible();
  await page.getByRole('button', { name: 'Remove year range filter' }).click();
  await hasParams(catalog, { yearMin: '', yearMax: '' });
  await expect(page.getByLabel('Filter from publication year')).toHaveValue('');
});

test('resource, degree and program chips can each be removed without clearing other filters', async ({ page }) => {
  const { catalog } = await installFixtures(page);
  await page.goto('/?q=coastal&code=1&data=1&degree=msc&program=cse');
  await hasParams(catalog, { hasCode: 'true', hasOpenDataset: 'true', degree: 'msc', program: 'cse' });
  for (const [name, key] of [['code', 'hasCode'], ['dataset', 'hasOpenDataset'], ['degree', 'degree'], ['program', 'program']]) {
    await page.getByRole('button', { name: `Remove ${name} filter`, exact: true }).click();
    await hasParams(catalog, { [key]: '', search: 'coastal' });
  }
});

test('live paper changes reapply current filters instead of inserting unrelated papers', async ({ page }) => {
  const { catalog } = await installFixtures(page);
  let liveSocket;
  await page.routeWebSocket('**/socket.io/**', ws => {
    liveSocket = ws;
    ws.onMessage(message => { if (String(message).startsWith('40')) ws.send('40{"sid":"filter-audit-socket"}'); });
    ws.send('0{"sid":"filter-audit-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
  });
  await page.goto('/?q=coastal&countries=BD&type=thesis');
  await hasParams(catalog, { search: 'coastal', countryCodes: 'BD', publicationType: 'thesis' });
  await expect.poll(() => Boolean(liveSocket)).toBe(true);
  for (const event of ['thesis:created', 'thesis:updated', 'thesis:pinned', 'thesis:deleted']) {
    const count = catalog.length;
    liveSocket.send('42' + JSON.stringify([event, { ...paper, id: 'unrelated', _id: 'unrelated', thesisId: 'unrelated', title: 'Unrelated live journal paper', publicationType: 'journal-article' }]));
    await expect.poll(() => catalog.length).toBeGreaterThan(count);
    await hasParams(catalog, { search: 'coastal', countryCodes: 'BD', publicationType: 'thesis', sessionId: '', page: '1' });
    await expect(page.getByText('Unrelated live journal paper', { exact: true })).not.toBeVisible();
  }
});

test('Radar filters combine, reset pagination, preserve reload and handle alternate editions', async ({ page }) => {
  const { radar } = await installFixtures(page);
  await page.goto('/?view=radar');
  await page.getByLabel('Conference or journal').selectOption('cvpr');
  await page.getByLabel('Time window').selectOption('90');
  await page.getByText('Advanced filters', { exact: true }).click();
  await page.getByLabel('Date basis').selectOption('activity');
  await page.getByLabel('Metadata source').selectOption('CVF');
  const year = String(new Date().getFullYear());
  await page.getByLabel('Edition year').selectOption(year);
  await hasParams(radar, { range: '90', mode: 'activity', venue: 'cvpr', provider: 'CVF', year });
  await page.getByRole('button', { name: 'Load more papers' }).click();
  await hasParams(radar, { cursor: 'fixture-cursor' });
  await page.getByLabel('Time window').selectOption('30');
  await hasParams(radar, { range: '30', cursor: '' });
  await page.reload();
  await hasParams(radar, { range: '30', mode: 'activity', venue: 'cvpr', provider: 'CVF', year });
  await page.getByText('Advanced filters', { exact: true }).click();
  await expect(page.getByLabel('Metadata source')).toHaveValue('CVF');
  const otherVenue = Number(year) % 2 === 0 ? 'iccv' : 'eccv';
  await page.getByLabel('Conference or journal').selectOption(otherVenue);
  await expect(page.getByLabel('Edition year')).toHaveValue('');
  await hasParams(radar, { venue: otherVenue, year: '' });
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await hasParams(radar, { range: 'year', mode: 'publication', venue: '', provider: '', year: '', q: '', cursor: '' });
});

for (const width of [320, 390, 768, 1440]) {
  test(`expanded filters and long active chips fit at ${width}px in both themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installFixtures(page);
    await page.goto('/?q=coastal&publisher=Institute+of+Electrical+and+Electronics+Engineers&institution=I123&institutionName=UniversityNameWithoutSpaces'.padEnd(230, 'X') + '&countries=BD,US&author=A123&authorName=AuthorName'.padEnd(180, 'Y') + '&citations=100&degree=msc&program=cse');
    const panel = await openFilters(page);
    for (const name of ['Publication Year', 'Publisher', 'Country', 'Citation Impact']) await panel.getByRole('button', { name: new RegExp('^' + name) }).click();
    await page.getByText('Bangladesh university & program shortcuts', { exact: true }).click();
    for (let theme = 0; theme < 2; theme++) {
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `Filters overflow at ${width}px` }).toBe(true);
      await page.screenshot({ path: `../docs/screenshots/filters-${width}-${theme}.png`, fullPage: true, animations: 'disabled' });
      await page.getByLabel('Toggle Light and Dark Mode').click();
    }
    await panel.getByRole('button', { name: 'Show results', exact: true }).click();
    await expect(panel).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^More filters/ })).toBeVisible();
  });
}
