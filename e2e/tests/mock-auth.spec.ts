import { test, expect } from '@playwright/test';

test.describe('Mock Auth and API E2E', () => {
  test.skip(
    () => process.env.VITE_USE_MOCK_COGNITO === 'false',
    '実環境モード(VITE_USE_MOCK_COGNITO=false)ではモックのテストをスキップします'
  );

  test('MFA registration, mismatch retry, disable, and re-enable', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'ログイン / 登録 / パスワード再設定 (Managed Login)' }).click();
    await page.getByRole('button', { name: 'MFA 設定', exact: true }).click();
    await expect(page.getByTestId('mfa-status')).toHaveText('TOTP：無効');
    await page.screenshot({ path: 'test-results/screenshots/04-mfa-disabled.png', fullPage: true });
    await page.getByRole('button', { name: '登録済みの認証アプリを有効にする' }).click();
    await expect(page.getByRole('alert')).toContainText('登録');
    await page.getByRole('button', { name: '認証アプリを登録する', exact: true }).click();
    await expect(page.getByRole('img', { name: '認証アプリ登録用 QR コード' })).toBeVisible();
    // モックの固定シークレットのみ撮影する。実 Cognito の QR は撮影しない。
    await page.screenshot({ path: 'test-results/screenshots/05-mfa-registration-mock.png', fullPage: true });
    await page.getByLabel('認証アプリの6桁コード').fill('000000');
    await page.getByRole('button', { name: 'コードを確認して有効にする' }).click();
    await expect(page.getByRole('alert')).toContainText('コードが一致しません');
    await page.screenshot({ path: 'test-results/screenshots/06-mfa-invalid-code.png', fullPage: true });
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

  test('should sign in with mock and fetch users', async ({ page }) => {
    // スクリーンショット用のディレクトリが存在するか確認（Playwright は親ディレクトリを自動作成しますが念のため）
    
    // 1. トップページにアクセス
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('React + Cognito POC');
    
    // Check initial state (Not signed in)
    await expect(page.locator('text=ログイン、新規登録、またはパスワードを忘れた場合の再設定は')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/01-initial-state.png', fullPage: true });
    
    // 2. Sign In (Mock) ボタンのクリック
    await page.click('button:has-text("ログイン / 登録 / パスワード再設定 (Managed Login)")');
    
    // Wait for mock login to complete
    await expect(page.locator('text=Welcome, mock@example.com!')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'test-results/screenshots/02-after-signin.png', fullPage: true });
    
    // 3. Fetch Users API の呼び出し
    await page.click('button:has-text("Fetch Users")');
    
    // Check if the mock user is displayed
    await expect(page.locator('text=user1@example.com (CONFIRMED)')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=user2@example.com (CONFIRMED)')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/03-after-fetch-users.png', fullPage: true });
  });
});
