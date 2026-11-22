# Answer development v1

Pure local `scoreReflectionAnswers`, no new dependency, API or persistence fields. Requires exactly ten unique known IDs and string texts; otherwise returns `unavailable`. Sorts by approved ID. Empty/whitespace or exact pasted prompt receives zero. HTML tags are ignored as text delimiters; no HTML is rendered.

For nonempty attempts, one point each (maximum five): attempt; six distinct non-filler normalised tokens; a bounded reason phrase; a bounded experience/example phrase or question-specific detail cue; a bounded feeling/learning/plan phrase. The last three require three distinct non-filler tokens. Unicode NFKC, case folding, apostrophe normalisation and Unicode word tokens tolerate common transcription variation. Repetitions cannot increase distinct-token counts or award a criterion twice. No punctuation, spelling or grammar marks.

This is an approximate structural indicator, not semantic relevance, truth, ability, academic achievement or AI quality. Cues can miss paraphrases or reward irrelevant text. Concise answers may score lower; a zero is never evidence of a student's ability. Results are reproducible under the displayed version. Question-specific cue lists are in the pure function for review.

Live scores use a submitted answer snapshot. Recovered results require rubric V2, question set V2 and an intact ten-ID answer set. V1, absent or ambiguous provenance shows Score unavailable; qualitative AI output is never rescored. Nothing is backfilled into historical records. Demo uses only fixed fictional fixtures in DEMO_REFLECTION_ANSWERS; typed demo edits never enter the score or any provider. It displays DEMO · example score. No real AI assessment is implied.

The number is calculated in the browser and not added to qualitative feedback/copy or Firestore. Existing privacy and retention gates remain unchanged.
