#!/usr/bin/env python3
"""Send a Telegram message using only the Python standard library.

The bot token and chat id are read from the project `.env` file
(`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`); real environment variables win
over the file. Messages longer than Telegram's 4096-character limit are split
into several messages.

Usage:
    python send.py "Текст сообщения"
    python send.py --file report.md
    echo "текст" | python send.py
    python send.py --dry-run "проверка запроса"

Output is a single JSON object on stdout:
    {"ok": true, "chat_id": "588209454", "message_ids": [42]}
    {"ok": false, "error": "..."}            # exit code 1

No third-party dependencies: only urllib, json, argparse and friends.
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_API_BASE = "https://api.telegram.org"
MAX_MESSAGE_LENGTH = 4096
ENV_TOKEN = "TELEGRAM_BOT_TOKEN"
ENV_CHAT_ID = "TELEGRAM_CHAT_ID"


def find_env_file(start: Path) -> Path | None:
    """Look for .env in `start` and its parents (project root first match)."""
    for directory in (start, *start.parents):
        candidate = directory / ".env"
        if candidate.is_file():
            return candidate
    return None


def parse_env(path: Path) -> dict[str, str]:
    """Parse a simple KEY=VALUE .env file (comments and quotes supported)."""
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :]
        key, sep, value = line.partition("=")
        if not sep:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def load_config(env_path: Path | None) -> tuple[str, str]:
    """Return (token, chat_id); environment variables override the .env file."""
    file_values = parse_env(env_path) if env_path and env_path.is_file() else {}
    token = os.environ.get(ENV_TOKEN) or file_values.get(ENV_TOKEN, "")
    chat_id = os.environ.get(ENV_CHAT_ID) or file_values.get(ENV_CHAT_ID, "")
    if not token:
        raise ConfigError(f"{ENV_TOKEN} is not set (checked .env and the environment)")
    if not chat_id:
        raise ConfigError(f"{ENV_CHAT_ID} is not set (checked .env and the environment)")
    return token, chat_id


class ConfigError(RuntimeError):
    """Missing or invalid configuration."""


class TelegramError(RuntimeError):
    """Telegram API returned an error or the request failed."""


def split_message(text: str, limit: int = MAX_MESSAGE_LENGTH) -> list[str]:
    """Split text into Telegram-sized chunks, preferring newline boundaries."""
    text = text.strip()
    if len(text) <= limit:
        return [text]

    chunks: list[str] = []
    rest = text
    while len(rest) > limit:
        window = rest[:limit]
        cut = window.rfind("\n")
        if cut < limit // 2:  # no good newline — hard split
            cut = limit
        chunks.append(rest[:cut].rstrip())
        rest = rest[cut:].lstrip("\n")
    if rest:
        chunks.append(rest)
    return chunks


def api_call(
    token: str,
    method: str,
    payload: dict[str, str],
    api_base: str = DEFAULT_API_BASE,
    timeout: float = 20.0,
    retries: int = 1,
) -> dict:
    """POST to a Bot API method and return the decoded `result`."""
    url = f"{api_base.rstrip('/')}/bot{token}/{method}"
    body = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "price-tracker/1.0"},
        method="POST",
    )

    attempt = 0
    while True:
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                data = json.loads(response.read().decode("utf-8"))
            if not data.get("ok"):
                raise TelegramError(data.get("description") or "Telegram API returned ok=false")
            return data.get("result", {})
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            try:
                parsed = json.loads(detail)
            except json.JSONDecodeError:
                parsed = {}
            retry_after = int(parsed.get("parameters", {}).get("retry_after", 0) or 0)
            if exc.code == 429 and retry_after and attempt < retries:
                attempt += 1
                time.sleep(retry_after)
                continue
            description = parsed.get("description") or f"HTTP {exc.code}"
            raise TelegramError(description) from None
        except urllib.error.URLError as exc:
            raise TelegramError(f"network error: {exc.reason}") from None
        except TimeoutError:
            raise TelegramError(f"timeout after {timeout:g}s") from None
        except (http.client.HTTPException, OSError) as exc:
            raise TelegramError(f"network error: {exc}") from None
        except json.JSONDecodeError:
            raise TelegramError("Telegram API returned a non-JSON response") from None


def send_message(
    token: str,
    chat_id: str,
    text: str,
    *,
    parse_mode: str | None = None,
    preview: bool = False,
    silent: bool = False,
    api_base: str = DEFAULT_API_BASE,
    timeout: float = 20.0,
    dry_run: bool = False,
) -> dict:
    """Send text (possibly in several messages) and return a summary."""
    chunks = split_message(text)
    if not chunks or not chunks[0]:
        raise TelegramError("message is empty")

    message_ids: list[int] = []
    for chunk in chunks:
        payload = {
            "chat_id": chat_id,
            "text": chunk,
            "disable_web_page_preview": "true" if not preview else "false",
        }
        if parse_mode:
            payload["parse_mode"] = parse_mode
        if silent:
            payload["disable_notification"] = "true"

        if dry_run:
            continue

        result = api_call(token, "sendMessage", payload, api_base=api_base, timeout=timeout)
        if result.get("message_id") is not None:
            message_ids.append(int(result["message_id"]))
        if len(chunks) > 1:
            time.sleep(1)  # stay below the per-chat flood limit

    return {
        "ok": True,
        "chat_id": chat_id,
        "message_ids": message_ids,
        "messages": len(chunks),
        "chars": sum(len(chunk) for chunk in chunks),
        "dry_run": dry_run,
    }


def read_text(args: argparse.Namespace) -> str:
    if args.file:
        return Path(args.file).read_text(encoding="utf-8")
    if args.text:
        return " ".join(args.text)
    if not sys.stdin.isatty():
        return sys.stdin.read()
    raise TelegramError('no message: pass text, --file, or pipe it through stdin')


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Send a Telegram message (standard library only).",
        epilog="Token and chat id are read from .env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.",
    )
    parser.add_argument("text", nargs="*", help="message text")
    parser.add_argument("--file", help="read the message from a file (UTF-8)")
    parser.add_argument("--chat-id", help="override TELEGRAM_CHAT_ID")
    parser.add_argument("--env", help="path to the .env file (default: nearest one)")
    parser.add_argument("--parse-mode", choices=["HTML", "MarkdownV2", "Markdown"], help="Telegram parse mode")
    parser.add_argument("--preview", action="store_true", help="enable link previews")
    parser.add_argument("--silent", action="store_true", help="send without notification sound")
    parser.add_argument("--timeout", type=float, default=20.0, help="request timeout in seconds (default: 20)")
    parser.add_argument("--dry-run", action="store_true", help="validate and split the message, send nothing")
    parser.add_argument(
        "--api-base",
        default=os.environ.get("TELEGRAM_API_BASE", DEFAULT_API_BASE),
        help="Bot API base URL (default: %(default)s)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:  # Windows consoles default to cp1251
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    args = build_parser().parse_args(argv)

    env_path = Path(args.env).expanduser() if args.env else find_env_file(Path(__file__).resolve().parent)
    try:
        token, chat_id = load_config(env_path)
        if args.chat_id:
            chat_id = args.chat_id
        summary = send_message(
            token,
            chat_id,
            read_text(args),
            parse_mode=args.parse_mode,
            preview=args.preview,
            silent=args.silent,
            api_base=args.api_base,
            timeout=args.timeout,
            dry_run=args.dry_run,
        )
    except (ConfigError, TelegramError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1

    if args.dry_run:
        summary["env_file"] = str(env_path) if env_path else None
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
