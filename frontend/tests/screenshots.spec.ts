import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const screenshotsDir = path.resolve(__dirname, '..', 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

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

const DEMO_DOCTOR = 'demo_doctor';
const DEMO_DOCTOR_PW = 'demo1234';

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

async function screenshot(page: Page, name: string, waitForSelector?: string) {
  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
  } else {
    await page.waitForTimeout(3000);
  }
  const filePath = path.join(screenshotsDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`  ✓ Captured: ${filePath}`);
}

test.describe('Screenshot Pipeline - AI Healthcare Intelligence', () => {
  test.setTimeout(300000);

  test('Capture all 14 view states', async ({ page }) => {
    console.log('=== Starting Screenshot Pipeline ===');

    // 1. Login Page
    console.log('1/14: Login page');
    await page.goto('/login');
    await screenshot(page, '01_login_page', 'form');

    // 2. Admin Dashboard (login as admin, lands on /admin)
    console.log('2/14: Admin panel');
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await maybeAcceptEula(page);
    await page.waitForURL(/\/admin/, { timeout: 30000 }).catch(() => {});
    await screenshot(page, '02_admin_panel', '.display-title, [class*="Admin"], [class*="admin"], h1, h2');

    // 3. Doctor Dashboard
    console.log('3/14: Doctor Dashboard');
    await page.goto('/dashboard');
    await screenshot(page, '03_doctor_dashboard', '.MetricCard, [class*="metric"]');

    // 4. Patients List
    console.log('4/14: Patients list');
    await page.goto('/patients');
    await screenshot(page, '04_patients_list', 'table, .PatientTable, [class*="patient"], [class*="Patient"]');

    // 5. Patient Detail (Patient 4)
    console.log('5/14: Patient Detail');
    await page.goto('/patients/4');
    await screenshot(page, '05_patient_detail', '[class*="emr"], [class*="EMR"], .timeline, [class*="timeline"]');

    // 6. Clinical Intelligence
    console.log('6/14: Clinical Intelligence');
    await page.goto('/intelligence');
    await screenshot(page, '06_clinical_intelligence', 'iframe[title*="chat"], [class*="chat"], .chat-container, [class*="copilot"]');

    // 7. Risk Center
    console.log('7/14: Risk Center');
    await page.goto('/risk');
    await screenshot(page, '07_risk_center', '[class*="risk"], h1, h2');

    // 8. Reports
    console.log('8/14: Reports');
    await page.goto('/reports');
    await screenshot(page, '08_reports', 'table, [class*="report"], h1, h2');

    // 9. Evidence
    console.log('9/14: Evidence');
    await page.goto('/evidence');
    await screenshot(page, '09_evidence', 'table, [class*="evidence"], h1, h2');

    // 10. Care Gaps
    console.log('10/14: Care Gaps');
    await page.goto('/care-gaps');
    await screenshot(page, '10_care_gaps', 'table, [class*="care"], h1, h2');

    // 11. Agents
    console.log('11/14: Agents');
    await page.goto('/agents');
    await screenshot(page, '11_agents', '[class*="agent"], table, h1, h2');

    // 12. Reviews
    console.log('12/14: Reviews');
    await page.goto('/reviews');
    await screenshot(page, '12_reviews', 'table, [class*="review"], h1, h2');

    // 13. Appointments
    console.log('13/14: Appointments');
    await page.goto('/appointments');
    await screenshot(page, '13_appointments', 'table, [class*="appointment"], h1, h2');

    // 14. Patient Dashboard (doctor viewing patient)
    console.log('14/14: Patient Dashboard');
    await page.goto('/patient');
    await screenshot(page, '14_patient_dashboard', '[class*="dashboard"], [class*="patient"], h1, h2');

    console.log('=== All 14 screenshots captured ===');
  });
});
