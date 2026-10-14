import { test, expect } from '@playwright/test';

test('opening Find papers from a Radar deep link fetches the catalog', async ({ page }) => {
  await page.route('**/api/thesis?**', route => route.fulfill({ json: { records: [paper], pagination: { hasMore: false } } }));
  await page.getByRole('navigation', { name: 'Main navigation' }).filter({ visible: true }).getByRole('button', { name: 'Find papers', exact: true }).click();
  await expect(page.getByText(paper.title, { exact: true }).filter({ visible: true })).toBeVisible();
});

test('temporary paper API failures allow retry without locking the site in maintenance', async ({ page }) => {
  await page.route('**/api/thesis?**', route => route.fulfill({ status: 503, json: { message: 'Paper service temporarily unavailable' } }));
  await page.goto('/?q=segmentation');
  await expect(page.getByRole('alert')).toContainText('Paper service temporarily unavailable');
  await page.route('**/api/thesis?**', route => route.fulfill({ json: { records: [paper], pagination: { hasMore: false } } }));
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText(paper.title, { exact: true })).toBeVisible();
});

test('dataset source outages are shown as errors and the same query can be retried', async ({ page }) => {
  await page.route('**/api/datasets?**', route => route.fulfill({ json: { datasets: [], hasOutage: true, providerErrors: { DataCite: 'timeout' } } }));
  await page.getByRole('navigation', { name: 'Main navigation' }).filter({ visible: true }).getByRole('button', { name: 'Datasets', exact: true }).click();
  await page.getByLabel('Search datasets', { exact: true }).fill('genomics');
  await page.getByLabel('Search datasets', { exact: true }).press('Enter');
  await expect(page.getByRole('alert')).toContainText('Dataset sources could not be reached');
  await expect(page.getByText('No dataset matched', { exact: false })).not.toBeVisible();
  await page.route('**/api/datasets?**', route => route.fulfill({ json: { datasets: [{ id: 'fixture-dataset', title: 'Fixture genomics dataset', url: 'https://example.org/data' }], pagination: { hasMore: false } } }));
  await page.getByLabel('Search datasets', { exact: true }).press('Enter');
  await expect(page.getByText('Fixture genomics dataset', { exact: true })).toBeVisible();
});

for (const width of [320, 390, 768, 1440]) {
  test(`each destination and populated dataset fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/datasets?**', route => route.fulfill({ json: { datasets: [{ id: 'layout-fixture', title: 'GenomicsDataset'.repeat(15), publisher: 'ResearchInstitute'.repeat(10), url: 'https://example.org/data' }], pagination: { hasMore: false } } }));
    const nav = page.getByRole('navigation', { name: 'Main navigation' }).filter({ visible: true });
    for (const name of ['Find papers', 'Check my idea', 'Library', 'Datasets']) {
      await nav.getByRole('button', { name, exact: true }).click();
      if (name === 'Datasets') {
        await page.getByLabel('Search datasets', { exact: true }).fill('genomics');
        await page.getByLabel('Search datasets', { exact: true }).press('Enter');
        await expect(page.getByText('GenomicsDataset'.repeat(15), { exact: true })).toBeVisible();
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `${name} overflows at ${width}px` }).toBe(true);
      await page.getByLabel('Toggle Light and Dark Mode').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
    await page.screenshot({ path: `../docs/screenshots/datasets-${width}.png`, fullPage: true, animations: 'disabled' });
  });
}

test('citation controls fit a short mobile viewport and clipboard failures are explained', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Clipboard permission denied')) } }));
  await page.getByRole('button', { name: 'Cite', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Citation export' });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(480);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Copy to Clipboard' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Clipboard access');
  await expect(page.getByText('Copied!', { exact: true })).not.toBeVisible();
});
const paper = { id: 'radar_fixture_one', _id: 'radar_fixture_one', title: 'Fixture: Medical image segmentation with vision transformers', abstract: 'Synthetic browser test record. This is not a real publication.', authors: [{ name: 'Test Author' }], authorDisplay: 'Test Author', venue: 'CVPR', venueId: 'cvpr', publishedYear: 2026, publicationType: 'conference-paper', source: 'CVF', isExternal: true, isPeerReviewed: true, reviewLabel: 'Published · peer reviewed', sources: [{ provider: 'CVF', url: 'https://example.org/fixture' }], fullTextLocations: [], pdfUrl: null };
test.beforeEach(async ({ page }) => {
  let saved = [];
  await page.addInitScript(() => localStorage.setItem('thesis_vault_token', 'synthetic-test-token'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    if (path === '/api/auth/me') body = { user: { id: 'fixture-user', role: 'student', status: 'approved', isProfileComplete: true, name: 'Test Reader', email: 'test@example.org' } };
    else if (path === '/api/system/status') body = { maintenance: { enabled: false } };
    else if (path === '/api/research/radar') body = { records: [paper], health: { hasIndexedPapers: true, ingestionEnabled: true, state: 'indexed', configuredJobs: 23 }, sync: [{ key: 'cvf:cvpr:2026', provider: 'CVF', venueId: 'cvpr', year: 2026, status: 'ok', lastSuccessAt: '2026-10-10T00:00:00Z' }], basis: 'Source publication dates. Synthetic browser test data.', nextCursor: null };
    else if (path === '/api/thesis') body = { records: [], pagination: { hasMore: false } };
    else if (path === '/api/user/saved-papers') { if (route.request().method() === 'POST') saved = [route.request().postDataJSON()]; body = route.request().method() === 'GET' ? saved : { message: 'Saved fixture' }; }
    else if (path.includes('membership')) body = { plan: 'free', entitlements: { quotas: {} } };
    else if (path === '/api/thesis/cite') body = { bibtex: '@inproceedings{fixture, title={Synthetic browser fixture}}', ris: 'TY  - CONF', apa: 'Synthetic test citation.' };
    else if (['/api/subjects', '/api/thesis/publishers/list', '/api/user/notifications', '/api/user/alerts'].includes(path)) body = [];
    await route.fulfill({ json: body });
  });
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('https://accounts.google.com/**', route => route.abort());
  await page.goto('/?view=radar');
  await expect(page.getByRole('heading', { name: 'Research Radar' })).toBeVisible();
});
test('desktop filters, labels, save, compare, read and failure preserve content', async ({ page }) => {
  await expect(page.getByText(paper.title)).toBeVisible();
  await page.getByLabel('Conference or journal').selectOption('iclr');
  await page.getByText('Advanced filters', { exact: true }).click();
  await expect(page.getByLabel('Metadata source')).toHaveValue('');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.getByLabel('Conference or journal')).toHaveValue('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /compare/i }).first().click();
  await expect(page.getByText('/5 selected for comparison')).toBeVisible();
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Cite', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.route('**/api/research/radar**', route => route.fulfill({ status: 503, json: { message: 'Fixture provider failure' } }));
  await page.getByLabel('Refresh Research Radar').click();
  await expect(page.getByRole('alert')).toContainText('Fixture provider failure');
  await expect(page.getByText(paper.title)).toBeVisible();
  await page.screenshot({ path: '../docs/screenshots/radar-desktop.png', fullPage: true });
});
for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test(`all five destinations fit at ${width}px in both themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const nav = page.getByRole('navigation', { name: 'Main navigation' }).filter({ visible: true });
    for (const name of ['Find papers', 'Latest research', 'Check my idea', 'Datasets', 'Library']) await expect(nav.getByRole('button', { name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel('Toggle Light and Dark Mode').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('uninitialized index offers a working catalog handoff', async ({ page }) => {
  await page.route('**/api/research/radar**', route => route.fulfill({ json: { records: [], sync: [], health: { hasIndexedPapers: false, state: 'disabled', configuredJobs: 23, ingestionEnabled: false } } }));
  await page.getByLabel('Refresh Research Radar').click();
  await expect(page.getByText('Research Radar is getting ready.')).toBeVisible();
  await page.getByLabel('Search topics and venues').fill('Agriculture');
  await page.getByLabel('Conference or journal').selectOption('iccv');
  await page.getByRole('button', { name: 'Find papers instead' }).click();
  await expect(page).toHaveURL(/q=Agriculture/); await expect(page).toHaveURL(/venue=iccv/);
});
test('idea handoff and returning to Radar preserve context without hidden paper searches', async ({ page }) => {
  const paperSearches = []; page.on('request', req => { if (new URL(req.url()).pathname === '/api/thesis') paperSearches.push(req.url()); });
  await page.getByLabel('Search topics and venues').fill('Agriculture imaging');
  await page.getByLabel('Conference or journal').selectOption('iccv');
  await page.getByRole('button', { name: 'Check this idea' }).click();
  await expect(page.getByPlaceholder('e.g. Bangla sentiment analysis of e-commerce reviews using transformers')).toHaveValue('Agriculture imaging');
  expect(paperSearches).toHaveLength(0);
  await page.getByRole('button', { name: 'Latest research', exact: true }).filter({ visible: true }).click();
  await expect(page.getByLabel('Conference or journal')).toHaveValue('iccv');
  await expect(page.getByLabel('Search topics and venues')).toHaveValue('Agriculture imaging');
  expect(paperSearches).toHaveLength(0);
});
test('Radar filter deep links and browser back restore the selected venue', async ({ page }) => {
  await page.goto('/?view=radar&rq=crop&rv=iccv&rr=7&rm=activity&ry=2025');
  await expect(page.getByLabel('Search topics and venues')).toHaveValue('crop');
  await expect(page.getByLabel('Conference or journal')).toHaveValue('iccv');
  await page.getByLabel('Conference or journal').selectOption('eccv');
  await expect(page).toHaveURL(/rv=eccv/); await page.goBack();
  await expect(page.getByLabel('Conference or journal')).toHaveValue('iccv');
  await page.goForward(); await expect(page.getByLabel('Conference or journal')).toHaveValue('eccv');
});
test('an idea check completes after leaving the page and remains available on return', async ({ page }) => {
  let firstRequest;
  await page.route('**/api/thesis?**', async route => {
    if (!firstRequest) { firstRequest = route; return; }
    await route.fulfill({ json: { records: [], searchContextId: 'in-progress-fixture' } });
  });
  await page.getByLabel('Search topics and venues').fill('Medical image segmentation');
  await page.getByRole('button', { name: 'Check this idea' }).click();
  await expect(page.getByLabel('Your thesis idea or working title')).toHaveValue('Medical image segmentation');
  await page.locator('.topic-workspace button[type="submit"]').click();
  await expect.poll(() => Boolean(firstRequest)).toBe(true);
  await page.getByRole('button', { name: 'Latest research', exact: true }).filter({ visible: true }).click();
  await firstRequest.fulfill({ json: { records: [paper], searchContextId: 'in-progress-fixture' } });
  await page.getByRole('navigation', { name: 'Main navigation' }).filter({ visible: true }).getByRole('button', { name: 'Check my idea', exact: true }).click();
  await expect(page.getByText('A small number of close matches')).toBeVisible();
  await expect(page.getByText(paper.title, { exact: true }).filter({ visible: true })).toBeVisible();
});
test('mobile dark theme and keyboard venue selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Toggle Light and Dark Mode').click();
  const search = page.getByLabel('Search topics and venues'); await search.fill('ECCV');
  await expect(page.getByRole('listbox')).toBeVisible(); await search.press('ArrowDown'); await search.press('Enter');
  await expect(page.getByLabel('Conference or journal')).toHaveValue('eccv');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '../docs/screenshots/radar-mobile-dark.png', fullPage: true });
});
