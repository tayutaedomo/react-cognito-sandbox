import { test, expect } from '@playwright/test';

test.describe('Mock Auth and API E2E', () => {
  test.skip(
    () => process.env.VITE_USE_MOCK_COGNITO === 'false',
    '実環境モード(VITE_USE_MOCK_COGNITO=false)ではモックのテストをスキップします',
  );

  test('disables both login routes while authentication is loading', async ({ page }) => {
    const now = new Date('2026-10-12T00:00:00Z');
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now);
    await page.goto('/');
    await page.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' }).click();
    await expect(page.getByRole('button', { name: '処理中...', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'メールアドレスでログイン（SRP）' })).toBeDisabled();
    await page.clock.runFor(500);
    await expect(page.getByRole('button', { name: 'プロフィール編集', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'サインアウト', exact: true })).toBeEnabled();
  });

  test('locks all home actions during Users API requests and unlocks after success or failure', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' }).click();
    await expect(page.getByRole('button', { name: 'ユーザー一覧を取得' })).toBeEnabled();
    let requests = 0;
    let release: () => void = () => {};
    let finish = new Promise<void>((resolve) => {
      release = resolve;
    });
    let status = 200;
    await page.route('**/api/users', async (route) => {
      requests++;
      await finish;
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: status === 200 ? JSON.stringify([{ id: 'test', email: 'test@example.com', status: 'CONFIRMED' }]) : '{}',
      });
    });
    await page.getByRole('button', { name: 'ユーザー一覧を取得' }).click();
    for (const name of ['取得中...', 'プロフィール編集', 'サインアウト', 'MFA 設定'])
      await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    // 無効なボタンへイベントを送っても、追加リクエストを発生させない。
    await page.getByRole('button', { name: '取得中...', exact: true }).dispatchEvent('click');
    expect(requests).toBe(1);
    release();
    await expect(page.getByText('test@example.com (CONFIRMED)')).toBeVisible();
    for (const name of ['ユーザー一覧を取得', 'プロフィール編集', 'サインアウト', 'MFA 設定'])
      await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
    finish = new Promise<void>((resolve) => {
      release = resolve;
    });
    status = 503;
    await page.getByRole('button', { name: 'ユーザー一覧を取得' }).click();
    await expect(page.getByRole('button', { name: '取得中...', exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole('alert')).toContainText('503');
    for (const name of ['ユーザー一覧を取得', 'プロフィール編集', 'サインアウト', 'MFA 設定'])
      await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
  });

  test('MFA registration, mismatch retry, disable, and re-enable', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' }).click();
    await page.getByRole('button', { name: 'MFA 設定', exact: true }).click();
    await expect(page.getByTestId('mfa-status')).toHaveText('TOTP：無効');
    await expect(page.getByTestId('registered-devices-empty')).toBeVisible();
    await expect(page.getByText('このログインでは現在のブラウザを特定できません。')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/04-mfa-disabled.png', fullPage: true });
    await page.getByRole('button', { name: '登録済みの認証アプリを有効にする' }).click();
    await expect(page.getByRole('alert')).toContainText('登録');
    await page.getByRole('button', { name: '認証アプリを登録する', exact: true }).click();
    await expect(page.getByRole('img', { name: '認証アプリ登録用 QR コード' })).toBeVisible();
    // モックの固定シークレットのみ撮影する。実 Cognito の QR は撮影しない。
    await page.screenshot({
      path: 'test-results/screenshots/05-mfa-registration-mock.png',
      fullPage: true,
    });
    await page.getByLabel('認証アプリの6桁コード').fill('000000');
    await page.getByRole('button', { name: 'コードを確認して有効にする' }).click();
    await expect(page.getByRole('alert')).toContainText('コードが一致しません');
    await page.screenshot({
      path: 'test-results/screenshots/06-mfa-invalid-code.png',
      fullPage: true,
    });
    await page.getByLabel('認証アプリの6桁コード').fill('123456');
    await page.getByRole('button', { name: 'コードを確認して有効にする' }).click();
    await expect(page.getByTestId('mfa-status')).toHaveText('TOTP：有効（優先方式）');
    await expect(page.getByTestId('totp-secret')).toHaveCount(0);
    await expect(page.getByRole('img')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/screenshots/07-mfa-enabled.png', fullPage: true });
    await page.getByRole('button', { name: 'TOTP を無効にする' }).click();
    await expect(page.getByTestId('mfa-status')).toHaveText('TOTP：無効');
    await page.getByRole('button', { name: '登録済みの認証アプリを有効にする' }).click();
    await expect(page.getByTestId('mfa-status')).toHaveText('TOTP：有効（優先方式）');
  });

  test('email MFA preferences and SRP method selection', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' }).click();
    await page.getByRole('button', { name: 'MFA 設定', exact: true }).click();
    await page.getByRole('button', { name: 'メール MFA を有効にする', exact: true }).click();
    await expect(page.getByTestId('email-mfa-status')).toHaveText('メール：有効（優先方式）');
    await page.getByRole('button', { name: '認証アプリを登録する', exact: true }).click();
    await page.getByLabel('認証アプリの6桁コード').fill('123456');
    await page.getByRole('button', { name: 'コードを確認して有効にする' }).click();
    await page.getByLabel('優先方式').selectOption('TOTP');
    await expect(page.getByTestId('mfa-status')).toHaveText('TOTP：有効（優先方式）');
    await page.getByLabel('優先方式').selectOption('EMAIL');
    await expect(page.getByTestId('email-mfa-status')).toHaveText('メール：有効（優先方式）');
    await page.getByLabel('優先方式').selectOption('choose');
    await expect(page.getByTestId('email-mfa-status')).toHaveText('メール：有効');
    await expect(page.getByTestId('mfa-status')).toHaveText('TOTP：有効');
    await page.screenshot({ path: 'test-results/screenshots/10-email-mfa-settings-mock.png', fullPage: true });
    await page.getByRole('button', { name: 'ホームに戻る' }).click();
    await page.getByRole('button', { name: 'サインアウト', exact: true }).click();
    await page.getByRole('button', { name: 'メールアドレスでログイン（SRP）' }).click();
    await page.getByLabel('メールアドレス', { exact: true }).fill('mock@example.com');
    await page.getByLabel('パスワード', { exact: true }).fill('mock-password');
    await page.getByRole('button', { name: 'SRP でログイン' }).click();
    await page.screenshot({ path: 'test-results/screenshots/11-mfa-selection-mock.png', fullPage: true });
    await page.getByRole('button', { name: 'メールで確認', exact: true }).click();
    await expect(page.getByText('m***@e***', { exact: false })).toBeVisible();
    await page.getByLabel('メールの6桁コード').fill('000000');
    await page.getByRole('button', { name: '確認', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/12-email-code-retry-mock.png', fullPage: true });
    await page.getByLabel('メールの6桁コード').fill('123456');
    await page.getByRole('button', { name: '確認', exact: true }).click();
    await expect(page.getByTestId('device-remembered-status')).toBeVisible();
    await page.getByRole('button', { name: 'このブラウザを信頼する' }).click();
    await page.getByRole('button', { name: 'ホームに戻る' }).click();
    await page.getByRole('button', { name: 'MFA 設定', exact: true }).click();
    await page.getByRole('button', { name: 'メール MFA を無効にする', exact: true }).click();
    await expect(page.getByTestId('mfa-status')).toHaveText('TOTP：有効（優先方式）');
    await expect(page.getByTestId('registered-devices-list')).toContainText('信頼済み');
    await page.getByRole('button', { name: 'ホームに戻る' }).click();
    await page.getByRole('button', { name: 'サインアウト', exact: true }).click();
    await page.getByRole('button', { name: 'メールアドレスでログイン（SRP）' }).click();
    await page.getByLabel('メールアドレス', { exact: true }).fill('mock@example.com');
    await page.getByLabel('パスワード', { exact: true }).fill('mock-password');
    await page.getByRole('button', { name: 'SRP でログイン' }).click();
    await expect(page.getByTestId('device-remembered-status')).toHaveText('この端末：信頼済み');
    await expect(page.getByLabel('認証アプリの6桁コード')).toHaveCount(0);
  });

  test('SMS phone verification, three-factor preferences, selection and retry', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' }).click();
    await page.getByRole('button', { name: 'MFA 設定', exact: true }).click();
    await expect(page.getByRole('button', { name: 'SMS MFA を有効にする', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '電話番号の確認コードを送信', exact: true }).click();
    await page.getByLabel('電話番号の確認コード', { exact: true }).fill('000000');
    await page.getByRole('button', { name: '電話番号を確認する', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('コードが一致しません');
    await page.getByLabel('電話番号の確認コード', { exact: true }).fill('123456');
    await page.getByRole('button', { name: '電話番号を確認する', exact: true }).click();
    await page.getByRole('button', { name: 'SMS MFA を有効にする', exact: true }).click();
    await expect(page.getByTestId('sms-mfa-status')).toHaveText('SMS：有効（優先方式）');
    await page.getByRole('button', { name: 'メール MFA を有効にする', exact: true }).click();
    await page.getByRole('button', { name: '認証アプリを登録する', exact: true }).click();
    await page.getByLabel('認証アプリの6桁コード').fill('123456');
    await page.getByRole('button', { name: 'コードを確認して有効にする' }).click();
    for (const method of ['TOTP', 'EMAIL', 'SMS', 'choose']) {
      await page.getByLabel('優先方式').selectOption(method);
      await expect(page.getByRole('status')).toContainText('ログイン時の方式を保存しました');
      const statuses = { TOTP: 'mfa-status', EMAIL: 'email-mfa-status', SMS: 'sms-mfa-status' };
      for (const [value, id] of Object.entries(statuses)) {
        if (value === method) await expect(page.getByTestId(id)).toContainText('優先方式');
        else await expect(page.getByTestId(id)).not.toContainText('優先方式');
      }
    }
    await page.screenshot({ path: 'test-results/screenshots/13-three-factor-settings-mock.png', fullPage: true });
    await page.getByRole('button', { name: 'ホームに戻る' }).click();
    await page.getByRole('button', { name: 'サインアウト', exact: true }).click();
    await page.getByRole('button', { name: 'メールアドレスでログイン（SRP）' }).click();
    await page.getByLabel('メールアドレス', { exact: true }).fill('mock@example.com');
    await page.getByLabel('パスワード', { exact: true }).fill('mock-password');
    await page.getByRole('button', { name: 'SRP でログイン' }).click();
    await expect(page.getByRole('button', { name: '認証アプリで確認' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'メールで確認' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'SMSで確認' })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/14-three-factor-selection-mock.png', fullPage: true });
    await page.getByRole('button', { name: 'SMSで確認' }).click();
    await expect(page.getByText('+********5678', { exact: false })).toBeVisible();
    await page.getByLabel('SMSの6桁コード').fill('000000');
    await page.getByRole('button', { name: '確認', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('コードが一致しません');
    await page.screenshot({ path: 'test-results/screenshots/15-sms-code-retry-mock.png', fullPage: true });
    await page.getByLabel('SMSの6桁コード').fill('123456');
    await page.getByRole('button', { name: '確認', exact: true }).click();
    await page.getByRole('button', { name: 'ホームに戻る' }).click();
    await page.getByRole('button', { name: 'MFA 設定', exact: true }).click();
    await page.getByRole('button', { name: 'SMS MFA を無効にする', exact: true }).click();
    await expect(page.getByTestId('sms-mfa-status')).toHaveText('SMS：無効');
    await expect(page.getByTestId('mfa-status')).toHaveText('TOTP：有効');
    await expect(page.getByTestId('email-mfa-status')).toHaveText('メール：有効');
  });

  test('SMS-only MFA is skipped on a trusted browser and required again after forgetting', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' }).click();
    await page.getByRole('button', { name: 'MFA 設定', exact: true }).click();
    await page.getByRole('button', { name: '電話番号の確認コードを送信' }).click();
    await page.getByLabel('電話番号の確認コード').fill('123456');
    await page.getByRole('button', { name: '電話番号を確認する', exact: true }).click();
    await page.getByRole('button', { name: 'SMS MFA を有効にする', exact: true }).click();
    await page.getByRole('button', { name: 'ホームに戻る' }).click();
    await page.getByRole('button', { name: 'サインアウト', exact: true }).click();
    async function signIn() {
      await page.getByRole('button', { name: 'メールアドレスでログイン（SRP）' }).click();
      await page.getByLabel('メールアドレス', { exact: true }).fill('mock@example.com');
      await page.getByLabel('パスワード', { exact: true }).fill('mock-password');
      await page.getByRole('button', { name: 'SRP でログイン' }).click();
    }
    await signIn();
    await page.getByLabel('SMSの6桁コード').fill('123456');
    await page.getByRole('button', { name: '確認', exact: true }).click();
    await page.getByRole('button', { name: 'このブラウザを信頼する' }).click();
    await page.getByRole('button', { name: 'サインアウト', exact: true }).click();
    await signIn();
    await expect(page.getByTestId('device-remembered-status')).toHaveText('この端末：信頼済み');
    await expect(page.getByLabel('SMSの6桁コード')).toHaveCount(0);
    await page.getByRole('button', { name: 'この端末の信頼を解除' }).click();
    await page.getByRole('button', { name: 'サインアウト', exact: true }).click();
    await signIn();
    await expect(page.getByLabel('SMSの6桁コード')).toBeVisible();
  });

  test('cancelling registration removes the QR code and setup key', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' }).click();
    await page.getByRole('button', { name: 'MFA 設定', exact: true }).click();
    await page.getByRole('button', { name: '認証アプリを登録する', exact: true }).click();
    await expect(page.getByRole('img')).toBeVisible();
    await page.getByRole('button', { name: '登録を中断する' }).click();
    await expect(page.getByRole('img')).toHaveCount(0);
    await expect(page.getByTestId('totp-secret')).toHaveCount(0);
    await expect(page.getByTestId('mfa-status')).toHaveText('TOTP：無効');
  });

  test('shows registered devices after leaving the SRP sign-in screen', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'メールアドレスでログイン（SRP）' }).click();
    await page.getByLabel('メールアドレス').fill('mock@example.com');
    await page.getByLabel('パスワード').fill('mock-password');
    await page.getByRole('button', { name: 'SRP でログイン' }).click();
    // MFA を有効化していない OPTIONAL ユーザーは、コードなしでログインする。
    await expect(page.getByTestId('device-remembered-status')).toHaveText('この端末：一覧にありません');
    await page.getByRole('button', { name: 'このブラウザを信頼する' }).click();
    await expect(page.getByTestId('device-remembered-status')).toHaveText('この端末：信頼済み');

    await page.getByRole('button', { name: 'ホームに戻る' }).click();
    await page.getByRole('button', { name: 'MFA 設定', exact: true }).click();
    await expect(page.getByTestId('registered-devices-list')).toContainText('Mock device（このブラウザ）');
    await expect(page.getByTestId('registered-devices-list')).toContainText('信頼済み');
    await page.evaluate(() => {
      localStorage.setItem('test.deviceKey', 'mock-device');
      localStorage.setItem('test.randomPassword', 'mock-secret-only');
      localStorage.setItem('test.idToken', 'mock-token-only');
      localStorage.setItem('test.other', 'mock-other-only');
    });
    await page.getByRole('button', { name: 'localStorage を読み込む' }).click();
    const storage = page.getByRole('region', { name: 'このブラウザの保存情報' });
    await expect(storage).toContainText('Cognito の対応デバイス：Mock device（信頼済み）');
    await storage.locator('summary').filter({ hasText: 'test.randomPassword' }).click();
    await expect(storage).not.toContainText('mock-secret-only');
    await storage.getByRole('button', { name: 'マスクを解除して表示' }).click();
    await expect(storage).toContainText('mock-secret-only');
    await page.getByRole('button', { name: 'localStorage を読み込む' }).click();
    await expect(storage).not.toContainText('mock-secret-only');
    await page.screenshot({
      path: 'test-results/screenshots/08-registered-devices-mock.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'デバイス一覧を再読み込み' }).click();
    await expect(page.getByTestId('registered-devices-list')).toContainText('Mock device');
  });

  test('should sign in with mock and fetch users', async ({ page }) => {
    // スクリーンショット用のディレクトリが存在するか確認（Playwright は親ディレクトリを自動作成しますが念のため）

    // 1. トップページにアクセス
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('React + Cognito POC');

    // Check initial state (Not signed in)
    await expect(page.locator('text=ログイン、新規登録、またはパスワードを忘れた場合の再設定は')).toBeVisible();
    await page.screenshot({
      path: 'test-results/screenshots/01-initial-state.png',
      fullPage: true,
    });

    // 2. Sign In (Mock) ボタンのクリック
    await page.click('button:has-text("ログイン / 登録 / パスワード再設定 (Managed Login)")');

    // Wait for mock login to complete
    await expect(page.locator('text=mock@example.com でサインイン中')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'test-results/screenshots/02-after-signin.png', fullPage: true });

    // 3. ユーザー一覧を取得 API の呼び出し
    await page.click('button:has-text("ユーザー一覧を取得")');

    // Check if the mock user is displayed
    await expect(page.locator('text=user1@example.com (CONFIRMED)')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=user2@example.com (CONFIRMED)')).toBeVisible();
    await page.screenshot({
      path: 'test-results/screenshots/03-after-fetch-users.png',
      fullPage: true,
    });
  });
});
