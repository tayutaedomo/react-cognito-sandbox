import { test, expect } from '@playwright/test';

// このテストは本物の Cognito と API Gateway を使用する「実環境」想定のテストです。
// ※ 実行には VITE_USE_MOCK_COGNITO=false およびテスト用ユーザーの環境変数が必要です。

test.describe('Real Cognito Authentication Flow', () => {
  // テストの事前準備
  test.skip(
    () => process.env.VITE_USE_MOCK_COGNITO === 'true' || !process.env.VITE_USE_MOCK_COGNITO,
    'VITE_USE_MOCK_COGNITO が false の実環境でのみ実行します'
  );

  test('Hosted UI でログインし、ユーザー一覧を取得できること', async ({ page }) => {
    // コンソール出力をキャプチャしてデバッグ
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

    // 1. トップページへアクセス
    await page.goto('/');
    
    // 初期状態の確認
    await expect(page.locator('text=Please sign in to access the application.')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/real-01-initial.png' });

    // 2. サインインボタンをクリック
    // App.tsx の表示は Sign In (Mock) だが、ここでは AmplifyAuthProvider の実装により本物へ飛ぶ
    await page.click('button:has-text("Sign In")');
    await page.waitForLoadState('networkidle');

    // Hosted UI (amazoncognito.com) へ遷移しているか確認
    await expect(page).toHaveURL(/.*amazoncognito\.com.*/);
    await page.screenshot({ path: 'test-results/screenshots/real-02-hosted-ui.png' });

    // 3. Hosted UI 上で認証情報の入力
    const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
    const testPassword = process.env.TEST_USER_PASSWORD || 'Password123!';
    
    await page.fill('#signInFormUsername:visible', testEmail);
    await page.fill('#signInFormPassword:visible', testPassword);
    
    // signInSubmitButton が複数ある場合を考慮し、可視状態のボタンをクリックする
    await page.locator('input[name="signInSubmitButton"]:visible').first().click();

    // 4. localhost にコールバックで戻ってくるのを待つ
    await page.waitForURL('http://localhost:5173/**');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/screenshots/real-03-after-callback.png' });

    // 5. ログイン成功後の画面確認
    await expect(page.locator('text=Sign Out')).toBeVisible({ timeout: 10000 });

    // 6. ユーザー情報 (API Gateway 経由) の取得確認
    await page.click('button:has-text("Fetch Users")');
    
    // "test@example.com" など、実際の Cognito に存在するユーザーが画面に描画されるはず
    await expect(page.locator('ul')).toContainText(testEmail, { timeout: 10000 });
    await page.screenshot({ path: 'test-results/screenshots/real-04-after-fetch.png' });
  });
});
