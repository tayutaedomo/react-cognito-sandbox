import { expect, test } from '@playwright/test';
import { completeTotp } from '../helpers/complete-totp';

test('Hosted UI ログイン後もデバイス一覧を再取得できる', async ({ page }) => {
  test.skip(process.env.VITE_USE_MOCK_COGNITO !== 'false', '実 Cognito 環境でのみ実行する');
  test.setTimeout(90_000);

  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  expect(email, 'TEST_USER_EMAIL is required').toBeTruthy();
  expect(password, 'TEST_USER_PASSWORD is required').toBeTruthy();

  await page.goto('/');
  await page.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' }).click();
  await page.locator('#signInFormUsername:visible').fill(email!);
  await page.locator('#signInFormPassword:visible').fill(password!);
  await page.locator('input[name="signInSubmitButton"]:visible').first().click();
  const codeInput = page.locator('input[name="totpCode"]:visible, input[name="softwareTokenMfaCode"]:visible, input[autocomplete="one-time-code"]:visible');
  const mfaButton = page.getByRole('button', { name: 'MFA 設定', exact: true });
  await expect(codeInput.or(mfaButton).first()).toBeVisible();
  if (await codeInput.isVisible()) await completeTotp(page);

  await mfaButton.click();
  const loadedDevices = page.locator('[data-testid="registered-devices-list"], [data-testid="registered-devices-empty"]');
  await expect(loadedDevices).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'MFA 設定', exact: true }).click();
  await expect(loadedDevices).toBeVisible();
});

test('SRP ログイン後も画面移動と再読み込みでデバイス一覧を確認できる', async ({ page }) => {
  test.skip(process.env.VITE_USE_MOCK_COGNITO !== 'false', '実 Cognito 環境でのみ実行する');
  test.skip(process.env.RUN_REGISTERED_DEVICE_E2E !== 'true', 'デバイスを登録・解除するシナリオは明示的に実行する');
  test.setTimeout(90_000);
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  expect(email).toBeTruthy();
  expect(password).toBeTruthy();
  await page.goto('/');
  await page.getByRole('button', { name: '信頼するデバイス POC（SRP ログイン）' }).click();
  await page.getByLabel('メールアドレス').fill(email!);
  await page.getByLabel('パスワード').fill(password!);
  await page.getByRole('button', { name: 'SRP でログイン' }).click();
  const codeInput = page.getByLabel('認証アプリの6桁コード');
  const status = page.getByTestId('device-remembered-status');
  await expect(codeInput.or(status).first()).toBeVisible();
  if (await codeInput.isVisible()) {
    const { generateTotp } = await import('../helpers/totp.mjs');
    expect(process.env.TEST_USER_TOTP_SECRET).toBeTruthy();
    const remaining = 30_000 - Date.now() % 30_000;
    await new Promise(resolve => setTimeout(resolve, remaining + 500));
    await codeInput.fill(generateTotp(process.env.TEST_USER_TOTP_SECRET!));
    await page.getByRole('button', { name: '確認', exact: true }).click();
  }
  await expect(status).toBeVisible();
  await expect(page.getByRole('button', { name: 'このブラウザを信頼する' })).toBeVisible();
  await page.getByRole('button', { name: 'このブラウザを信頼する' }).click();
  try {
    await expect(status).toHaveText(/この端末：(信頼済み|信頼状態を取得できません)/);
    const settings = await page.context().newPage();
    await settings.goto('/');
    await settings.getByRole('button', { name: 'MFA 設定', exact: true }).click();
    await expect(settings.getByTestId('registered-devices-list')).toBeVisible();
    await settings.reload();
    await settings.getByRole('button', { name: 'MFA 設定', exact: true }).click();
    await expect(settings.getByTestId('registered-devices-list')).toBeVisible();
  } finally {
    await page.getByRole('button', { name: 'この端末の信頼を解除' }).click({ timeout: 10_000 });
    await expect(status).toHaveText('この端末：一覧にありません');
  }
});
