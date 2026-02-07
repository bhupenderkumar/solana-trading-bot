#!/usr/bin/env python3
"""
GitHub Models Proxy - OpenAI-compatible API proxy using Flask.
Enables access to Claude and GPT models via GitHub's free Models API.
"""

import json
import os
import time
import uuid
import ssl
import certifi

import requests
from flask import Flask, request, Response, jsonify

# Fix SSL certificate issues
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

app = Flask(__name__)

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_API_URL = "https://models.inference.ai.azure.com/chat/completions"

MODEL_MAP = {
    "gpt-4o": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
    "gpt-4": "gpt-4o",
    "gpt-3.5-turbo": "gpt-4o-mini",
    "o1": "o1",
    "o1-mini": "o1-mini",
    "o1-preview": "o1-preview",
    "claude-3.5-sonnet": "claude-3-5-sonnet",
    "claude-3-5-sonnet": "claude-3-5-sonnet",
}


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/v1/models", methods=["GET"])
def models():
    return jsonify({
        "object": "list",
        "data": [
            {"id": "gpt-4o", "object": "model", "owned_by": "github"},
            {"id": "gpt-4o-mini", "object": "model", "owned_by": "github"},
            {"id": "o1", "object": "model", "owned_by": "github"},
            {"id": "o1-mini", "object": "model", "owned_by": "github"},
            {"id": "claude-3.5-sonnet", "object": "model", "owned_by": "github"},
        ]
    })


def estimate_tokens(text):
    """Rough estimate: ~4 chars per token"""
    return len(str(text)) // 4


def truncate_request(data, max_tokens=6000):
    """Truncate request to fit within token limits"""
    messages = data.get("messages", [])
    tools = data.get("tools", [])

    msg_tokens = sum(estimate_tokens(m.get("content", "")) + 10 for m in messages)
    tool_tokens = sum(estimate_tokens(json.dumps(t)) for t in tools)
    total = msg_tokens + tool_tokens

    print(f"[PROXY] Estimated tokens: messages={msg_tokens}, tools={tool_tokens}, total={total}")

    if total <= max_tokens:
        return data

    if messages and messages[0].get("role") == "system":
        system_content = messages[0].get("content", "")
        system_tokens = estimate_tokens(system_content)
        if system_tokens > 3000:
            truncated = system_content[:12000] + "\n\n[System prompt truncated for token limits]"
            messages[0]["content"] = truncated
            print(f"[PROXY] Truncated system prompt from {system_tokens} to ~3000 tokens")

    if len(messages) > 6:
        system_msg = [m for m in messages if m.get("role") == "system"]
        recent_msgs = messages[-5:]
        data["messages"] = system_msg + recent_msgs
        print(f"[PROXY] Truncated messages from {len(messages)} to {len(data['messages'])}")

    if len(tools) > 10:
        data["tools"] = tools[:10]
        print(f"[PROXY] Truncated tools from {len(tools)} to 10")

    return data


@app.route("/v1/chat/completions", methods=["POST", "OPTIONS"])
def chat_completions():
    if request.method == "OPTIONS":
        return "", 200

    data = request.get_json()

    requested_model = data.get("model", "gpt-4o")
    github_model = MODEL_MAP.get(requested_model, requested_model)
    data["model"] = github_model

    is_streaming = data.get("stream", False)
    data.pop("store", None)
    data.pop("response_format", None)  # GitHub doesn't support this

    print(f"[PROXY] Model: {requested_model} -> {github_model}, Stream: {is_streaming}")
    print(f"[PROXY] Messages count: {len(data.get('messages', []))}")

    data = truncate_request(data)

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GITHUB_TOKEN}",
    }

    if is_streaming:
        return stream_response(data, headers, requested_model)
    else:
        return non_streaming_response(data, headers, requested_model)


def non_streaming_response(data, headers, model):
    """Handle non-streaming request"""
    resp = requests.post(GITHUB_API_URL, json=data, headers=headers)

    if resp.status_code != 200:
        print(f"[PROXY] Error: {resp.status_code} - {resp.text[:500]}")
        return Response(resp.text, status=resp.status_code, content_type="application/json")

    result = resp.json()
    if "model" in result:
        result["model"] = model

    return jsonify(result)


def stream_response(data, headers, model):
    """Handle streaming request with SSE"""

    def generate():
        chunk_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
        created = int(time.time())

        try:
            with requests.post(GITHUB_API_URL, json=data, headers=headers, stream=True) as resp:
                if resp.status_code != 200:
                    error_text = resp.text
                    print(f"[PROXY] Error from upstream: {resp.status_code}: {error_text[:500]}")
                    error_chunk = {
                        "id": chunk_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": model,
                        "choices": [{
                            "index": 0,
                            "delta": {"content": f"Error: {resp.status_code}"},
                            "finish_reason": "stop"
                        }]
                    }
                    yield f"data: {json.dumps(error_chunk)}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                for line in resp.iter_lines():
                    if not line:
                        continue

                    line = line.decode("utf-8")

                    if line.startswith("data: "):
                        data_content = line[6:]

                        if data_content == "[DONE]":
                            yield "data: [DONE]\n\n"
                            break

                        try:
                            parsed = json.loads(data_content)

                            choices = parsed.get("choices", [])
                            if not choices:
                                continue

                            chunk_data = {
                                "id": chunk_id,
                                "object": "chat.completion.chunk",
                                "created": created,
                                "model": model,
                                "choices": choices
                            }

                            if "usage" in parsed:
                                chunk_data["usage"] = parsed["usage"]

                            yield f"data: {json.dumps(chunk_data)}\n\n"
                        except json.JSONDecodeError:
                            pass
        except Exception as e:
            print(f"[PROXY] Stream error: {e}")
            import traceback
            traceback.print_exc()
            error_chunk = {
                "id": chunk_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [{
                    "index": 0,
                    "delta": {"content": f"Proxy error: {str(e)}"},
                    "finish_reason": "stop"
                }]
            }
            yield f"data: {json.dumps(error_chunk)}\n\n"
            yield "data: [DONE]\n\n"

    return Response(
        generate(),
        content_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


if __name__ == "__main__":
    if not GITHUB_TOKEN:
        print("ERROR: GITHUB_TOKEN environment variable not set")
        print("Get your token from: https://github.com/settings/tokens")
        print("Token needs 'read:models' scope")
        exit(1)

    port = int(os.environ.get("PROXY_PORT", 8080))
    print(f"\n{'='*50}")
    print(f"GitHub Models Proxy running on http://127.0.0.1:{port}")
    print(f"Endpoint: http://127.0.0.1:{port}/v1/chat/completions")
    print(f"Token: {GITHUB_TOKEN[:8]}...{GITHUB_TOKEN[-4:]}")
    print(f"{'='*50}\n")

    app.run(host="127.0.0.1", port=port, threaded=True, debug=False)
