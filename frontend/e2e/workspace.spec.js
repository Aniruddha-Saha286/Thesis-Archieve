import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  let plan = { title: 'Coastal flood prediction for Bangladesh', goal: 'Evaluate whether local rainfall observations improve flood-warning lead time.', targetDate: '2027-05-01', version: 1, updatedAt: '2026-10-23T10:00:00Z', tasks: [
    { id: 'question', title: 'Frame my research question', done: true }, { id: 'review', title: 'Map the related literature', done: false },
    { id: 'method', title: 'Choose a method and data source', done: false }, { id: 'study', title: 'Run the study or experiments', done: false },
    { id: 'analysis', title: 'Analyze the findings', done: false }, { id: 'write', title: 'Write, review and revise', done: false },
  ] };
  let papers = [{ paperId: 'workspace_fixture_one', title: 'Synthetic study: Coastal flood prediction using local rainfall observations', authors: 'Fixture Researcher', year: 2026, readingStatus: 'Reading' }, { paperId: 'workspace_fixture_two', title: 'Synthetic review: Early warning systems in delta regions', authors: 'Fixture Author', year: 2025, readingStatus: 'To read' }];
  await page.addInitScript(() => localStorage.setItem('thesis_vault_token', 'synthetic-workspace-token'));
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('https://accounts.google.com/**', route => route.abort());
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method();
    let body = [];
    if (path === '/api/auth/me') body = { user: { id: 'workspace-fixture', role: 'student', status: 'approved', isProfileComplete: true, name: 'Test Researcher' } };
    else if (path === '/api/user/research-plan') {
      if (method === 'PUT') plan = { ...route.request().postDataJSON(), version: plan.version + 1, updatedAt: new Date().toISOString() };
      body = { plan };
    } else if (path.endsWith('/reading-status')) {
      const id = decodeURIComponent(path.split('/').at(-2)); papers = papers.map(paper => paper.paperId === id ? { ...paper, ...route.request().postDataJSON() } : paper); body = { savedPaper: papers.find(paper => paper.paperId === id) };
    } else if (path === '/api/user/saved-papers') body = papers;
    else if (path === '/api/system/status') body = { maintenance: { enabled: false } };
    else if (path.includes('membership')) body = { plan: 'premium_6m', entitlements: { quotas: {} } };
    else if (path === '/api/thesis') body = { records: [], pagination: { hasMore: false } };
    await route.fulfill({ json: body });
  });
});

for (const width of [320, 390, 768, 1440]) {
  test(`research studio works in both themes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/?view=library');
    await expect(page.getByLabel('Working title')).toHaveValue('Coastal flood prediction for Bangladesh');
    await page.getByRole('checkbox', { name: 'Complete Map the related literature' }).check();
    await page.getByRole('button', { name: 'Save roadmap' }).click();
    await expect(page.getByText('Roadmap saved to your account.')).toBeVisible();
    await page.getByLabel('New milestone').fill('Meet my supervisor'); await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Save roadmap' }).click();
    await page.getByLabel('Reading status for Synthetic study: Coastal flood prediction using local rainfall observations').selectOption('Reviewed');
    await page.getByRole('button', { name: /^Reviewed/ }).click();
    await expect(page.getByText('Synthetic study: Coastal flood prediction using local rainfall observations', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start focus' }).click(); await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause session' }).click();
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download progress brief' }).click();
    expect((await download).suggestedFilename()).toBe('thesis-progress-brief.txt');
    const nav = page.getByRole('navigation', { name: 'Main navigation' }).filter({ visible: true });
    await nav.getByRole('button', { name: 'Find papers', exact: true }).click();
    await nav.getByRole('button', { name: /^Library/ }).click();
    await expect(page.getByText('Meet my supervisor', { exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    for (let theme = 0; theme < 2; theme++) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `../docs/screenshots/research-studio-${width}-${theme}.png`, fullPage: true, animations: 'disabled' });
      if (theme === 0 && [390, 1440].includes(width)) await page.screenshot({ path: `../docs/screenshots/research-studio-preview-${width}.png`, animations: 'disabled' });
      await page.getByLabel('Toggle Light and Dark Mode').click();
    }
    await page.reload(); await expect(page.getByRole('checkbox', { name: 'Complete Map the related literature' })).toBeChecked();
    await expect(page.getByText('Meet my supervisor', { exact: true })).toBeVisible();
  });
}

test('search builder runs only an explicitly selected angle', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByText('A topic is a starting point. Find your angle.').click();
  await page.getByLabel('What are you curious about?').fill('coastal flood prediction');
  await page.getByRole('button', { name: /Map the field/ }).click();
  await expect(page).toHaveURL(/q=coastal\+flood\+prediction\+systematic\+review/);
  await expect(page.getByRole('combobox', { name: 'Search research papers' })).toHaveValue('coastal flood prediction systematic review');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../docs/screenshots/discovery-studio-390.png', fullPage: true, animations: 'disabled' });
});

test('roadmap failure offers retry without implying a saved plan', async ({ page }) => {
  await page.route('**/api/user/research-plan', route => route.fulfill({ status: 503, json: { message: 'Synthetic outage' } }));
  await page.goto('/?view=library'); await expect(page.getByText(/Your roadmap could not be loaded/)).toBeVisible();
  await expect(page.getByText('Saved in your account', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry loading roadmap' })).toBeVisible();
});
