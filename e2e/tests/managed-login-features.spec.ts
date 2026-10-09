import { test, expect } from '@playwright/test';

test.describe('Managed Login Features (Advanced)', () => {
  test.skip(
    () => process.env.VITE_USE_MOCK_COGNITO === 'true' || !process.env.VITE_USE_MOCK_COGNITO,
    'VITE_USE_MOCK_COGNITO が false の実環境でのみ実行します'
  );

  test('パスワードリセット (Forgot Password) の画面遷移と挙動確認', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("ログイン / 登録 / パスワード再設定 (Managed Login)")');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*amazoncognito\.com.*/);

    // Cognito Hosted UI (Managed Login) の Forgot Password リンクをクリック
    // "Forgot your password?" または "パスワードを忘れた場合"
    const forgotLink = page.getByRole('link', { name: /forgot|忘れた|Forgot your password/i }).first();
    await forgotLink.click();
    await page.waitForLoadState('networkidle');

    // リセットコード送信用のボタンがあるか (Managed Login)
    await expect(page.locator('input[name="reset_my_password_button"]').or(page.getByRole('button', { name: /reset|送信|Send/i }))).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/forgot-password-01.png' });

    // ※ ここから先は、実際に登録済み（Verified）のメールアドレスでないと
    // Cognito がエラーを返すか画面遷移しないため、E2Eテストは画面到達の確認までとします。
    // 手動テストの際はここにご自身のメールアドレスを入力して送信してください。
  });
});
