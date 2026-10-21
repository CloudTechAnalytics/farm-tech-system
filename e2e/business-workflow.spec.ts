import { expect, test, type Page } from '@playwright/test'

/**
 * The release 2 business workflow through the real UI on a new farm: the
 * sidebar follows the farm's production types, a customer order is delivered
 * and invoiced, a supplier order is received, billed and paid, and a task is
 * assigned to a worker and completed.
 */
async function toast(page: Page, text: RegExp | string) {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

test('owner runs sales, purchasing and tasks end to end', async ({ page }) => {
  const id = Date.now().toString(36)
  const dlg = () => page.getByRole('dialog')
  const nav = () => page.getByRole('navigation', { name: 'Main' })
  const main = () => page.locator('main')

  await page.goto('/auth/sign-up')
  await page.getByLabel('Your name').fill('Bola Ade')
  await page.getByLabel('Email').fill(`biz-${id}@test.farmledger.local`)
  await page.getByLabel('Password', { exact: true }).fill('Harvest2026')
  await page.getByLabel('Confirm password').fill('Harvest2026')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByLabel('Farm or business name').fill(`Ade Poultry ${id}`)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('State').selectOption('Oyo')
  await page.getByRole('checkbox', { name: /Poultry/ }).click()
  await page.getByRole('button', { name: 'Open my farm' }).click()
  await expect(page.getByText('Get your farm set up')).toBeVisible()

  // A poultry-only farm does not see the fish and crop modules.
  await expect(nav().getByRole('link', { name: 'Poultry' })).toBeVisible()
  await expect(nav().getByRole('link', { name: 'Fish' })).toHaveCount(0)
  await expect(nav().getByRole('link', { name: 'Crops' })).toHaveCount(0)

  // Customer and a product that is not stock-tracked.
  await nav().getByRole('link', { name: 'Customers' }).click()
  await main().getByRole('button', { name: 'Add customer' }).click()
  await page.locator('#cu-name').fill('Iya Basira Foods')
  await page.locator('#cu-terms').fill('7')
  await dlg().getByRole('button', { name: 'Add customer' }).click()
  await expect(page.getByRole('heading', { name: 'Iya Basira Foods' })).toBeVisible()

  await nav().getByRole('link', { name: 'Products' }).click()
  await main().getByRole('button', { name: 'Add product' }).click()
  await page.locator('#pr-name').fill('Poultry manure (bag)')
  await page.locator('#pr-source').selectOption('other')
  await page.locator('#pr-unit').selectOption({ label: 'Each' })
  await page.locator('#pr-price').fill('1500')
  await dlg().getByRole('button', { name: 'Add product' }).click()
  await toast(page, 'Product added')

  // Order 20 bags, deliver 12 now with part payment.
  await nav().getByRole('link', { name: 'Sales orders' }).click()
  await main().getByRole('link', { name: 'New order' }).first().click()
  await page.locator('#no-cust').selectOption({ label: 'Iya Basira Foods' })
  await page.locator('#ol-p-0').selectOption({ label: 'Poultry manure (bag)' })
  await page.locator('#ol-q-0').fill('20')
  await expect(page.locator('#ol-pr-0')).toHaveValue('1500')
  await page.getByRole('button', { name: 'Save order' }).click()
  await expect(page.getByRole('heading', { name: /SO-00001/ })).toBeVisible()
  await page.getByRole('button', { name: 'Deliver and invoice' }).click()
  await dlg().getByLabel('Deliver (pcs)').fill('12')
  await page.locator('#dl-paid').fill('10000')
  await dlg().getByRole('button', { name: 'Deliver and invoice' }).click()
  await expect(page.getByRole('heading', { name: /Invoice INV-00001/ })).toBeVisible()
  await expect(page.getByText('Part paid')).toBeVisible()
  await nav().getByRole('link', { name: 'Receivables' }).click()
  await expect(main().getByText('INV-00001')).toBeVisible()
  await expect(main().getByText('₦8,000.00').first()).toBeVisible()

  // Supplier, a purchase order for a service, received, billed and paid.
  await nav().getByRole('link', { name: 'Suppliers' }).click()
  await main().getByRole('button', { name: 'Add supplier' }).click()
  await page.locator('#su-name').fill('Clean Pens Services')
  await page.locator('#su-cat').selectOption('services')
  await dlg().getByRole('button', { name: 'Add supplier' }).click()
  await expect(page.getByRole('heading', { name: 'Clean Pens Services' })).toBeVisible()
  await main().getByRole('link', { name: 'New purchase order' }).click()
  await page.locator('#po-sup').selectOption({ label: 'Clean Pens Services' })
  await page.getByLabel('Description').fill('Fumigation of House A')
  await page.locator('#pl-q-0').fill('1')
  await page.locator('#pl-u-0').selectOption({ label: 'Each' })
  await page.locator('#pl-p-0').fill('25000')
  await page.getByRole('button', { name: 'Save purchase order' }).click()
  await expect(page.getByRole('heading', { name: /PO-00001/ })).toBeVisible()
  await page.getByRole('button', { name: 'Receive goods' }).click()
  await dlg().getByRole('button', { name: 'Record receipt' }).click()
  await toast(page, /GRN-00001/)
  await main().getByRole('link', { name: 'Record bill' }).click()
  await page.locator('#bl-no').fill('CPS-118')
  await page.locator('#bl-amount').fill('25000')
  await page.locator('#bl-desc').fill('Fumigation')
  await dlg().getByRole('button', { name: 'Save bill' }).click()
  await expect(page.getByRole('heading', { name: /Bill CPS-118/ })).toBeVisible()
  await main().getByRole('button', { name: 'Pay bill' }).click()
  await dlg().getByRole('button', { name: 'Save payment' }).click()
  await expect(page.getByText('Paid', { exact: true })).toBeVisible()

  // The payment is the only expense, and cash surplus is what actually moved.
  await page.goto('/reports?tab=profit')
  await expect(main().getByText('Cash surplus')).toBeVisible()
  // Cash: 10,000 received − 25,000 paid. Accrual: 18,000 invoiced − 25,000 billed.
  await expect(main().getByText('-₦15,000.00')).toBeVisible()
  await expect(main().getByText('-₦7,000.00')).toBeVisible()

  // A worker, an assigned task with review, completed and approved.
  await nav().getByRole('link', { name: 'Workers' }).click()
  await main().getByRole('button', { name: 'Add worker' }).click()
  await page.locator('#wk-name').fill('Tunde Ojo')
  await dlg().getByRole('button', { name: 'Add worker' }).click()
  await toast(page, 'Worker added')
  await nav().getByRole('link', { name: 'Tasks' }).click()
  await main().getByRole('button', { name: 'New task' }).click()
  await page.locator('#tk-title').fill('Spread fresh litter, House A')
  await page.locator('#tk-cat').selectOption({ label: 'Cleaning / sanitation' })
  await page.locator('#tk-who').selectOption({ label: 'Tunde Ojo' })
  await dlg().getByRole('checkbox', { name: /Supervisor review/ }).check()
  await dlg().getByRole('button', { name: 'Plan task' }).click()
  await toast(page, 'Task planned')
  const row = main().getByRole('row', { name: /Spread fresh litter/ })
  await row.getByRole('button', { name: 'Submit for review' }).click()
  await dlg().getByRole('button', { name: 'Submit' }).click()
  await expect(row.getByText('Awaiting review')).toBeVisible()
  await row.getByRole('button', { name: 'Approve' }).click()
  await expect(main().getByRole('row', { name: /Spread fresh litter/ })).toHaveCount(0)
})
