#!/usr/bin/env python3
import json
import sys

def convert(txt_file, project_id=None):
    accounts = []

    with open(txt_file, 'r') as f:
        for line in f:
            token = line.strip()
            if not token:
                continue

            account = {"refresh_token": token}
            if project_id:
                account["project_id"] = project_id

            accounts.append(account)

    with open('accounts.json', 'w') as f:
        json.dump(accounts, f, indent=2)

    print(f"已生成 accounts.json，共 {len(accounts)} 个账号")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python convert_tokens.py <tokens.txt> [project_id]")
        sys.exit(1)

    txt_file = sys.argv[1]
    project_id = sys.argv[2] if len(sys.argv) > 2 else None

    convert(txt_file, project_id)
