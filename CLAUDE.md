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
│               └── extract_price.mjs
├── .github/workflows/             # hexlet-check.yml — не редактировать
├── CLAUDE.md
└── README.md
```

## Команды

```bash
# Разобрать сохранённую страницу товара Ozon
node .claude/skills/extract-price/scripts/extract_price.mjs page.html

# Проверка синтаксиса скрипта
node --check .claude/skills/extract-price/scripts/extract_price.mjs
```

Скачивание карточки Ozon и обход антибота описаны в
`.claude/skills/extract-price/SKILL.md`.

## Соглашения

- Скиллы живут в `.claude/skills/<name>/SKILL.md`; frontmatter — `name` и `description`
  (description пишется так, чтобы модель понимала, когда скилл применять).
- Скрипты скилла — в `<skill>/scripts/`, запуск через `node` без внешних зависимостей.
- Секреты (токен Telegram-бота и т. п.) — только в `.env`, файл в `.gitignore`.
- Для Ozon всегда сообщать **обе** цены: обычную и с Ozon Картой.
- Коммиты — на английском, в императиве (`Add …`, `Fix …`).
- Не удалять и не переименовывать `.github/workflows/hexlet-check.yml` и сам репозиторий.

## Что проверять перед коммитом

1. `node --check` для изменённых скриптов.
2. Скилл отрабатывает на реальной ссылке Ozon либо на сохранённом HTML.
3. В диффе нет токенов, `.env` и локальных файлов.
