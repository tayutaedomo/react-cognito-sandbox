import { expect, type Page } from '@playwright/test';
import { generateTotp } from './totp.mjs';

// 初回登録は手動で行い、専用テストユーザーの登録済みシークレットを使用する。
export async function completeTotp(page: Page) {
  const secret = process.env.TEST_USER_TOTP_SECRET;
  if (!secret) return;

  const codeInput = page.locator(
    'input[name="totpCode"]:visible, input[name="softwareTokenMfaCode"]:visible, input[autocomplete="one-time-code"]:visible',
  ).or(page.getByRole('textbox', { name: /code|コード/i })).first();
  await expect(codeInput, '登録済みユーザーの TOTP 入力画面が必要です。初回登録は手動で完了してください。').toBeVisible();
  // 有効期間末尾のコード送信を避ける。固定コードを環境変数で受け取らない。
  const remaining = 30_000 - Date.now() % 30_000;
  if (remaining < 5000) await new Promise(resolve => setTimeout(resolve, remaining + 100));
  await codeInput.fill(generateTotp(secret));
  await page.getByRole('button', { name: /confirm|verify|sign in|submit|確認|検証|ログイン|送信/i }).first().click();
}
