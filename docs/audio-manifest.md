# Approved-question audio manifest

The application maps stable IDs 1–10 to `/audio/questions/q01.mp3` through `q10.mp3`. Q1 is unchanged from Preview commit `b24ce4e`. The Q2–Q10 files in that commit contained a spoken “Question N” preface. This release candidate trims that preface at the silent gap and retains the question audio from the owner-provided files. The ten MP3 files decode without error. Previous offline transcription of the same cut points found the approved spoken question bodies; this does not replace a human listening check on physical devices.

| Question | Path | Domain | Duration |
| --- | --- | --- | ---: |
| Q1 | `/audio/questions/q01.mp3` | Transition & Adjustment | 5.878 s |
| Q2 | `/audio/questions/q02.mp3` | Transition & Adjustment | 6.524 s |
| Q3 | `/audio/questions/q03.mp3` | Learning & Curiosity | 5.824 s |
| Q4 | `/audio/questions/q04.mp3` | Relationships & Leadership | 8.298 s |
| Q5 | `/audio/questions/q05.mp3` | Relationships & Leadership | 6.546 s |
| Q6 | `/audio/questions/q06.mp3` | Growth & Aspirations | 7.428 s |
| Q7 | `/audio/questions/q07.mp3` | Growth & Aspirations | 7.016 s |
| Q8 | `/audio/questions/q08.mp3` | Growth & Aspirations | 5.728 s |
| Q9 | `/audio/questions/q09.mp3` | Learning & Curiosity | 7.008 s |
| Q10 | `/audio/questions/q10.mp3` | Growth & Aspirations | 5.061 s |

The original MP3s alone cannot prove the voice or model used. No new generation or paid provider call was made in this integration. First-visit playback, Replay, preloading and the text fallback remain in `QuestionAudioService`.
