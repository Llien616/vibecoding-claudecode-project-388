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
│           ├── KNOWLEDGE.md       # правила значимости изменений цен
│           ├── urls.txt           # фиксированный список товаров
│           └── scripts/
│               ├── run.mjs        # оркестратор: fetch → parse, пауза 20 с
│               └── publish.mjs    # коммит YYYY-MM-DD.json в Llien616/tracker-data
├── .github/workflows/             # hexlet-check.yml — не редактировать
├── CLAUDE.md
└── README.md
```

## Команды

```bash
# Загрузить карточку Ozon (видимый Chrome + DevTools, обходит антибот)
node .claude/skills/extract-price/scripts/fetch_page.mjs "https://www.ozon.ru/product/<id>/" /tmp/ozon.html

# Разобрать сохранённую страницу товара Ozon
node .claude/skills/extract-price/scripts/extract_price.mjs page.html

# Прогнать трекер по всем товарам из .claude/skills/tracker/urls.txt
node .claude/skills/tracker/scripts/run.mjs

# Прогон + публикация результата в Llien616/tracker-data (один коммит)
node .claude/skills/tracker/scripts/run.mjs | node .claude/skills/tracker/scripts/publish.mjs

# Проверка синтаксиса скрипта
node --check .claude/skills/extract-price/scripts/fetch_page.mjs
```

Ozon блокирует `curl` и headless-браузеры по отпечатку клиента (не по IP);
проходит только видимый Chrome — этим и занимается `fetch_page.mjs`.
Подробности — в `.claude/skills/extract-price/SKILL.md`.

## Соглашения

- Скиллы живут в `.claude/skills/<name>/SKILL.md`; frontmatter — `name` и `description`
  (description пишется так, чтобы модель понимала, когда скилл применять).
- Скрипты скилла — в `<skill>/scripts/`, запуск через `node` без внешних зависимостей.
- Секреты (токен Telegram-бота и т. п.) — только в `.env`, файл в `.gitignore`.
- Для Ozon всегда сообщать **обе** цены: обычную и с Ozon Картой.
- Ответ по скиллу `extract-price` — **только JSON-объект**
  `{"regular_price": "...", "sale_price": "...", "has_credit": false}`,
  без названия, наличия, рейтинга и любых пояснений.
- Скилл `tracker` не дублирует логику `extract-price`: он только по очереди
  вызывает его скрипты, делает паузу 20 с между запросами и сводит результат
  в одну таблицу (строка на товар: URL, regular_price, sale_price, has_credit).
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
