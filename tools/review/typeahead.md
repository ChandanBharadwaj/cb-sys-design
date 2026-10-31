# typeahead review

- **Widget, phone:** added a 360-wide geometry chosen by `ctx.narrow` and rebuilt via `ctx.onResize`. It has 14–15-unit text, a 44-unit path and child spacing, 30-unit result rows, and a shorter scan header ("scan 202 nodes, sort 24"). The 400-wide desktop layout is unchanged. Fonts went from min 10.2 / p25 10.2 px to min 13.2 / p25 13.2 px. The trie, top-k maintenance and boost logic are untouched.
- **Interaction:** with the top-k cache off and prefix "s" on a phone, the orange subtree scan is visible and the stats show 203 nodes visited against 3 with the cache on.
- **Flagged item, Twitter backend typeahead:** the page makes no claim about Twitter's server-side typeahead. Twitter appears only as the author of the client library typeahead.js. Search confirmed the 2013 Twitter blog post (MIT-licensed, jQuery plugin) at the URL already cited, so nothing needed softening.
- **Interview:** added one deep question on multi-word, out-of-order matching ("design sys" → "system design"). It uses an inverted index over word prefixes and posting-list intersection, ties to LinkedIn Cleo's partial and out-of-order matching already on the page, and explains when to prefer it over the trie.
- **Code:**
  - Compiled and ran the Java trie (JDK 21). The top-k order is correct, lookup is case-insensitive, and a miss returns an empty list.
  - Ran the Postgres snippet on a temporary PG 16 with pg_trgm. The prefix query and the "sytem desing" fuzzy query both return "system design".
  - Ran the Python decay scorer. The 7-day half-life halves the score, rare and denylisted queries are dropped, and whitespace is normalised.
- **Checked, left alone:** the calculator formulas (labelled estimates), the knob maths (debounce → requests per search, the perceived-delay formula), and the 54·L edit-distance-1 variant count (Norvig's 54n+25). LinkedIn Cleo (2012, 150M members, ~20 ms), Pinterest 2014 and Google's prediction policies are attributed as before. Every knob option changes the meters.
