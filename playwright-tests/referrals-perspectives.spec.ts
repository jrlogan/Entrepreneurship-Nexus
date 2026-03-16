import { test, expect, type Browser, type Page } from '@playwright/test';

const PASSWORD = 'Password123!';

async function signInAs(browser: Browser, email: string, landingText: string) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/');
  await page.getByPlaceholder('Email').nth(1).fill(email);
  await page.locator('input[type="password"]').nth(1).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.locator('main')).toContainText(landingText, { timeout: 20_000 });

  return { context, page };
}

async function openLatestReferral(page: Page) {
  await page.locator('tbody tr').first().click();
  await expect(page.getByRole('heading', { name: 'Manage Referral' })).toBeVisible();
}

async function closeReferralModal(page: Page) {
  await page.locator('button').filter({ hasText: '×' }).click();
  await expect(page.getByRole('heading', { name: 'Manage Referral' })).not.toBeVisible();
}

async function createReferralAsSender(page: Page, note: string) {
  await expect(page.getByRole('heading', { name: 'Referrals' })).toBeVisible();
  await page.getByRole('button', { name: 'New Referral' }).click();

  await expect(page.getByRole('heading', { name: 'New Referral' })).toBeVisible();
  await page.getByLabel('Organization to Refer').selectOption({ label: 'DarkStar Marine' });
  await page.getByLabel('Recipient Organization (ESO)').selectOption({ label: 'MakeHaven' });
  await page.getByLabel('Introduction / Notes').fill(note);
  await page.getByRole('button', { name: 'Send Referral' }).click();

  await expect(page.getByRole('heading', { name: 'New Referral' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Outgoing (Sent)' }).click();
  const latestRow = page.locator('tbody tr').first();
  await expect(latestRow).toContainText('DarkStar Marine');
  await expect(latestRow).toContainText('MakeHaven');
  await expect(latestRow).toContainText(/awaiting acceptance/i);
  const createdDate = (await latestRow.locator('td').nth(5).innerText()).trim();
  await openLatestReferral(page);
  await expect(page.getByText('Waiting on the receiving organization')).toBeVisible();
  await closeReferralModal(page);
  return createdDate;
}

test('referral assignment and acceptance are visible from sender, receiver, assignee, and entrepreneur views', async ({ browser }) => {
  const note = `Playwright referral ${Date.now()} prototyping support`;
  let createdDate = '';

  const sender = await signInAs(browser, 'eso.admin@ctinnovations.org', 'Referrals');
  try {
    createdDate = await createReferralAsSender(sender.page, note);
  } finally {
    await sender.context.close();
  }

  const receiverAdmin = await signInAs(browser, 'eso.admin@makehaven.org', 'Referrals');
  try {
    await expect(receiverAdmin.page.locator('tbody tr').first()).toContainText(createdDate);
    await expect(receiverAdmin.page.locator('tbody tr').first()).toContainText('DarkStar Marine');
    await openLatestReferral(receiverAdmin.page);
    await receiverAdmin.page.getByRole('button', { name: 'Assign' }).click();
    await receiverAdmin.page.getByLabel('Choose Reviewer').fill('MakeHaven Staff');
    await receiverAdmin.page.getByRole('button', { name: /MakeHaven Staff/i }).click();
    await expect(receiverAdmin.page.getByRole('button', { name: 'Assign reviewer' })).toBeEnabled();
    await receiverAdmin.page.getByRole('button', { name: 'Assign reviewer' }).click();
    await expect(receiverAdmin.page.locator('main')).toContainText('Reviewer assignment saved');
    await closeReferralModal(receiverAdmin.page);
    await expect(receiverAdmin.page.locator('tbody tr').first()).toContainText('MakeHaven Staff');
  } finally {
    await receiverAdmin.context.close();
  }

  const reviewer = await signInAs(browser, 'eso.staff@makehaven.org', 'Referrals');
  try {
    await expect(reviewer.page.locator('tbody tr').first()).toContainText(createdDate);
    await expect(reviewer.page.locator('tbody tr').first()).toContainText('DarkStar Marine');
    await openLatestReferral(reviewer.page);
    await reviewer.page.getByRole('button', { name: 'Accept' }).click();
    await reviewer.page.getByRole('button', { name: 'Confirm accept' }).click();
    await expect(reviewer.page.locator('tbody tr').first()).toContainText(/accepted/i);
  } finally {
    await reviewer.context.close();
  }

  const senderReview = await signInAs(browser, 'eso.admin@ctinnovations.org', 'Referrals');
  try {
    await senderReview.page.getByRole('button', { name: 'Outgoing (Sent)' }).click();
    await expect(senderReview.page.locator('tbody tr').first()).toContainText(createdDate);
    await expect(senderReview.page.locator('tbody tr').first()).toContainText(/accepted/i);
    await openLatestReferral(senderReview.page);
    await expect(senderReview.page.getByText(/accepted/i)).toBeVisible();
    await closeReferralModal(senderReview.page);
  } finally {
    await senderReview.context.close();
  }

  const entrepreneur = await signInAs(browser, 'founder@darkstarmarine.com', 'Support Cases');
  try {
    await expect(entrepreneur.page.locator('main')).toContainText('accepted / in progress');
    await expect(entrepreneur.page.locator('main')).toContainText('CT Innovations');
    await expect(entrepreneur.page.locator('main')).toContainText('MakeHaven');
  } finally {
    await entrepreneur.context.close();
  }
});
