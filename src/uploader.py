import httpx
import json

# ============ 配置区域 ============
NEW_API_PASSWORD = "gHAVUMjhlnLPKt8Asz60SxV3oW2T9kU="
NEW_API_USER = "1"

# 定义 credentials 列表，每个元素是 (name, key) 的元组
CREDENTIALS = [
    # 格式: (project_id, refresh_token)
    # ("your-project-id", "your-refresh-token"),
]

# ============ 固定配置 ============
BASE_URL = "http://170.106.99.24:17154"
PRIORITY = 8
TAG = "Antigravity"
MODELS = [
    "gemini-3-flash",
    "claude-opus-4-5-20251101-thinking",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "claude-sonnet-4-5-20250929-thinking",
    "claude-sonnet-4-5-20250929",
    "gemini-3-pro",
    "gemini-3-pro-image-preview",
]
MODEL_MAPPING = {
    "gemini-3-pro": "gemini-3-pro-high",
    "claude-sonnet-4-5-20250929": "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929-thinking": "claude-sonnet-4-5-thinking",
    "claude-opus-4-5-20251101-thinking": "claude-opus-4-5-thinking",
    "gemini-flash-lite-latest": "gemini-2.5-flash-lite",
    "gemini-flash-latest": "gemini-2.5-flash",
    "gemini-3-pro-image-preview": "gemini-3-pro-image",
}


def build_payload(name: str, key: str):
    return {
        "mode": "single",
        "fan_out_by_model": True,
        "channel": {
            "type": 24,
            "max_input_tokens": 0,
            "other": "",
            "models": ",".join(MODELS),
            "auto_ban": 1,
            "groups": ["default"],
            "priority": PRIORITY,
            "weight": 0,
            "multi_key_mode": "random",
            "settings": json.dumps({}),
            "name": name,
            "key": key,
            "base_url": BASE_URL,
            "test_model": "",
            "model_mapping": json.dumps(MODEL_MAPPING),
            "tag": TAG,
            "status_code_mapping": "",
            "setting": json.dumps({
                "force_format": False,
                "thinking_to_content": False,
                "proxy": "",
                "pass_through_body_enabled": False,
                "system_prompt": "",
                "system_prompt_override": False,
                "auto_disable_webhook_url": "",
            }),
            "group": "default",
        },
    }


def push_credential(name: str, key: str):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {NEW_API_PASSWORD}",
        "New-Api-User": NEW_API_USER,
    }
    payload = build_payload(name, key)

    with httpx.Client() as client:
        response = client.post(
            "http://34.105.1.43:17151/api/channel/",
            json=payload,
            headers=headers,
        )
    return response


if __name__ == "__main__":
    for name, key in CREDENTIALS:
        print(f"Pushing: {name}...")
        resp = push_credential(name, key)
        print(f"  Status: {resp.status_code}, Response: {resp.text}")
