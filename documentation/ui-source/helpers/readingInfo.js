'use strict'

// Build-time reading metadata for one page, used by layouts/default.hbs:
//
//   {{#with (readingInfo page)}} … {{minutes}} … {{/with}}
//
// Everything here is computed by Antora while the site is generated, so the
// "~8 min read" label and Page Info work without JavaScript.
//
// Author controls (valueless page attributes in the .adoc header). Antora drops
// the `page-` prefix in the UI model, so `:page-no-listen:` arrives here as
// attributes['no-listen'] with the value '' (an empty string, which Handlebars
// would treat as false, which is why the flags are resolved here and not in the template):
//
//   :page-reading-assistant:      OPT-IN: show the Reading Assistant panel (Listen,
//                                 Jump to Section, Page Info). Without it the page
//                                 keeps the classic "On this page" panel.
//   :page-no-listen:              with the assistant on: hide only the Listen card
//   :page-no-reading-progress:    no reading progress bar under the header
//   :page-no-reading-time:        no "~N min read" label
//   :page-revdate: 2026-10-26     "Last updated" date (shown only when set)
//
// The start page (page.home, the landing page) never gets the assistant,
// progress bar or reading time.

// Reading speed assumption for technical prose. Documented in the UI docs.
const WORDS_PER_MINUTE = 220

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const isSet = (attrs, name) => attrs[name] !== undefined && attrs[name] !== null && attrs[name] !== false

// Visible prose only: source listings (<pre>), collapsed blocks (<details>, which
// is how [%collapsible] "Show Code" renders), scripts and inline SVG are removed
// before counting, so code never inflates the reading time.
function countWords (html) {
  const text = html
    .replace(/<(pre|details|script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    // Keep contractions as one word: don&#8217;t -> don't
    .replace(/&(?:#8217|#8216|#39|rsquo|lsquo|apos);/gi, "'")
    .replace(/&[a-z0-9#]+;/gi, ' ')
  let words = 0
  for (const token of text.split(/\s+/)) {
    // Tokens made only of punctuation, symbols or emoji are not words.
    if (/[\p{L}\p{N}]/u.test(token)) words++
  }
  return words
}

// Accepts an ISO date (2026-10-26, optionally with a time). Anything else is
// shown verbatim and gets no machine-readable datetime, rather than guessing.
function formatDate (value) {
  const raw = String(value).trim()
  if (!raw) return null
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return { label: raw, iso: null }
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return { label: raw, iso: null }
  return { label: `${MONTHS[month - 1]} ${day}, ${m[1]}`, iso: `${m[1]}-${m[2]}-${m[3]}` }
}

// The layout calls this helper several times per page (Handlebars has no local
// variables outside a block), so results are cached per page model object.
const cache = new WeakMap()

module.exports = function (page) {
  // Called without a page, Handlebars passes only its options object.
  if (!page || typeof page !== 'object' || !('attributes' in page || 'contents' in page)) return {}
  if (cache.has(page)) return cache.get(page)
  const info = compute(page)
  cache.set(page, info)
  return info
}

function compute (page) {
  const attrs = page.attributes || {}
  const home = !!page.home
  const html = page.contents == null ? '' : String(page.contents)
  const words = countWords(html)
  const minutes = words ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0
  const date = isSet(attrs, 'revdate') ? formatDate(attrs.revdate) : null
  // Opt-in: only pages that set :page-reading-assistant: get the panel.
  const assistant = !home && isSet(attrs, 'reading-assistant')
  const showTime = !home && words > 0 && !isSet(attrs, 'no-reading-time')

  // Antora's bare Handlebars has no `or` helper, so combined conditions are precomputed.
  return {
    assistant,
    listen: !isSet(attrs, 'no-listen'),
    progress: !home && !isSet(attrs, 'no-reading-progress'),
    showTime,
    meta: !home && (showTime || !!date || assistant),
    hasInfo: showTime || words > 0 || !!date,
    words,
    wordsLabel: words.toLocaleString('en-US'),
    minutes,
    revdate: date ? date.label : null,
    revdateIso: date ? date.iso : null,
    wpm: WORDS_PER_MINUTE,
  }
}
