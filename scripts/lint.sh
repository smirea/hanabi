#!/usr/bin/env bash

set -o pipefail

status=0

oxlint -c oxlint.json --type-aware --fix "$@" || status=1
oxfmt --ignore-path .oxfmtignore "$@" || status=1

exit "$status"
