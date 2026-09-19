import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test.describe('Mock Auth and API E2E', () => {
  test('should sign in with mock and fetch users', async ({ page }) => {
    // スクリーンショット用のディレクトリが存在するか確認（Playwright は親ディレクトリを自動作成しますが念のため）
    
    // 1. トップページにアクセス
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('React + Cognito POC');
    
    // Check initial state (Not signed in)
    await expect(page.locator('text=Please sign in to access the application.')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/01-initial-state.png', fullPage: true });
    
    // 2. Sign In (Mock) ボタンのクリック
    await page.click('button:has-text("Sign In (Mock)")');
    
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
