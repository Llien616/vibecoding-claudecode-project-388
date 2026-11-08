# Трекер цен с Claude

[![hexlet-check](https://github.com/Llien616/vibecoding-claudecode-project-388/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/Llien616/vibecoding-claudecode-project-388/actions)

Трекер цен на Claude-скиллах: следит за товарами и присылает в Telegram только значимые
изменения. Учебный проект Хекслета — [Vibecoding на Claude-скиллах](https://ru.hexlet.io/programs/vibecoding-claudecode).

## Возможности

- Извлечение актуальной цены и наличия товара с Ozon по ссылке на карточку.
- Обход антибот-блока Ozon через прокси Google Translate.
- Сравнение обычной цены и цены с Ozon Картой.
- Скилл `extract-price` и слэш-команда `/check-price` для работы из Claude Code.

## Структура проекта

```text
.
├── .claude/
│   ├── settings.json              # общие permissions проекта
│   ├── settings.local.json        # личные настройки (в .gitignore)
│   ├── commands/
│   │   └── check-price.md         # /check-price <ссылка на Ozon>
│   └── skills/
│       ├── extract-price/
│       │   ├── SKILL.md           # описание скилла и алгоритм обхода блокировки
│       │   └── scripts/
│       │       ├── fetch_page.mjs     # загрузка карточки через видимый Chrome + CDP
│       │       └── extract_price.mjs  # разбор сохранённого HTML
│       └── tracker/
│           ├── SKILL.md           # прогон 5 товаров через extract-price
│           ├── urls.txt           # фиксированный список товаров
│           └── scripts/
│               ├── track.mjs      # полный цикл: сбор → сравнение → публикация
│               ├── run.mjs        # сбор цен: fetch → parse, пауза 20 с
│               ├── compare.mjs    # сравнение с предыдущим прогоном
│               ├── publish.mjs    # коммит YYYY-MM-DD.json в Llien616/tracker-data
│               └── lib/github.mjs # коннектор GitHub: список, чтение, запись
├── .github/workflows/hexlet-check.yml
├── CLAUDE.md                      # инструкции для Claude Code
├── KNOWLEDGE.md                   # правила значимости изменений цен
├── send.py                        # отправка сообщения в Telegram (только stdlib)
└── README.md
```

## Установка

```bash
git clone https://github.com/Llien616/vibecoding-claudecode-project-388.git
cd vibecoding-claudecode-project-388
```

Зависимостей нет — нужен Node.js 18+ и Python 3.9+ (для `send.py`).

## Переменные окружения

Секреты хранятся в `.env` (файл в `.gitignore`, в репозиторий не попадает):

```dotenv
TELEGRAM_BOT_TOKEN=<токен бота из @BotFather>
TELEGRAM_CHAT_ID=<id чата или канала>
```

`TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` нужны для отправки уведомлений о
значимых изменениях цен. Создать бота — у [@BotFather](https://t.me/BotFather),
узнать id чата — через `getUpdates`.

## Уведомления в Telegram

`send.py` отправляет сообщение ботом из `.env`, использует только стандартную
библиотеку Python (`urllib`), без внешних зависимостей:

```bash
python send.py "Значимых изменений: 2"
python send.py --file=report.md
node .claude/skills/tracker/scripts/track.mjs | python send.py
```

Полезные флаги: `--dry-run` (проверить текст и разбивку, ничего не отправляя),
`--chat-id` (переопределить чат), `--parse-mode=HTML`, `--silent`,
`--timeout=<сек>`. Сообщения длиннее лимита Telegram (4096 символов)
разбиваются на несколько. Результат — JSON: `{"ok": true, "message_ids": [42]}`;
при ошибке — `{"ok": false, "error": "..."}` и код возврата 1.

## Использование

В Claude Code:

```text
/check-price https://www.ozon.ru/product/t-d-s-braslet-so-vstavkami-5247783662
```

Или вручную: загрузить карточку и разобрать её скриптами скилла:

```bash
node .claude/skills/extract-price/scripts/fetch_page.mjs \
  "https://www.ozon.ru/product/t-d-s-braslet-so-vstavkami-5247783662/" /tmp/ozon-5247783662.html
node .claude/skills/extract-price/scripts/extract_price.mjs /tmp/ozon-5247783662.html
```

Ответ по скиллу — только JSON-объект:

```json
{"regular_price": "1 462 ₽", "sale_price": "1 316 ₽", "has_credit": false}
```

`fetch_page.mjs` открывает видимый Chrome с DevTools-портом: Ozon режет `curl` и
headless-браузеры по отпечатку клиента, а не по IP, поэтому обычный HTTP-запрос
получает страницу «Похоже, нет соединения».

## Трекер

Скилл `tracker` прогоняет фиксированный список товаров из
`.claude/skills/tracker/urls.txt` через `extract-price` (своей логики парсинга
у него нет), сравнивает прогон с предыдущим и публикует результат
в `Llien616/tracker-data`:

```bash
node .claude/skills/tracker/scripts/track.mjs
```

Перед сохранением `track.mjs` читает последний по дате файл из
`Llien616/tracker-data`, сопоставляет товары по `url` и выводит **только
значимые** изменения по правилам `KNOWLEDGE.md` в корне проекта
(порог 5 % для `regular_price`, появление или снижение `sale_price`,
новые и пропавшие URL). Нет прошлых прогонов — сравнение пропускается.

```json
[
  {
    "rule": 1,
    "url": "https://www.ozon.ru/product/…-5659780691",
    "field": "regular_price",
    "previous": "522 ₽",
    "current": "490 ₽",
    "change_percent": -6.13,
    "reason": "regular_price changed by -6.13% (threshold 5%)"
  }
]
```

Файл называется по дате прогона — `YYYY-MM-DD.json`:

```json
[
  {
    "url": "https://www.ozon.ru/product/…-731553575",
    "regular_price": "3 888 ₽",
    "sale_price": "3 499 ₽",
    "has_credit": false
  }
]
```

Файл не сохраняется локально: `publish.mjs` делает один вызов GitHub Contents
API, то есть один коммит в `Llien616/tracker-data` без `git clone`/`git push`.
В Claude Code ту же запись выполняет MCP-инструмент GitHub
(`create_or_update_file`). Между запросами цен — пауза 20 секунд, чтобы не
попасть под блок Ozon. Для просмотра без публикации: `run.mjs --table`.

Результат:

```json
{
  "productId": "5247783662",
  "name": "T.D.S. Браслет со вставками",
  "sku": "5247783662",
  "regularPrice": "1 462 ₽",
  "cardPrice": "1 316 ₽",
  "currency": "RUB",
  "available": true,
  "rating": "5.0",
  "reviews": "582",
  "sourceUrl": "https://www.ozon.ru/product/t-d-s-braslet-so-vstavkami-5247783662/"
}
```

`regularPrice` — цена «с другими банками», `cardPrice` — цена с Ozon Картой.
Данные зависят от региона и аккаунта.

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
