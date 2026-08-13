#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
ENTRYPOINT="$ROOT/docker/postgres-entrypoint.sh"
tests=0

assert_contains() {
    haystack="$1"
    needle="$2"
    label="$3"
    case "$haystack" in
        *"$needle"*) : ;;
        *)
            printf 'entrypoint failure test failed: %s did not contain %s. Next: restore the raw diagnostic and exact recovery message, then rerun npm run test:postgres-entrypoint.\n' "$label" "$needle" >&2
            exit 1
            ;;
    esac
}

run_failure() {
    command_name="$1"
    raw="$2"
    expected_status="$3"
    expected_step="$4"
    expected_action="$5"

    fixture=$(mktemp -d "${TMPDIR:-/tmp}/reflo-entrypoint.XXXXXX")
    mkdir -p "$fixture/bin" "$fixture/data"
    for name in initdb pg_ctl createdb postgres; do
        if [ "$name" = "$command_name" ]; then
            printf '#!/bin/sh\nprintf %s\\n %s >&2\nexit %s\n' "'%s'" "'$raw'" "$expected_status" > "$fixture/bin/$name"
        else
            printf '#!/bin/sh\nexit 0\n' > "$fixture/bin/$name"
        fi
        chmod 700 "$fixture/bin/$name"
    done

    set +e
    output=$(PATH="$fixture/bin:/usr/bin:/bin" PGDATA="$fixture/data" \
        POSTGRES_PASSWORD=test POSTGRES_USER=postgres POSTGRES_DB=reflo \
        sh "$ENTRYPOINT" postgres 2>&1)
    status=$?
    set -e
    if [ "$status" -ne "$expected_status" ]; then
        printf 'entrypoint failure test failed: %s returned %s, expected %s. Next: preserve the failing command exit code, then rerun npm run test:postgres-entrypoint.\n' "$command_name" "$status" "$expected_status" >&2
        exit 1
    fi
    assert_contains "$output" "$raw" "$command_name raw diagnostic"
    assert_contains "$output" "$expected_step" "$command_name step"
    assert_contains "$output" "Next: $expected_action" "$command_name recovery"
    tests=$((tests + 1))
}

run_failure initdb 'initdb raw failure' 23 'running initdb' 'inspect the initdb diagnostic'
run_failure pg_ctl 'pg_ctl raw failure' 24 'starting temporary PostgreSQL with pg_ctl' 'inspect the PostgreSQL log under PGDATA'
run_failure createdb 'createdb raw failure' 25 'creating database reflo as postgres' 'correct POSTGRES_DB or POSTGRES_USER'

printf '%s PostgreSQL entrypoint failure tests passed.\n' "$tests"
