#!/bin/bash
PAYLOAD=$(cat)
# もっとシンプルに、文字列がペイロード内に存在するかだけで判定
if echo "$PAYLOAD" | grep -q 'run_command'; then
  if echo "$PAYLOAD" | grep -q 'git commit'; then
    echo '{"decision": "force_ask", "reason": "git commit が要求されました。内容を確認し、問題なければ許可（Allow）してください。"}'
    exit 0
  fi
fi
echo '{"decision": "allow"}'
