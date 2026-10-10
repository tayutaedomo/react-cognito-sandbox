import { test, expect, type Browser, type Page } from '@playwright/test';
import { generateTotp } from '../helpers/totp.mjs';

test.describe('Optional TOTP MFA', () => {
  test.skip(
    () => process.env.VITE_USE_MOCK_COGNITO !== 'false' || process.env.RUN_MFA_OPTIONAL_E2E !== 'true',
    '専用の OPTIONAL 環境とテストユーザーを用意して明示的に実行する',
  );

  test('register, require TOTP, disable, re-enable, and require TOTP again', async ({ browser }) => {
    test.setTimeout(180_000);
    const email = process.env.MFA_OPTIONAL_USER_EMAIL;
    const password = process.env.MFA_OPTIONAL_USER_PASSWORD;
    expect(email, 'MFA_OPTIONAL_USER_EMAIL is required').toBeTruthy();
    expect(password, 'MFA_OPTIONAL_USER_PASSWORD is required').toBeTruthy();
    const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
    const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

    async function signIn(secret?: string): Promise<Page> {
      // Cookie と Amplify の保存領域を引き継がず、毎回認証要求を観測する。
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      const page = await context.newPage();
      await page.goto('/');
      await page.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' }).click();
      await page.locator('#signInFormUsername:visible').fill(email!);
      await page.locator('#signInFormPassword:visible').fill(password!);
      await page.locator('input[name="signInSubmitButton"]:visible').first().click();
      if (secret) {
        const input = page.locator('input[name="totpCode"]:visible, input[name="softwareTokenMfaCode"]:visible, input[autocomplete="one-time-code"]:visible')
          .or(page.getByRole('textbox', { name: /code|コード/i })).first();
        await expect(input).toBeVisible();
        await new Promise(resolve => setTimeout(resolve, 30_000 - Date.now() % 30_000 + 500));
        await input.fill(generateTotp(secret));
        await page.getByRole('button', { name: /confirm|verify|sign in|submit|確認|検証|ログイン|送信/i }).first().click();
      }
      await page.waitForURL(`${baseURL}/**`);
      await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeVisible();
      return page;
    }

    async function openSettings(page: Page, enabled: boolean) {
      await page.getByRole('button', { name: 'MFA 設定', exact: true }).click();
      await expect(page.getByTestId('mfa-status')).toHaveText(enabled ? 'TOTP：有効（優先方式）' : 'TOTP：無効');
    }

    async function signOut(page: Page) {
      await page.getByRole('button', { name: 'ホームに戻る' }).click();
      await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
      await expect(page.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' })).toBeVisible();
    }

    try {
      const initial = await signIn();
      await openSettings(initial, false);
      await initial.getByRole('button', { name: '認証アプリを登録する', exact: true }).click();
      await expect(initial.getByRole('img', { name: '認証アプリ登録用 QR コード' })).toBeVisible();
      const secret = (await initial.getByTestId('totp-secret').textContent())!;
      expect(secret).toBeTruthy();
      const wrong = generateTotp(secret) === '000000' ? '000001' : '000000';
      await initial.getByLabel('認証アプリの6桁コード').fill(wrong);
      await initial.getByRole('button', { name: 'コードを確認して有効にする' }).click();
      await expect(initial.getByRole('alert')).toContainText('コードが一致しません');
      await initial.getByLabel('認証アプリの6桁コード').fill(generateTotp(secret));
      await initial.getByRole('button', { name: 'コードを確認して有効にする' }).click();
      await expect(initial.getByTestId('mfa-status')).toHaveText('TOTP：有効（優先方式）');
      await expect(initial.getByTestId('totp-secret')).toHaveCount(0);
      await expect(initial.getByRole('img')).toHaveCount(0);
      await signOut(initial);

      const enabled = await signIn(secret);
      const usersResponse = enabled.waitForResponse(response => response.url().endsWith('/api/users'), { timeout: 30_000 });
      await enabled.getByRole('button', { name: 'Fetch Users' }).click();
      expect((await usersResponse).status()).toBe(200);
      await expect(enabled.locator('ul')).toContainText(email!, { timeout: 10_000 });
      await openSettings(enabled, true);
      await enabled.getByRole('button', { name: 'TOTP を無効にする' }).click();
      await expect(enabled.getByTestId('mfa-status')).toHaveText('TOTP：無効');
      await signOut(enabled);

      const disabled = await signIn();
      await openSettings(disabled, false);
      await disabled.getByRole('button', { name: '登録済みの認証アプリを有効にする' }).click();
      await expect(disabled.getByTestId('mfa-status')).toHaveText('TOTP：有効（優先方式）');
      await expect(disabled.getByRole('img')).toHaveCount(0);
      await signOut(disabled);

      const reenabled = await signIn(secret);
      await openSettings(reenabled, true);
      // 専用ユーザーは再実行可能な無効状態へ戻す。関連付けは保持される。
      await reenabled.getByRole('button', { name: 'TOTP を無効にする' }).click();
      await expect(reenabled.getByTestId('mfa-status')).toHaveText('TOTP：無効');
      await signOut(reenabled);
    } finally {
      await Promise.allSettled(contexts.map(context => context.close()));
    }
  });
});
