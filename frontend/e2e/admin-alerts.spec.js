import { test, expect } from '@playwright/test';

async function fixture(page, role = 'student') {
  let student = { _id: 'reader-fixture', name: 'Synthetic Reader', email: 'reader@example.org', role: 'student', status: 'approved', isProfileComplete: true, university: 'Fixture University', membership: { plan: 'free' } };
  const follows = [];
  await page.addInitScript(() => localStorage.setItem('thesis_vault_token', 'synthetic-ui-test-token'));
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('https://accounts.google.com/**', route => route.abort());
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path === '/api/auth/me') data = { user: { id: 'admin-fixture', name: 'Synthetic Admin', role, status: 'approved', isProfileComplete: true } };
    else if (path === '/api/system/status') data = { maintenance: { enabled: false } };
    else if (path === '/api/admin/students') data = [student];
    else if (path === '/api/admin/presence') data = { active: 1, away: 1, connected: 2, updatedAt: new Date().toISOString(), users: [
      { userId: 'one', name: 'Synthetic Active Researcher', role: 'student', state: 'active' },
      { userId: 'two', name: 'Synthetic Away Researcher', role: 'student', state: 'away' },
    ] };
    else if (path.endsWith('/ban')) { student = { ...student, status: 'banned' }; data = { student }; }
    else if (path.endsWith('/unban')) { student = { ...student, status: 'approved' }; data = { student }; }
    else if (path === '/api/admin/publications') data = { publications: [], total: 0 };
    else if (path.includes('membership')) data = { plan: 'premium', entitlements: { quotas: {} } };
    else if (path === '/api/thesis') data = { records: [], pagination: { hasMore: false } };
    else if (path === '/api/user/alerts') {
      if (route.request().method() === 'POST') { follows.push({ _id: 'follow-fixture', ...route.request().postDataJSON() }); data = { alerts: follows }; }
      else data = follows;
    } else if (path === '/api/feedback/admin') data = { counts: { new: 0 }, items: [] };
    await route.fulfill({ json: data });
  });
}

for (const width of [320, 390, 1440]) {
  test(`admin presence and suspension controls work at ${width}px`, async ({ page }) => {
    await fixture(page, 'admin'); await page.setViewportSize({ width, height: 900 }); await page.goto('/');
    const pulse = page.getByRole('region', { name: 'Live member activity' });
    await expect(pulse).toBeVisible(); await pulse.locator('summary').click();
    await expect(pulse.getByText('Synthetic Active Researcher')).toBeVisible();
    await expect(pulse.getByText('Active now')).toBeVisible();
    await page.getByRole('button', { name: /^Students/ }).click();
    await page.getByRole('button', { name: 'Suspend', exact: true }).filter({ visible: true }).click();
    await page.getByPlaceholder('Suspension reason...').fill('Synthetic browser test');
    await page.getByRole('button', { name: 'Suspend Account', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reinstate', exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reinstate', exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('button', { name: 'Suspend', exact: true }).filter({ visible: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Dismiss message' }).click();
    await page.screenshot({ path: `../docs/screenshots/admin-pulse-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test(`following a search prefills a usable thesis alert at ${width}px`, async ({ page }) => {
    await fixture(page); await page.setViewportSize({ width, height: 740 }); await page.goto('/?q=crop+disease');
    await page.getByRole('button', { name: /Follow this search/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Topic alerts', exact: true });
    await expect(dialog.getByLabel('Topic or keywords')).toHaveValue('crop disease');
    await dialog.getByLabel('Publication type').selectOption('thesis');
    await dialog.getByRole('button', { name: 'Add Alert' }).click();
    await expect(dialog.getByText('Theses only', { exact: true })).toBeVisible();
    const bounds = await dialog.boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `../docs/screenshots/topic-alerts-${width}.png`, animations: 'disabled' });
    await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  });
}
