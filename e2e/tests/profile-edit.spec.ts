import { test, expect } from '@playwright/test';

test.describe('Profile Editing Flow', () => {
  test.skip(
    () => process.env.VITE_USE_MOCK_COGNITO === 'true' || !process.env.VITE_USE_MOCK_COGNITO,
    'VITE_USE_MOCK_COGNITO が false の実環境でのみ実行します'
  );

  test('ログインしてプロフィールを編集・保存できること', async ({ page }) => {
    
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    await page.goto('/');

    // ログインボタンが表示されているか確認 (すでにログイン済みの場合はスキップ)
    const loginButton = page.locator('button:has-text("ログイン / 登録 / パスワード再設定 (Managed Login)")');
    if (await loginButton.isVisible()) {
      await loginButton.click();
      await page.waitForLoadState('networkidle');

      const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
      const testPassword = process.env.TEST_USER_PASSWORD || 'Password123!';

      await page.fill('#signInFormUsername:visible', testEmail);
      await page.fill('#signInFormPassword:visible', testPassword);
      await page.locator('input[name="signInSubmitButton"]:visible').first().click();
      
      const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
      await page.waitForURL(`${baseUrl}/**`);
      await page.waitForLoadState('networkidle');
    }

    // ホーム画面にいることを確認
    await expect(page.locator('text=Edit Profile')).toBeVisible({ timeout: 10000 });

    // Profile 編集画面へ遷移
    await page.click('button:has-text("Edit Profile")');
    await expect(page.locator('text=Edit Profile')).toBeVisible(); // h2
    
    // 入力可能な状態になるのを待つ
    await expect(page.locator('input[name="name"]')).toBeEnabled({ timeout: 5000 });

    // 名前と電話番号を更新
    const newName = `Test User ${Date.now()}`;
    await page.fill('input[name="name"]', newName);
    await page.fill('input[name="phone_number"]', '+819012345678');

    // Save
    await page.click('button:has-text("Save Profile")');

    // サクセスメッセージを待つ
    await expect(page.locator('text=Profile updated successfully!')).toBeVisible({ timeout: 10000 });

    // 一旦ホームに戻る
    await page.click('button:has-text("Back to Home")');
    
    // 再度 Profile を開いて値が保持されているか確認
    await page.click('button:has-text("Edit Profile")');
    await expect(page.locator('input[name="name"]')).toHaveValue(newName);
    await expect(page.locator('input[name="phone_number"]')).toHaveValue('+819012345678');
    
    // ホームに戻る
    await page.click('button:has-text("Back to Home")');
    
    // API ログを出力させるために Fetch Users を実行
    await page.click('button:has-text("Fetch Users")');
    // 何らかのリスト（Users）が表示されるか、またはエラーが出ないことを確認
    // 成功していれば ul > li が表示されるはず
    await expect(page.locator('ul > li').first()).toBeVisible({ timeout: 10000 });
  });
});
