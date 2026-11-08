# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## О проекте

**Трекер цен с Claude** — учебный проект Хекслета (курс «Vibecoding на Claude-скиллах»).
Цель: следить за товарами и присылать в Telegram только значимые изменения цены.

Практическая часть пока состоит из Claude-скиллов, которые извлекают данные с карточек
товаров; приложение-трекер будет собираться поверх них.

## Структура

```text
.
├── .claude/
│   ├── settings.json              # общие настройки проекта (permissions)
│   ├── settings.local.json        # личные настройки, не коммитится
│   ├── commands/
│   │   └── check-price.md         # слэш-команда /check-price
│   └── skills/
│       ├── extract-price/
│       │   ├── SKILL.md           # инструкция скилла (frontmatter: name, description)
│       │   └── scripts/
│       │       ├── fetch_page.mjs     # загрузка карточки через видимый Chrome + CDP
│       │       └── extract_price.mjs  # парсинг сохранённого HTML
│       └── tracker/
│           ├── SKILL.md           # прогон 5 товаров через extract-price
│           ├── urls.txt           # фиксированный список товаров
│           └── scripts/
│               ├── track.mjs      # полный цикл: сбор → сравнение → публикация
│               ├── run.mjs        # сбор цен: fetch → parse, пауза 20 с
│               ├── compare.mjs    # сравнение с предыдущим прогоном
│               ├── publish.mjs    # коммит YYYY-MM-DD.json в Llien616/tracker-data
│               └── lib/github.mjs # коннектор GitHub: список, чтение, запись
├── .github/workflows/             # hexlet-check.yml — не редактировать
├── CLAUDE.md
├── KNOWLEDGE.md                   # правила значимости изменений цен
├── send.py                        # отправка сообщения в Telegram (только stdlib)
└── README.md
```

## Команды

```bash
# Загрузить карточку Ozon (видимый Chrome + DevTools, обходит антибот)
node .claude/skills/extract-price/scripts/fetch_page.mjs "https://www.ozon.ru/product/<id>/" /tmp/ozon.html

# Разобрать сохранённую страницу товара Ozon
node .claude/skills/extract-price/scripts/extract_price.mjs page.html

# Полный цикл: цены → сравнение с прошлым прогоном → коммит, вывод значимых изменений
node .claude/skills/tracker/scripts/track.mjs

# Отдельные шаги: сбор, сравнение, публикация
node .claude/skills/tracker/scripts/run.mjs
node .claude/skills/tracker/scripts/compare.mjs --file=run.json
node .claude/skills/tracker/scripts/publish.mjs --file=run.json

# Отправить сообщение в Telegram (токен и chat id — из .env)
python send.py "текст сообщения"
python send.py --file=report.md
python send.py --dry-run "проверка"

# Проверка синтаксиса скрипта
node --check .claude/skills/extract-price/scripts/fetch_page.mjs
```

Ozon блокирует `curl` и headless-браузеры по отпечатку клиента (не по IP);
проходит только видимый Chrome — этим и занимается `fetch_page.mjs`.
Подробности — в `.claude/skills/extract-price/SKILL.md`.

## Соглашения

- Скиллы живут в `.claude/skills/<name>/SKILL.md`; frontmatter — `name` и `description`
  (description пишется так, чтобы модель понимала, когда скилл применять).
- Скрипты скилла — в `<skill>/scripts/`, запуск через `node` без внешних зависимостей
  (исключение — `send.py`: Python 3.9+ и только стандартная библиотека).
- Секреты (токен Telegram-бота и т. п.) — только в `.env`, файл в `.gitignore`.
- Скрипт `send.py` использует только стандартную библиотеку Python (`urllib`);
  `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` читаются из `.env`, переменные
  окружения имеют приоритет. Длинные сообщения режутся по лимиту 4096 символов.
- Для Ozon всегда сообщать **обе** цены: обычную и с Ozon Картой.
- Ответ по скиллу `extract-price` — **только JSON-объект**
  `{"regular_price": "...", "sale_price": "...", "has_credit": false}`,
  без названия, наличия, рейтинга и любых пояснений.
- Скилл `tracker` не дублирует логику `extract-price`: он только по очереди
  вызывает его скрипты, делает паузу 20 с между запросами и сводит результат
  в одну таблицу (строка на товар: URL, regular_price, sale_price, has_credit).
- Перед сохранением прогона `tracker` читает предыдущий файл из
  `Llien616/tracker-data`, сопоставляет товары по `url` и выводит **только
  значимые** изменения по правилам `KNOWLEDGE.md`; нет прошлых прогонов —
  сравнение пропускается.
- Результат трекера — файл `YYYY-MM-DD.json` (дата прогона) в репозитории
  `Llien616/tracker-data`, ветка `main`. Локально файл не сохраняется:
  запись идёт через коннектор GitHub (MCP `create_or_update_file` или
  эквивалентный `PUT` в `publish.mjs`), один прогон = один коммит.
  Никаких `git clone` и `git push` в этот репозиторий из проекта.
- Коммиты — на английском, в императиве (`Add …`, `Fix …`).
- Не удалять и не переименовывать `.github/workflows/hexlet-check.yml` и сам репозиторий.

## Что проверять перед коммитом

1. `node --check` для изменённых скриптов.
2. Скилл отрабатывает на реальной ссылке Ozon либо на сохранённом HTML.
3. В диффе нет токенов, `.env` и локальных файлов.
