import { expect, test, type Page } from '@playwright/test'

/**
 * The core farm workflow through the real UI: sign up, set up the farm, add a
 * house and feed, buy feed, start a flock, feed it, record mortality and eggs,
 * sell eggs, and check the dashboard reflects exactly what was recorded.
 */
const shots = process.env.E2E_SCREENSHOTS

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
}

async function toast(page: Page, text: RegExp | string) {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

test('owner records a week of farm work end to end', async ({ page }) => {
  const id = Date.now().toString(36)
  const email = `owner-${id}@test.farmledger.local`
  const dlg = () => page.getByRole('dialog')
  const nav = () => page.getByRole('navigation', { name: 'Main' })

  // Sign up (local auth has email confirmation off).
  await page.goto('/auth/sign-up')
  await shot(page, '01-sign-up')
  await page.getByLabel('Your name').fill('Adaeze Okafor')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Harvest2026')
  await page.getByLabel('Confirm password').fill('Harvest2026')
  await page.getByRole('button', { name: 'Create account' }).click()

  // Onboarding.
  await expect(page.getByRole('heading', { name: 'Set up your farm business' })).toBeVisible()
  await page.getByLabel('Farm or business name').fill(`Okafor Integrated Farms ${id}`)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Add your first farm site' })).toBeVisible()
  await page.getByLabel('State').selectOption('Ogun')
  await page.getByRole('checkbox', { name: /Poultry/ }).click()
  await page.getByRole('checkbox', { name: /Crops/ }).click()
  await shot(page, '02-onboarding-site')
  await page.getByRole('button', { name: 'Open my farm' }).click()

  // Empty dashboard: real zeros, a setup checklist, no invented numbers.
  await expect(page.getByText('Get your farm set up')).toBeVisible()
  await shot(page, '03-dashboard-empty')

  // Add a poultry house on the site.
  await nav().getByRole('link', { name: 'Farm sites' }).click()
  await page.getByRole('link', { name: /main farm/i }).click()
  await page.getByRole('button', { name: 'Add unit' }).click()
  await dlg().getByLabel('Name').fill('House A')
  await dlg().getByRole('button', { name: 'Add unit' }).click()
  await toast(page, 'Unit added')

  // Add a feed item and buy 10 bags with the expense recorded together.
  await nav().getByRole('link', { name: 'Inventory' }).click()
  await page.getByRole('tab', { name: 'Items' }).click()
  await page.getByRole('button', { name: 'Add item' }).click()
  await dlg().getByLabel('Name').fill('Layer mash')
  await dlg().getByLabel('Category').selectOption({ label: 'Poultry feed' })
  await dlg().getByLabel('Kept in').selectOption({ label: 'Kilogram' })
  await dlg().getByLabel('Reorder level').fill('100')
  await dlg().getByRole('checkbox', { name: 'This is feed' }).check()
  await dlg().getByRole('button', { name: 'Add item' }).click()
  await toast(page, 'Item added')

  await page.getByRole('button', { name: 'Receive stock' }).click()
  await dlg().getByLabel('Item').selectOption({ label: 'Layer mash (kg)' })
  await dlg().getByLabel('Quantity').fill('10')
  await dlg().getByLabel('Unit').selectOption({ label: 'Bag (25 kg)' })
  await expect(dlg().getByText('= 250 kg')).toBeVisible()
  await dlg().getByLabel('Total cost').fill('120000')
  await dlg().getByLabel('Supplier').fill('Top Feeds, Abeokuta')
  await dlg().getByRole('button', { name: 'Save', exact: true }).click()
  await toast(page, /Balance now 250 kg/)

  // Start a flock of 500 layers.
  await nav().getByRole('link', { name: 'Poultry' }).click()
  await page.getByRole('button', { name: 'Start flock' }).first().click()
  await dlg().getByLabel('Batch code').fill(`PB-${id}`.toUpperCase())
  await dlg().getByLabel('House / pen').selectOption({ label: 'House A' })
  await dlg().getByLabel('Breed / strain').fill('Isa Brown')
  await dlg().getByLabel('Number of birds').fill('500')
  await dlg().getByRole('button', { name: 'Start flock' }).click()
  await expect(page.getByRole('heading', { name: new RegExp(`PB-${id}`, 'i') })).toBeVisible()

  // Feed 2 bags from the store, record 5 deaths and 12 crates of eggs.
  await page.getByRole('button', { name: 'Feed' }).click()
  await dlg().getByLabel(/^Feed/).selectOption({ label: 'Layer mash (kg)' })
  await dlg().getByLabel('Quantity').fill('2')
  await dlg().getByLabel('Unit').selectOption({ label: 'Bag (25 kg)' })
  await dlg().getByRole('button', { name: 'Save feed record' }).click()
  await toast(page, 'Feed record saved')

  await page.getByRole('button', { name: 'Mortality' }).click()
  await dlg().getByLabel('Number of birds').fill('5')
  await dlg().getByLabel('Reason').fill('Heat stress')
  await dlg().getByRole('button', { name: 'Save', exact: true }).click()
  await toast(page, /495 remaining/)

  await page.getByRole('button', { name: 'Eggs' }).click()
  await dlg().getByLabel('Eggs collected').fill('12')
  await dlg().getByLabel('Counted in').selectOption({ label: 'Crate (30)' })
  await dlg().getByLabel('Cracked / rejected').fill('1')
  await dlg().getByRole('button', { name: 'Save collection' }).click()
  await toast(page, 'Egg collection saved')
  await expect(page.getByText('495').first()).toBeVisible()
  await shot(page, '04-flock-detail')

  // Sell 10 crates; the customer pays part now.
  await page.goto('/sales/new')
  await page.getByLabel('From record').selectOption({ index: 1 })
  await page.getByLabel('Quantity').fill('10')
  await page.getByLabel(/Price per unit/).fill('4500')
  await page.getByLabel('Customer', { exact: true }).fill('Mama Nkechi')
  await page.getByRole('checkbox', { name: 'Paid in full now' }).uncheck()
  await page.getByLabel('Amount received now').fill('30000')
  await shot(page, '05-new-sale')
  await page.getByRole('button', { name: 'Save sale' }).click()
  await expect(page.getByRole('heading', { name: /Sale to Mama Nkechi/ })).toBeVisible()
  await expect(page.getByText('Part paid')).toBeVisible()

  // Trying to sell more eggs than remain is refused before anything is saved.
  await page.goto('/sales/new')
  await page.getByLabel('From record').selectOption({ index: 1 })
  await page.getByLabel('Quantity').fill('2')
  await expect(page.getByText(/Only 1 crate available/)).toBeVisible()

  // Dashboard shows exactly what was recorded.
  await nav().getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByText('Birds on farm')).toBeVisible()
  const birds = page.locator('div', { has: page.getByText('Birds on farm', { exact: true }) }).locator('p.text-2xl').first()
  await expect(birds).toHaveText('495')
  await expect(page.getByText('₦30,000.00').first()).toBeVisible()
  await expect(page.getByText('₦120,000.00').first()).toBeVisible()
  await shot(page, '06-dashboard')

  // Daily log has the system entries.
  await nav().getByRole('link', { name: 'Daily log' }).click()
  await expect(page.getByText(/Mortality in PB-.*: 5 \(Heat stress\)/i)).toBeVisible()
  await expect(page.getByText(/Fed Layer mash to PB-.*: 2 Bag \(25 kg\)/i)).toBeVisible()
  await shot(page, '07-daily-log')

  // Phone layout.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByText('Birds on farm')).toBeVisible()
  await shot(page, '08-dashboard-phone')
  await page.getByRole('button', { name: 'Record' }).click()
  await expect(page.getByRole('menuitem', { name: 'Mortality or loss' })).toBeVisible()
  await shot(page, '09-record-menu-phone')
})
