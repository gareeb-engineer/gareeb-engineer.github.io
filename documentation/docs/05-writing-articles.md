# 05 — Write and publish AsciiDoc articles

## Create an article

Example: `modules/Data-Structure/pages/recursion/binary-search.adoc`:

```asciidoc
= Binary Search with Recursion
:page-navtitle: Binary Search
:page-description: Recursive binary search over a sorted array, with complexity analysis

== Problem

Find the index of a target value in a sorted array, or return -1.

== Approach

Compare against the middle element and recurse into the half that can still
contain the target.

== Java implementation

[source,java,highlight=6..8]
----
public final class BinarySearch {

    static int search(int[] arr, int target, int lo, int hi) {
        if (lo > hi) return -1;
        int mid = lo + (hi - lo) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) return search(arr, target, mid + 1, hi);
        return search(arr, target, lo, mid - 1);
    }
}
----

== Complexity

NOTE: Time is O(log n). The recursion depth is also O(log n), which matters on
very large arrays.

== Related

See xref:recursion/index.adoc[the recursion overview].
```

Then add it to **that module's** `modules/Data-Structure/nav.adoc`:

```asciidoc
** xref:recursion/index.adoc[Recursion]
*** xref:recursion/sum-of-all-element.adoc[Sum of all elements]
*** xref:recursion/all-indices-of-array.adoc[All indices of array]
*** xref:recursion/binary-search.adoc[Binary Search]
```

Rebuild. The page is published at `/gareeb-engineer/v1.0/Data-Structure/recursion/binary-search.html` and appears under Recursion in the sidebar.

## Page header attributes used by this site

| Attribute | Effect |
|---|---|
| `= Title` | Page title, browser tab title, and default sidebar text when the nav xref has empty brackets |
| `:page-navtitle: Text` | Shorter text used in the sidebar when the nav xref has empty brackets (`xref:file.adoc[]`) |
| `:page-description: Text` | `<meta name="description">` for search engines and link previews |
| `:page-layout: portfolio` | Use the hero portfolio layout. See [08](08-homepages.md) |
| `:page-layout: fragment` | Render without a surrounding document. Only for pages embedded elsewhere, like the header links |
| `:page-centered: true` | Centre the page title with an accent bar underneath. See [08](08-homepages.md) |
| `:sectnums:` | Number section headings |

Attribute lines must come straight after the `= Title` line, before the first blank line.

## Common syntax

| Purpose | Example |
|---|---|
| Title | `= Page Title` |
| Section | `== Architecture` |
| Subsection | `=== Failure handling` |
| Bullets | `* One item` |
| Numbered list | `. First step` |
| Inline code | `` `Redis` `` |
| Bold | `*important*` |
| Admonition | `NOTE: ...`, `TIP: ...`, `WARNING: ...` |
| Code block | `[source,java]` then a `----` fenced block. Options in [17](17-code-blocks.md) |
| Table | `\|===`, header row and cell lines, `\|===` |
| Link to a page in the same module | `xref:recursion/index.adoc[Recursion]` |
| Link to a page in another module | `xref:Java:index.adoc[Garbage Collection]` |
| External link | `https://example.org[Reference]` |
| Download attachment | `xref:attachment$paper.pdf[Paper]` |

Cross-links **inside article text** may point anywhere in the site. It's only the `nav.adoc` files that should stay within their own module.

## Code samples

Every `[source,...]` block gets the dark card, a language label, Copy and Open buttons, line numbers and syntax colours with no extra markup. Use `highlight=` to mark lines, and `role=no-linenums` to hide numbers:

```asciidoc
[source,java,highlight="3,7..9"]
----
...
----

[source,bash,role=no-linenums]
----
./gradlew build
----
```

Full reference: [Code blocks](17-code-blocks.md).

## Add a diagram or picture

1. Put the image in the same module: `modules/Java/assets/images/Garbage-Collection.png`.
2. Reference it from a page in that module:

   ```asciidoc
   image::Garbage-Collection.png[Garbage collection phases, width=800]
   ```

On phones, wide images that have been shrunk to fit show a "Tap to view full size" hint and open the original. Write meaningful alternative text; it is what screen readers announce.

## Reuse a partial

Put a reusable fragment in `modules/<module>/partials/common-definitions.adoc`, then include it from a page in the same module:

```asciidoc
include::partial$common-definitions.adoc[]
```

The `partial$` family prefix is required. `nav$` is not a valid family, so `include::nav$nav.adoc[]` fails with "target of include not found". Navigation files are registered in `antora.yml`, not included into pages.

## Tips for LLD/HLD case studies

**LLD template:** problem statement → clarifications → functional requirements → entity relationships → Java interfaces/classes → state transitions → concurrency → tests → design trade-offs → runnable repo link.

**HLD template:** functional requirements → nonfunctional requirements → scale assumptions → API contracts → data model → component diagram → partitioning/caching/messaging → failures → monitoring → cost/complexity trade-offs.

Technical claims should have supporting implementation or testing where possible. Keep credentials, private architecture, and employer-sensitive details **out of public articles**.

## Publishing lifecycle

1. Create the `.adoc` under the module's `pages/`.
2. Add images under the same module's `assets/images/`.
3. Add one `xref:` line for the page to the same module's `nav.adoc`.
4. Build with `antora antora-playbook.yml` and confirm there are no warnings.
5. Preview over HTTP and check links, images, sidebar and a narrow phone-width window.
6. Commit, push, and watch the GitHub Actions run.

New module instead of a new page? Create `modules/<name>/pages/`, `modules/<name>/nav.adoc`, and add `- modules/<name>/nav.adoc` under `nav:` in `antora.yml`.

See [Navigation](06-navigation.md) for the difference between a page being published and a page being in the sidebar.
