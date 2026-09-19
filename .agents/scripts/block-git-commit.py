#!/usr/bin/env python3
import sys
import json

def main():
    try:
        # 1. 起動時に stdin から渡されるペイロードを読み込む
        payload = json.load(sys.stdin)
        
        # 2. toolCall の情報を取り出す
        tool_call = payload.get("toolCall", {})
        tool_name = tool_call.get("name", "")
        args = tool_call.get("args", {})
        
        # 3. run_command の中身をチェックする
        if tool_name == "run_command":
            cmd = args.get("CommandLine", "")
            # "git commit" という文字列が含まれていたら強制ブロック
            if "git commit" in cmd:
                print(json.dumps({
                    "decision": "deny",
                    "reason": "Agent (Antigravity) is strictly forbidden from executing 'git commit' by the workspace hook."
                }))
                sys.exit(0)
                
        # 問題なければ allow を返す
        print(json.dumps({
            "decision": "allow"
        }))
        
    except Exception as e:
        # 万が一パースエラーなど起きても allow でフォールバック（または deny にする）
        print(json.dumps({
            "decision": "allow",
            "reason": f"Hook error: {e}"
        }))

if __name__ == "__main__":
    main()
