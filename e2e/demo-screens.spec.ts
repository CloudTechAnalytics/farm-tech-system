import { test } from '@playwright/test'

// Visual review of the seeded demo farm (run after `node scripts/seed-demo.mjs`).
test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots only')

test('demo farm screens', async ({ page }) => {
  const dir = process.env.E2E_SCREENSHOTS!
  await page.goto('/auth/sign-in')
  await page.getByLabel('Email').fill('demo.owner@farmledger.local')
  await page.getByLabel('Password').fill('Harvest2026')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByText('Birds on farm').waitFor()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${dir}/demo-dashboard.png`, fullPage: true })
  for (const [path, name, wait] of [
    ['/fish', 'demo-fish', 'FB-DEMO-1'],
    ['/inventory', 'demo-inventory', 'Layer mash'],
    ['/reports?tab=feed', 'demo-report-feed', 'PB-DEMO-A'],
    ['/reports?tab=finance', 'demo-report-finance', 'Cash movement by month'],
    ['/crops', 'demo-crops', 'MZ-DEMO'],
  ] as const) {
    await page.goto(path)
    await page.getByText(wait).first().waitFor()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true })
  }
})
