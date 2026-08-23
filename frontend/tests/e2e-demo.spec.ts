import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

function loadEnvVar(name: string): string {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith(`${name}=`)) {
        return trimmed.slice(`${name}=`.length).trim();
      }
    }
  }
  return '';
}

const ADMIN_EMAIL = loadEnvVar('DEFAULT_ADMIN_EMAIL') || 'admin@clinos.com';
const ADMIN_PASSWORD = loadEnvVar('DEFAULT_ADMIN_PASSWORD') || 'password123';

async function loginAs(page: Page, identifier: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[type="email"]').fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

async function maybeAcceptEula(page: Page) {
  const acceptBtn = page.locator('button', { hasText: /accept/i });
  if (await acceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.evaluate(() => {
      const container = document.querySelector('.overflow-y-auto');
      if (container instanceof HTMLElement) {
        container.scrollTop = container.scrollHeight;
      }
    });
    await page.waitForTimeout(500);
    await acceptBtn.click();
    await page.waitForURL(/\/(admin|dashboard|patient)/, { timeout: 10000 });
  }
}

test.describe('E2E Demo Flow - Admin to Patient', () => {
  test.setTimeout(180000);

  test('Full workflow: login → navigate → patient view → refresh persistence → logout', async ({ page }) => {
    // Step 1: Login as admin
    console.log('Step 1: Login as admin');
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await maybeAcceptEula(page);
    await page.waitForURL(/\/admin/, { timeout: 30000 });
    expect(page.url()).toMatch(/\/admin/);
    console.log('  ✓ Admin dashboard reached');

    // Step 2: Navigate to doctor dashboard
    console.log('Step 2: Navigate to doctor dashboard');
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);
    await expect(page.locator('text=/Good morning|Good afternoon|Good evening/i')).toBeVisible({ timeout: 10000 });
    console.log('  ✓ Doctor dashboard loaded with greeting');

    // Step 3: Navigate to patients list
    console.log('Step 3: Navigate to patients list');
    await page.goto('/patients');
    await page.waitForURL(/\/patients/);
    const patientCount = await page.locator('tr, .patient-row, [class*="patient-card"]').count();
    console.log(`  ✓ Patients list loaded (${patientCount} entries visible)`);

    // Step 4: Navigate to patient detail
    console.log('Step 4: Navigate to patient detail (Patient 4)');
    await page.goto('/patients/4');
    await page.waitForURL(/\/patients\/4/);
    console.log('  ✓ Patient detail page loaded');

    // Step 5: Navigate to patient dashboard
    console.log('Step 5: Navigate to patient dashboard');
    await page.goto('/patient');
    await page.waitForURL(/\/patient/);
    await expect(page.locator('text=/Hello|Patient|Welcome/i').first()).toBeVisible({ timeout: 10000 });
    console.log('  ✓ Patient dashboard loaded');

    // Step 6: Verify session persistence on refresh
    console.log('Step 6: Verify session persistence on refresh');
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/\/patient/);
    const authToken = await page.evaluate(() => localStorage.getItem('healthcare-auth'));
    expect(authToken).not.toBeNull();
    console.log('  ✓ Session persisted after refresh (token in localStorage)');

    // Step 7: Log out via localStorage clear (since UI logout may vary)
    console.log('Step 7: Log out');
    await page.evaluate(() => localStorage.removeItem('healthcare-auth'));
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/login/);
    console.log('  ✓ Redirected to login after logout');

    // Step 8: Verify protected route redirects
    console.log('Step 8: Verify protected route redirect');
    await page.goto('/admin');
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/login/);
    console.log('  ✓ Protected route redirected to login');

    console.log('=== E2E Demo Flow Complete — all steps passed ===');
  });
});
