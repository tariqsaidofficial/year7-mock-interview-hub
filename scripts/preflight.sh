#!/usr/bin/env bash
set -euo pipefail

# Safe, local-only inspection. Run from the Year 7 project root.
if [[ ! -f package.json || ! -d src/app || ! -d public/audio/questions ]]; then
  echo 'FAIL: run this script from the complete Year 7 Angular project root.'
  exit 1
fi

echo '== Source and MP3 checks =='
count=0
for n in 01 02 03 04 05 06 07 08 09 10; do
  path="public/audio/questions/q${n}.mp3"
  if [[ ! -s "$path" ]]; then
    echo "FAIL: expected nonempty audio file is missing: $path"
    exit 1
  fi
  count=$((count + 1))
done
echo "PASS: $count question MP3 files are present (not an audio-content verification)."

echo '== Ignore rules =='
if [[ ! -f .gitignore ]]; then
  echo 'FAIL: .gitignore is missing.'
  exit 1
fi
if ! grep -Eq '^\.env\*' .gitignore; then
  echo 'FAIL: .env* is not ignored.'
  exit 1
fi
if [[ -e .env.local && -d .git ]]; then
  if git check-ignore -q .env.local; then
    echo 'PASS: .env.local is ignored.'
  else
    echo 'FAIL: .env.local is not ignored by Git.'
    exit 1
  fi
else
  echo 'NOTE: .env.local is absent or Git has not yet been initialised.'
fi

echo '== Tracked / staged-file checks (if Git is initialised) =='
if [[ -d .git ]]; then
  # Print only filenames, never file contents or credential strings.
  suspicious=$(git ls-files --cached | grep -E '(^|/)(\.env(\..*)?|application_default_credentials\.json|.*service.?account.*\.json|.*firebase-adminsdk.*\.json|.*private.?key.*|id_rsa|.*\.(pem|p12|pfx))$' | grep -Ev '(^|/)\.env\.example$' || true)
  if [[ -n "$suspicious" ]]; then
    printf 'FAIL: inspect these tracked filenames before publishing:\n%s\n' "$suspicious"
    exit 1
  fi
  probable_key_files=$(git grep --cached -Il -E '"private_key"[[:space:]]*:' -- '.' 2>/dev/null || true)
  if [[ -n "$probable_key_files" ]]; then
    printf 'FAIL: inspect possible credential JSON in staged files (names only):\n%s\n' "$probable_key_files"
    exit 1
  fi
  git diff --cached --check
  echo 'PASS: tracked filename policy and staged whitespace check.'
else
  echo 'NOTE: the directory is not a Git repo yet; repeat after git init and git add.'
fi

echo '== Optional secret scanning =='
if command -v gitleaks >/dev/null 2>&1; then
  if [[ -d .git ]]; then
    gitleaks git --no-banner --redact .
  else
    gitleaks dir --no-banner --redact .
  fi
  echo 'PASS: gitleaks completed.'
else
  echo 'NOTE: gitleaks not installed. Perform a staged secret scan before publishing.'
fi

echo 'PRE-FLIGHT COMPLETE: do not treat this as an end-to-end runtime test.'
