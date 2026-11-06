---
description: Узнать цену и наличие товара на Ozon
argument-hint: <ссылка на товар Ozon>
allowed-tools: Bash(node:*), Read
---

Определи цену товара по ссылке: $ARGUMENTS

1. Прочитай `.claude/skills/extract-price/SKILL.md` и действуй строго по ней.
2. Загрузи карточку через `node .claude/skills/extract-price/scripts/fetch_page.mjs "<ссылка>" /tmp/ozon.html`.
3. Разбери HTML: `node .claude/skills/extract-price/scripts/extract_price.mjs /tmp/ozon.html`.
4. Ответ — **только** JSON-объект, без единого слова вокруг:

```json
{"regular_price": "522 ₽", "sale_price": "470 ₽", "has_credit": false}
```

Никаких названий товара, наличия, рейтинга, даты, оговорок и markdown-обёрток.
При неудаче — `{"error": "ozon_blocked"}`.
