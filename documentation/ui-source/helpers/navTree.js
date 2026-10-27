'use strict'

// Build-time version of the sidebar clean-up that js/site.js used to do in the
// browser after the first paint. Doing it here means the first paint already
// shows the final menu, so nothing jumps when the page loads:
//
//   {{> nav-tree items=(navTree page.navigation page.url)}}
//
// For each node it adds:
//   label    - display HTML. Antora gives each nav file's top group an empty
//              title, so an empty label falls back to the first descendant's
//              title (or "Untitled section").
//   open     - true when the group contains the current page (or is it); every
//              other group starts collapsed.
//   current  - true for the link to the current page.
//   overview - true when the first child repeated its parent's title and was
//              renamed "Overview" (its own children are promoted one level).
//
// js/site.js keeps the same rules for pages it swaps in without a reload, but on
// server-rendered markup they are now no-ops.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '\u2019', lsquo: '\u2018' }

// textContent equivalent: strip tags, decode entities, collapse whitespace.
function text (html) {
  return String(html == null ? '' : html)
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] || m)
    .replace(/\s+/g, ' ')
    .trim()
}

// First non-empty title in document order (same order the browser code used).
function firstTitle (items) {
  for (const item of items || []) {
    if (text(item.content)) return item.content
    const nested = firstTitle(item.items)
    if (nested) return nested
  }
  return ''
}

function containsUrl (item, url) {
  if (!url) return false
  if (item.url === url) return true
  return (item.items || []).some((child) => containsUrl(child, url))
}

function normalize (items, url) {
  return (items || []).map((source) => {
    const node = Object.assign({}, source)
    node.items = normalize(source.items, url)
    node.current = !!url && node.url === url
    node.label = text(node.content) ? node.content : (firstTitle(node.items) || 'Untitled section')

    // A plain (unlinked) group whose first child repeats the group's title:
    // show the child as "Overview" and lift its sub-pages into the group.
    const first = node.items[0]
    if (!node.url && first && first.url && text(node.label).toLocaleLowerCase() === text(first.label).toLocaleLowerCase()) {
      const promoted = first.items
      node.items = [Object.assign({}, first, {
        label: 'Overview', overview: true, title: `Open ${text(node.label)} overview`, items: [],
      })].concat(promoted, node.items.slice(1))
    }

    node.open = node.items.length > 0 && containsUrl(node, url)
    return node
  })
}

module.exports = function (navigation, url) {
  if (!Array.isArray(navigation)) return []
  return normalize(navigation, typeof url === 'string' ? url : null)
}
