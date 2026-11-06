#!/usr/bin/env node
// Extract price data from a saved Ozon product page (HTML).
// Usage: node extract_price.mjs page.html   (or pipe HTML via stdin)

import fs from 'node:fs';

const file = process.argv[2];
const html = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');

const entity = (s) =>
  s
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

const norm = (v) => (v == null ? null : String(v).replace(/[\u00a0\u202f]/g, ' ').trim());

const fmtPrice = (v) => {
  v = norm(v);
  if (!v) return null;
  const m = v.match(/^(\d+)(?:[.,](\d+))?$/);
  if (m) {
    const int = m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${int}${m[2] ? ',' + m[2] : ''} ₽`;
  }
  return v.replace(/\s*₽\s*$/, ' ₽');
};

const out = {
  productId: null,
  name: null,
  sku: null,
  regularPrice: null, // "С другими банками" / price without Ozon Card
  cardPrice: null,    // "С банками" / Ozon Card price
  currency: 'RUB',
  available: null,
  rating: null,
  reviews: null,
  sourceUrl: null,
};

// 1) schema.org JSON-LD: regular price, sku, availability, rating.
for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
  let data;
  try {
    data = JSON.parse(m[1].trim());
  } catch {
    continue;
  }
  for (const p of Array.isArray(data) ? data : [data]) {
    if (!p || p['@type'] !== 'Product') continue;
    out.name = norm(p.name) ?? out.name;
    out.sku = norm(p.sku) ?? out.sku;
    out.rating = p.aggregateRating?.ratingValue ?? out.rating;
    out.reviews = p.aggregateRating?.reviewCount ?? out.reviews;
    const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
    if (offer) {
      out.regularPrice = norm(offer.price) ?? out.regularPrice;
      out.currency = offer.priceCurrency ?? out.currency;
      out.sourceUrl = offer.url ?? out.sourceUrl;
      const av = String(offer.availability ?? '');
      if (/InStock/i.test(av)) out.available = true;
      else if (/OutOfStock|SoldOut/i.test(av)) out.available = false;
    }
  }
}

// 2) price widget: cardPrice (with Ozon Card) vs price (regular).
for (const m of html.matchAll(/<div id="state-webPrice-[^"]*" data-state="([^"]*)"/g)) {
  let d;
  try {
    d = JSON.parse(entity(m[1]));
  } catch {
    continue;
  }
  if (d.cardPrice) out.cardPrice = norm(d.cardPrice);
  if (d.price) out.regularPrice = out.regularPrice ?? norm(d.price);
  if (typeof d.isAvailable === 'boolean') out.available = d.isAvailable;
  break; // first widget = selected/default offer
}

// 3) Visible-price fallbacks (translated pages still keep these spans).
if (!out.cardPrice) {
  const m = html.match(/tsHeadline600Large[^>]*>\s*([^<]*?\d[^<]*?₽)/);
  if (m) out.cardPrice = norm(m[1]);
}
if (!out.regularPrice) {
  const m = html.match(/pdp_bj2[^>]*>\s*([^<]*?\d[^<]*?₽)/);
  if (m) out.regularPrice = norm(m[1]);
}

// 4) Product id from URL in JSON-LD, sku, or page slug.
const idMatch =
  (out.sourceUrl && out.sourceUrl.match(/-(\d{6,})\/?$/)) ||
  (out.sku && String(out.sku).match(/(\d{6,})/)) ||
  html.match(/\/product\/[^"'\s]*?-(\d{6,})\/?/);
if (idMatch) out.productId = idMatch[1];

out.regularPrice = fmtPrice(out.regularPrice);
out.cardPrice = fmtPrice(out.cardPrice);

console.log(JSON.stringify(out, null, 2));
