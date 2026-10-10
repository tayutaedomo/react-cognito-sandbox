import { expect, test, type Browser, type Page } from '@playwright/test';
import { generateTotp } from '../helpers/totp.mjs';

test.describe('remembered device with SRP', () => {
  test.skip(
    () => process.env.VITE_USE_MOCK_COGNITO !== 'false' || process.env.RUN_MFA_DEVICE_E2E !== 'true',
    '専用ユーザーと device tracking 有効の Cognito 環境で明示的に実行する',
  );

  test('trusts the current browser, challenges a new browser, and challenges again after forgetting', async ({ browser }) => {
    test.setTimeout(300_000);
    const email = process.env.MFA_DEVICE_USER_EMAIL;
    const password = process.env.MFA_DEVICE_USER_PASSWORD;
    expect(email, 'MFA_DEVICE_USER_EMAIL is required').toBeTruthy();
    expect(password, 'MFA_DEVICE_USER_PASSWORD is required').toBeTruthy();
    const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
    const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

    async function openPoc(context: Awaited<ReturnType<Browser['newContext']>>) {
      const page = await context.newPage();
      await page.goto('/');
      await page.getByRole('button', { name: '信頼するデバイス POC（SRP ログイン）' }).click();
      return page;
    }

    async function waitForFreshCode() {
      const remaining = 30_000 - Date.now() % 30_000;
      await new Promise(resolve => setTimeout(resolve, remaining + 500));
    }

    async function login(page: Page, secret: string, expectTotp: boolean) {
      await page.getByLabel('メールアドレス').fill(email!);
      await page.getByLabel('パスワード').fill(password!);
      await page.getByRole('button', { name: 'SRP でログイン' }).click();
      if (expectTotp) {
        const input = page.getByLabel('認証アプリの6桁コード');
        await expect(input).toBeVisible();
        await waitForFreshCode();
        await input.fill(generateTotp(secret));
        await page.getByRole('button', { name: '確認', exact: true }).click();
      }
      await expect(page.getByTestId('device-remembered-status')).toBeVisible();
    }

    async function signOut(page: Page) {
      await page.getByRole('button', { name: 'サインアウト' }).click();
      await expect(page.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' })).toBeVisible();
    }

    try {
      const firstContext = await browser.newContext({ baseURL });
      contexts.push(firstContext);
      const setup = await firstContext.newPage();
      await setup.goto('/');
      await setup.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' }).click();
      await setup.locator('#signInFormUsername:visible').fill(email!);
      await setup.locator('#signInFormPassword:visible').fill(password!);
      await setup.locator('input[name="signInSubmitButton"]:visible').first().click();
      await expect(setup.getByRole('button', { name: 'MFA 設定', exact: true })).toBeVisible();
      await setup.getByRole('button', { name: 'MFA 設定', exact: true }).click();
      await expect(setup.getByTestId('mfa-status')).toBeVisible();
      if ((await setup.getByTestId('mfa-status').textContent())?.includes('有効')) {
        await setup.getByRole('button', { name: 'TOTP を無効にする' }).click();
        await expect(setup.getByTestId('mfa-status')).toHaveText('TOTP：無効');
      }
      await setup.getByRole('button', { name: '認証アプリを登録する', exact: true }).click();
      const secret = (await setup.getByTestId('totp-secret').textContent())!;
      expect(secret).toBeTruthy();
      await waitForFreshCode();
      await setup.getByLabel('認証アプリの6桁コード').fill(generateTotp(secret));
      await setup.getByRole('button', { name: 'コードを確認して有効にする' }).click();
      await expect(setup.getByTestId('mfa-status')).toHaveText('TOTP：有効（優先方式）');
      await setup.getByRole('button', { name: 'ホームに戻る' }).click();
      await setup.getByRole('button', { name: 'Sign Out', exact: true }).click();
      await expect(setup.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' })).toBeVisible();

      const first = await openPoc(firstContext);
      await login(first, secret, true);
      await expect(first.getByTestId('device-remembered-status')).toHaveText('この端末：未登録');
      await first.getByRole('button', { name: 'このブラウザを信頼する' }).click();
      await expect(first.getByTestId('device-remembered-status')).toHaveText('この端末：信頼済み');
      await signOut(first);

      const sameBrowser = await openPoc(firstContext);
      await login(sameBrowser, secret, false);
      await expect(sameBrowser.getByTestId('device-remembered-status')).toHaveText('この端末：信頼済み');
      await sameBrowser.getByRole('button', { name: 'この端末の信頼を解除' }).click();
      await expect(sameBrowser.getByTestId('device-remembered-status')).toHaveText('この端末：未登録');
      await signOut(sameBrowser);
      const forgottenBrowser = await openPoc(firstContext);
      await login(forgottenBrowser, secret, true);
      await expect(forgottenBrowser.getByTestId('device-remembered-status')).toHaveText('この端末：未登録');
      await signOut(forgottenBrowser);

      const otherContext = await browser.newContext({ baseURL });
      contexts.push(otherContext);
      const otherBrowser = await openPoc(otherContext);
      await login(otherBrowser, secret, true);
      await expect(otherBrowser.getByTestId('device-remembered-status')).toHaveText('この端末：未登録');
      await otherBrowser.getByRole('button', { name: 'ホームに戻る' }).click();
      await otherBrowser.getByRole('button', { name: 'MFA 設定', exact: true }).click();
      await otherBrowser.getByRole('button', { name: 'TOTP を無効にする' }).click();
      await expect(otherBrowser.getByTestId('mfa-status')).toHaveText('TOTP：無効');
    } finally {
      await Promise.allSettled(contexts.map(context => context.close()));
    }
  });
});
