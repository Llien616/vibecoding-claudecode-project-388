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
│       └── extract-price/
│           ├── SKILL.md           # описание скилла и алгоритм обхода блокировки
│           └── scripts/
│               └── extract_price.mjs
├── .github/workflows/hexlet-check.yml
├── CLAUDE.md                      # инструкции для Claude Code
└── README.md
```

## Установка

```bash
git clone https://github.com/Llien616/vibecoding-claudecode-project-388.git
cd vibecoding-claudecode-project-388
```

Зависимостей нет — нужен только Node.js 18+.

## Использование

В Claude Code:

```text
/check-price https://www.ozon.ru/product/t-d-s-braslet-so-vstavkami-5247783662
```

Или вручную: скачать HTML карточки (команда — в `.claude/skills/extract-price/SKILL.md`)
и разобрать его скриптом:

```bash
node .claude/skills/extract-price/scripts/extract_price.mjs /tmp/ozon-5247783662.html
```

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
