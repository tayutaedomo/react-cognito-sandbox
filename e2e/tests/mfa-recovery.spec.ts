import { test, expect, type Browser, type Page } from '@playwright/test';
import { generateTotp } from '../helpers/totp.mjs';
import { createRecoveryAdmin } from '../helpers/mfa-recovery-admin.mjs';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';

test.describe('TOTP recovery and existing sessions', () => {
  test.skip(
    () => process.env.VITE_USE_MOCK_COGNITO !== 'false' || process.env.RUN_MFA_RECOVERY_E2E !== 'true',
    '専用ユーザーと管理者権限を用意して、復旧 POC コマンドで明示的に実行する',
  );

  test('interrupt, replace authenticator, recover lost factor and compare issued tokens', async ({ browser }) => {
    test.setTimeout(420_000);
    const admin = createRecoveryAdmin(process.env);
    const email = process.env.MFA_RECOVERY_USER_EMAIL!;
    const password = process.env.MFA_RECOVERY_USER_PASSWORD;
    expect(Boolean(password), 'MFA_RECOVERY_USER_PASSWORD is required').toBe(true);
    expect(await admin.isEnabled(), 'Start with TOTP disabled on the dedicated user').toBe(false);
    const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
    const frontendEnv = dotenv.parse(readFileSync(new URL('../../frontend/.env', import.meta.url)));
    const apiEndpoint = process.env.VITE_API_ENDPOINT || frontendEnv.VITE_API_ENDPOINT;
    expect(Boolean(apiEndpoint), 'Configure the real API endpoint').toBe(true);
    const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
    let firstSecret = '';
    let secondSecret = '';

    function totpInput(page: Page) {
      return page.locator('input[name="totpCode"]:visible, input[name="softwareTokenMfaCode"]:visible, input[autocomplete="one-time-code"]:visible')
        .or(page.getByRole('textbox', { name: /code|コード/i })).first();
    }

    async function passwordStep() {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      const page = await context.newPage();
      await page.goto('/');
      await page.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' }).click();
      await page.locator('#signInFormUsername:visible').fill(email);
      await page.locator('#signInFormPassword:visible').fill(password!);
      await page.locator('input[name="signInSubmitButton"]:visible').first().click();
      return page;
    }

    async function signedIn(page: Page) {
      await page.waitForURL(`${baseURL}/**`);
      await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeVisible();
      return page;
    }

    async function submitCode(page: Page, secret: string, rejectedSecret?: string) {
      await expect(totpInput(page)).toBeVisible();
      // 使用済みコードを避け、旧・新コードの偶然の一致も除外する。
      do {
        await new Promise(resolve => setTimeout(resolve, 30_000 - Date.now() % 30_000 + 500));
      } while (rejectedSecret && generateTotp(secret) === generateTotp(rejectedSecret));
      await totpInput(page).fill(generateTotp(secret));
      await page.getByRole('button', { name: /confirm|verify|sign in|submit|確認|検証|ログイン|送信/i }).first().click();
    }

    async function signIn(secret?: string) {
      const page = await passwordStep();
      if (secret) await submitCode(page, secret);
      return signedIn(page);
    }

    async function rejectOldAndAcceptNew(oldSecret: string, newSecret: string) {
      const page = await passwordStep();
      await submitCode(page, oldSecret, newSecret);
      await expect(totpInput(page), 'Old authenticator must not complete sign-in').toBeVisible();
      expect(page.url().startsWith(baseURL)).toBe(false);
      await submitCode(page, newSecret);
      return signedIn(page);
    }

    async function settings(page: Page, enabled: boolean) {
      await page.getByRole('button', { name: 'MFA 設定', exact: true }).click();
      await expect(page.getByTestId('mfa-status')).toHaveText(enabled ? 'TOTP：有効（優先方式）' : 'TOTP：無効');
    }

    async function startSetup(page: Page) {
      await page.getByRole('button', { name: '認証アプリを登録する', exact: true }).click();
      await expect(page.getByRole('img', { name: '認証アプリ登録用 QR コード' })).toBeVisible();
      const secret = await page.getByTestId('totp-secret').textContent();
      expect(Boolean(secret), 'Setup must provide a secret').toBe(true);
      return secret!;
    }

    async function completeSetup(page: Page, secret: string) {
      await page.getByLabel('認証アプリの6桁コード').fill(generateTotp(secret));
      await page.getByRole('button', { name: 'コードを確認して有効にする' }).click();
      await expect(page.getByTestId('mfa-status')).toHaveText('TOTP：有効（優先方式）');
      await expect(page.getByTestId('totp-secret')).toHaveCount(0);
    }

    // ブラウザ内に保持し、トークンをテスト出力・添付ファイルへ渡さない。
    async function rememberIssuedTokens(page: Page) {
      const found = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const id = localStorage.getItem(keys.find(key => key.endsWith('.idToken')) ?? '');
        const access = localStorage.getItem(keys.find(key => key.endsWith('.accessToken')) ?? '');
        (window as unknown as { recoveryTokens: unknown }).recoveryTokens = { id, access };
        return Boolean(id && access);
      });
      expect(found, 'Issued ID and access tokens must be available').toBe(true);
    }

    async function probeIssuedTokens(page: Page) {
      return page.evaluate(async apiEndpoint => {
        const { id, access } = (window as unknown as { recoveryTokens: { id: string; access: string } }).recoveryTokens;
        // Access トークンの iss から、このトークンを発行した Cognito に問い合わせる。
        const claims = JSON.parse(atob(access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        const issuer = new URL(claims.iss).origin;
        try {
          const api = await fetch(`${apiEndpoint}/api/users`, { headers: { Authorization: `Bearer ${id}` } });
          const cognito = await fetch(issuer, {
            method: 'POST', headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.GetUser' },
            body: JSON.stringify({ AccessToken: access }),
          });
          const result = cognito.ok ? {} : await cognito.json();
          return { api: api.status, cognito: cognito.status, error: result.__type?.split('#').pop() };
        } catch {
          throw new Error('Issued-token probe failed; check service connectivity.');
        }
      }, apiEndpoint);
    }

    try {
      await test.step('Interrupted setup can be restarted with a new key', async () => {
        const page = await signIn();
        await settings(page, false);
        const abandoned = await startSetup(page);
        await page.getByRole('button', { name: '登録を中断する' }).click();
        await expect(page.getByTestId('totp-secret')).toHaveCount(0);
        const secret = await startSetup(page);
        expect(secret !== abandoned, 'Restart must issue a new setup key').toBe(true);
        while (generateTotp(secret) === generateTotp(abandoned)) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await page.getByLabel('認証アプリの6桁コード').fill(generateTotp(abandoned));
        await page.getByRole('button', { name: 'コードを確認して有効にする' }).click();
        await expect(page.getByRole('alert')).toContainText('コードが一致しません');
        await completeSetup(page, secret);
        firstSecret = secret;
      });

      const existing = await signIn(firstSecret);
      await rememberIssuedTokens(existing);
      expect(await probeIssuedTokens(existing)).toEqual({ api: 200, cognito: 200, error: undefined });
      await settings(existing, true);

      await test.step('Canceling replacement preserves the previously verified authenticator', async () => {
        await existing.getByRole('button', { name: 'TOTP を無効にする' }).click();
        await expect(existing.getByTestId('mfa-status')).toHaveText('TOTP：無効');
        await startSetup(existing);
        await existing.getByRole('button', { name: '登録を中断する' }).click();
        await existing.getByRole('button', { name: '登録済みの認証アプリを有効にする' }).click();
        await expect(existing.getByTestId('mfa-status')).toHaveText('TOTP：有効（優先方式）');
        await signIn(firstSecret);
      });

      await test.step('Verified replacement rejects old codes without ending issued sessions', async () => {
        await existing.getByRole('button', { name: 'TOTP を無効にする' }).click();
        await expect(existing.getByTestId('mfa-status')).toHaveText('TOTP：無効');
        secondSecret = await startSetup(existing);
        await completeSetup(existing, secondSecret);
        await rejectOldAndAcceptNew(firstSecret, secondSecret);
        expect(await probeIssuedTokens(existing)).toEqual({ api: 200, cognito: 200, error: undefined });
      });

      await test.step('Administrator disables lost factor; user signs in and registers a replacement', async () => {
        const locked = await passwordStep();
        await expect(totpInput(locked), 'Lost authenticator prevents a new sign-in').toBeVisible();
        expect(locked.url().startsWith(baseURL)).toBe(false);
        await admin.disable();
        expect(await admin.isEnabled()).toBe(false);
        expect(await probeIssuedTokens(existing)).toEqual({ api: 200, cognito: 200, error: undefined });
        const recovered = await signIn();
        await settings(recovered, false);
        const replacement = await startSetup(recovered);
        await completeSetup(recovered, replacement);
        await rejectOldAndAcceptNew(secondSecret, replacement);
      });

      await test.step('Global sign-out rejects Cognito access token but API Gateway still accepts unexpired JWT', async () => {
        await admin.globalSignOut();
        const result = await probeIssuedTokens(existing);
        expect(result).toEqual({ api: 200, cognito: 400, error: 'NotAuthorizedException' });
      });
    } finally {
      // 専用ユーザーのみを無効状態へ戻し、発行した Cognito セッションを失効する。
      try {
        await admin.disable();
        await admin.globalSignOut();
      } finally {
        await Promise.allSettled(contexts.map(context => context.close()));
      }
    }
  });
});
