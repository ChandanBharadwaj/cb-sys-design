# live-streaming review

- Widget: already passed the phone font check (380-wide viewBox, 14-unit text: min 12.5 / p25 12.5 px). I looked at the phone screenshots before and after "Star batter walks out" and the desktop shot; the labels are readable and nothing overlaps badly, so the widget was deliberately left unchanged.
- Hotstar dates (flagged as inferred):
  - "T for Tsunami" was labelled "Pre-2019". It is now "After Jun 2017", because the post itself refers to beating the 3M-concurrent record at the Champions Trophy (June 2017). The card now uses that context: the fleet was sized for 7M but not for the "tsunami" arrival shape.
  - "Scaling is not an accident" was labelled "2017". It is now "Undated", because no date could be confirmed; the card says it was written after 6+ months of IPL preparation.
- The tl;dr insight quoted autoscaling as "a useless strategy". The exact wording could not be confirmed, so it is now a paraphrase ("useless for spikes, because new capacity arrives too late") without quote marks.
- "Scaling Is Not An Accident" card: added the confirmed recommendation that clients add jitter to requests and retries.
- Gap filled: new interview question on a self-inflicted spike from your own push notification (batch the sends, client-side jitter, cheap deep-link target, pre-step the ladder). This links the push system to capacity planning.
- Code:
  - ffmpeg ladder: ran with a lavfi test source in place of SRT; it produces master.m3u8 plus three fMP4 renditions. Added `-pix_fmt yuv420p` so the output stays in a widely playable H.264 profile (a 4:4:4 source otherwise yields High 4:4:4).
  - Python HLL + ladder: ran against a scratch redis-server (5,000 sessions counted as 4,988, ladder levels correct).
  - Spring/Resilience4j snippet: needs Spring, so not run; the bulkhead/fallback signature was checked.
- Checked and left: the 25.3M and 18.6M figures (Akamai press release, re:Invent session report), the LL-HLS details (PART-HOLD-BACK ≥ 3 part targets), the 12 KB / 0.81% figures for Redis HLL, the calculator formulas, and the knobs (every option moves a meter or the verdict).
