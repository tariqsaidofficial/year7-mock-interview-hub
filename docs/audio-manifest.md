# Approved-question audio manifest

Ten MP3 files are present in `public/audio/questions/` and are included in the local build. Their wording, voice and approval status have not been verified in this review. No audio was generated or purchased during this correction. Before publication, compare each recording with the approved wording in [question-review.md](question-review.md); replace any mismatch. The paths are:

| Question | Static path | Category |
| --- | --- | --- |
| Q1 | `/audio/questions/q01.mp3` | Transition to Secondary School |
| Q2 | `/audio/questions/q02.mp3` | Transition to Secondary School |
| Q3 | `/audio/questions/q03.mp3` | Transition to Secondary School |
| Q4 | `/audio/questions/q04.mp3` | Favourite Subjects |
| Q5 | `/audio/questions/q05.mp3` | Favourite Subjects |
| Q6 | `/audio/questions/q06.mp3` | Extra-Curricular Activities |
| Q7 | `/audio/questions/q07.mp3` | Extra-Curricular Activities |
| Q8 | `/audio/questions/q08.mp3` | Leadership and Responsibility |
| Q9 | `/audio/questions/q09.mp3` | Leadership and Responsibility |
| Q10 | `/audio/questions/q10.mp3` | Leadership and Responsibility |

The client preloads the current and next file, attempts automatic playback on the first visit, and offers Replay question. Navigation and microphone use stop playback. If a file is missing or autoplay is blocked, the written question remains available and the UI explains what happened. There is no runtime ElevenLabs key or browser text-to-speech fallback.
