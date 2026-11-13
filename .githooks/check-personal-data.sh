#!/bin/sh
# Stops a commit or a push that would publish a real-looking UK mobile number or a personal email address.
# Why: on 9 to 13 Nov 2026 two real numbers and a personal address were committed to a public repository.
# Rule: test data is made up. Mobiles come from 07700 900000 to 07700 900999. Emails use example.com.
# This file holds patterns only. It must never hold a real number or address.
#
#   check-personal-data.sh staged          lines being committed, and who the commit is signed as
#   check-personal-data.sh commit <id>     one existing commit: its added lines and its author and committer
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
ALLOW="$HERE/allowed-emails.txt"
MOB='(^|[^0-9A-Za-z.+])((\+44|0044)[ -]?(\(0\)[ -]?)?|0)7([ -]?[0-9]){9}($|[^0-9A-Za-z])'
EML='[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}'
BAD=0

allowed_email() {
  case "$1" in
    *@example.com|*@example.org|*@example.net|*@users.noreply.github.com|noreply@github.com|noreply@anthropic.com) return 0 ;;
    *.png|*.jpg|*.jpeg|*.gif|*.svg|*.webp|*.js|*.css|*.map|*.woff|*.woff2) return 0 ;;   # logo@2x.png and the like
  esac
  [ -f "$ALLOW" ] && grep -v '^#' "$ALLOW" | tr 'A-Z' 'a-z' | grep -qxF "$1"
}

mask_email() { printf '%s' "$1" | sed -E 's/^(.)[^@]*@/\1***@/'; }

# Turns a diff into "path:line:text" for each added line.
added_lines() {
  awk '
    /^\+\+\+ / { f = substr($0, 5); sub(/^b\//, "", f); next }
    /^@@ /     { split($3, a, ","); n = substr(a[1], 2) + 0; next }
    /^\+/      { print f ":" n ":" substr($0, 2); n++ }'
}

scan() {   # stdin: path:line:text
  grep -E -e "$MOB" -e "$EML" | while IFS= read -r L; do
    where=$(printf '%s' "$L" | cut -d: -f1,2)
    text=$(printf '%s' "$L" | cut -d: -f3-)
    printf '%s\n' "$text" | grep -oE "$MOB" | while IFS= read -r m; do
      d=$(printf '%s' "$m" | tr -cd '0-9')
      case "$d" in 0044*) d="0${d#0044}" ;; 44*) d="0${d#44}" ;; esac
      case "$d" in 00*) d="${d#0}" ;; esac
      [ ${#d} -eq 11 ] || continue
      case "$d" in 07700900*) continue ;; esac
      echo "  $where  a mobile number ending $(printf '%s' "$d" | cut -c10-11) that is not in the made-up range 07700 900xxx"
    done
    printf '%s\n' "$text" | grep -oE "$EML" | tr 'A-Z' 'a-z' | while IFS= read -r e; do
      allowed_email "$e" || echo "  $where  an email address that is not on the allowed list: $(mask_email "$e")"
    done
  done
}

check_ident() {   # $1 = what, $2 = address
  e=$(printf '%s' "$2" | tr 'A-Z' 'a-z')
  [ -z "$e" ] && return 0
  allowed_email "$e" || echo "  $1 is signed with $(mask_email "$e"): use a no-reply address (git config user.email)"
}

case "${1:-staged}" in
  staged)
    OUT=$( { git diff --cached -U0 --no-color --no-ext-diff --diff-filter=ACMR | added_lines | scan
             check_ident "This commit's author" "$(git var GIT_AUTHOR_IDENT | sed -E 's/.*<([^>]*)>.*/\1/')"
             check_ident "This commit's committer" "$(git var GIT_COMMITTER_IDENT | sed -E 's/.*<([^>]*)>.*/\1/')"; } ) ;;
  commit)
    c=$2
    OUT=$( { git show --format= -U0 --no-color --no-ext-diff "$c" | added_lines | scan
             check_ident "Commit $(git rev-parse --short "$c") author" "$(git show -s --format=%ae "$c")"
             check_ident "Commit $(git rev-parse --short "$c") committer" "$(git show -s --format=%ce "$c")"; } ) ;;
  *) echo "usage: $0 staged | commit <id>" >&2; exit 2 ;;
esac

if [ -n "$OUT" ]; then
  echo "BLOCKED: this would publish personal details." >&2
  printf '%s\n' "$OUT" >&2
  echo "Use a made-up value (07700 900xxx, name@example.com). If an address is a public shop one, add it to .githooks/allowed-emails.txt." >&2
  exit 1
fi
exit 0
