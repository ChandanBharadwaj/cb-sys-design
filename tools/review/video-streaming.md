# video-streaming review

- Widget: added a phone layout (360-wide viewBox, 13.5-unit axis and buffer labels, 15-unit status, 20 bars instead of 32, rung labels only from 1750 kbps up so they do not collide). The "next / net" readout moves into the HTML stats on phones. Rebuilt via `ctx.onResize`. ABR logic (throughput harmonic mean, BBA-0), timing and controls are unchanged, and the desktop layout is identical. Phone fonts: min 8.9 / p25 9.3 px → min 12.7 / p25 12.7 px.
- Apple's 6 s guidance: the Radiant Media Player summary was replaced by Apple's own "HLS authoring specification for Apple devices" (developer.apple.com). The segment-length answer now says the spec says target durations *should* be 6 s, which is a recommendation, not a rule. The exact wording was confirmed only through quotes of section 7.5.
- Netflix dynamic optimizer: the timeline now says the savings were reported per codec (x264, x265, VP9) rather than as one "~30%". The 28–38% range is attributed to summaries, because I could not see the primary per-codec figures.
- tl;dr: replaced the shaky "~30% dynamic optimizer" number with the primary-sourced "~90% of Netflix traffic over direct ISP connections (2016)", which is already in the timeline.
- 4K shot-based card: restated as "average BD-rate gain of about 50% across the 4K ladder", as reported in press coverage. The Netflix post itself did not surface in search, so Hackaday stays as the source.
- Calculator: segment requests/s now assume 6 s segments, in line with the knob default, the trade-offs table and Apple's guidance (it was 4 s), and the label notes that audio requests come on top.
- Knobs: the per-shot note now says its 40% saving is illustrative, as the per-title note already did. All options still move meters.
- Interview: added a codec-choice follow-up (H.264 first; HEVC/AV1 ladders for popular titles and capable devices) to the per-title question, rather than adding a 13th question.
- Code: ran the BBA-0 snippet against a 7-rung ladder; it matches the paper's rules and the widget. Ran the ffmpeg split/encode snippet on a generated 8 s test clip with ffmpeg; it works. The Java S3 presign snippet needs the AWS SDK, so it was not compiled; the API calls were checked by reading.
- Left alone: BBA "10–20% fewer rebuffers" (matches the SIGCOMM 2014 abstract), the Open Connect and VCU cards, the architecture and the scenarios.
