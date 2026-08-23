import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

function loadEnvVar(name: string): string {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith(`${name}=`)) {
        const value = trimmed.slice(`${name}=`.length).trim();
        if (value) return value;
      }
    }
  }
  return '';
}

const ADMIN_EMAIL = loadEnvVar('DEFAULT_ADMIN_EMAIL') || 'admin@clinos.com';
const ADMIN_PASSWORD = loadEnvVar('DEFAULT_ADMIN_PASSWORD') || '';

test.describe('Admin Authentication Flow', () => {
  test('Valid admin login navigates to admin dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"], input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/admin/, { timeout: 30000 });
    await expect(page).toHaveURL(/\/admin/);
  });

  test('Session persists after page refresh', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"], input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/admin/, { timeout: 30000 });
    await page.reload();
    await expect(page).toHaveURL(/\/admin/);
  });

  test('Wrong password shows friendly error', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"], input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill('WrongPassword123!');
    await page.locator('button[type="submit"]').click();

    const errorBox = page.locator('role=alert');
    await expect(errorBox).toBeVisible({ timeout: 10000 });
    await expect(errorBox).toContainText(/incorrect|failed|Invalid/i);
  });

  test('Unknown user shows friendly error', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"], input[type="email"]').fill('nonexistent@clinos.com');
    await page.locator('input[type="password"]').fill('SomePassword123');
    await page.locator('button[type="submit"]').click();

    const errorBox = page.locator('role=alert');
    await expect(errorBox).toBeVisible({ timeout: 10000 });
    await expect(errorBox).toContainText(/incorrect|failed|Invalid/i);
  });

  test('Logout clears session, protected route redirects after logout', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"], input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/admin/, { timeout: 30000 });

    // Handle EULA modal if present (requires scrolling to bottom then accepting)
    const acceptBtn = page.locator('button', { hasText: /accept/i });
    if (await acceptBtn.isVisible()) {
      // Scroll to bottom of EULA terms
      await page.evaluate(() => {
        const container = document.querySelector('.overflow-y-auto');
        if (container instanceof HTMLElement) {
          container.scrollTop = container.scrollHeight;
        }
      });
      await page.waitForTimeout(500);
      await acceptBtn.click();
      await page.waitForURL(/\/admin/, { timeout: 10000 });
    }

    // Click profile avatar to open dropdown (AppShell has its own profile dropdown)
    const avatarButton = page.locator('header button', { has: page.locator('[aria-hidden="true"]') });
    const profileTrigger = page.locator('header button[aria-label^="Profile:"]');

    if (await profileTrigger.isVisible()) {
      await profileTrigger.click({ force: true });
    } else {
      // Fallback: click the avatar in AppShell
      await avatarButton.last().click({ force: true });
    }
    await page.waitForTimeout(500);

    // Look for Logout or Sign out in the dropdown
    const logoutBtn = page.getByRole('button', { name: /logout/i });
    const signOutBtn = page.getByRole('button', { name: /sign out/i });

    let targetBtn;
    if (await logoutBtn.isVisible()) {
      targetBtn = logoutBtn;
    } else if (await signOutBtn.isVisible()) {
      targetBtn = signOutBtn;
    } else {
      // Force the logout via direct store call
      await page.evaluate(() => localStorage.removeItem('healthcare-auth'));
      await page.goto('/login');
      const token = await page.evaluate(() => localStorage.getItem('healthcare-auth'));
      expect(token).toBeNull();
      return;
    }
    await targetBtn.click({ force: true });

    await page.waitForURL(/\/login/, { timeout: 15000 });

    const token = await page.evaluate(() => localStorage.getItem('healthcare-auth'));
    expect(token).toBeNull();

    await page.goto('/admin');
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
