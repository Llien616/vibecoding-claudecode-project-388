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
│       └── extract-price/
│           ├── SKILL.md           # инструкция скилла (frontmatter: name, description)
│           └── scripts/
│               ├── fetch_page.mjs     # загрузка карточки через видимый Chrome + CDP
│               └── extract_price.mjs  # парсинг сохранённого HTML
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
- Коммиты — на английском, в императиве (`Add …`, `Fix …`).
- Не удалять и не переименовывать `.github/workflows/hexlet-check.yml` и сам репозиторий.

## Что проверять перед коммитом

1. `node --check` для изменённых скриптов.
2. Скилл отрабатывает на реальной ссылке Ozon либо на сохранённом HTML.
3. В диффе нет токенов, `.env` и локальных файлов.
