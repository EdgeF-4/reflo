#!/bin/sh
set -eu

postgres_fail() {
    status="$1"
    step="$2"
    action="$3"
    printf 'PostgreSQL setup failed while %s (exit %s). The raw command failure is above. Next: %s\n' \
        "$step" "$status" "$action" >&2
    exit "$status"
}

if [ "${1:-}" = "postgres" ]; then
    : "${POSTGRES_PASSWORD:?Error: POSTGRES_PASSWORD is required. Next: set a non-empty local password and start the stack again.}"

    db_user="${POSTGRES_USER:-postgres}"
    db_name="${POSTGRES_DB:-$db_user}"

    if [ ! -s "$PGDATA/PG_VERSION" ]; then
        if mkdir -p "$PGDATA" /run/postgresql; then
            :
        else
            status="$?"
            postgres_fail "$status" "creating PostgreSQL data directories" \
                "correct the mounted volume ownership or free space, then rerun 'docker compose up --build --wait'."
        fi
        if chmod 0700 "$PGDATA"; then
            :
        else
            status="$?"
            postgres_fail "$status" "securing PGDATA at $PGDATA" \
                "make the mounted data directory writable by the container's postgres user, then rerun 'docker compose up --build --wait'."
        fi

        if printf '%s\n' "$POSTGRES_PASSWORD" | initdb \
            --username="$db_user" \
            --pwfile=/dev/stdin \
            ${POSTGRES_INITDB_ARGS:-}; then
            :
        else
            status="$?"
            postgres_fail "$status" "running initdb for $PGDATA" \
                "inspect the initdb diagnostic, correct PGDATA ownership, space, locale, or POSTGRES_INITDB_ARGS, then rerun 'docker compose up --build --wait'."
        fi

        if printf '\nhost all all all scram-sha-256\n' >> "$PGDATA/pg_hba.conf"; then
            :
        else
            status="$?"
            postgres_fail "$status" "writing $PGDATA/pg_hba.conf" \
                "make PGDATA writable by the postgres user, then rerun 'docker compose up --build --wait'."
        fi

        if pg_ctl -D "$PGDATA" \
            -o "-c listen_addresses='' -c unix_socket_directories='/run/postgresql'" \
            -w start; then
            :
        else
            status="$?"
            postgres_fail "$status" "starting temporary PostgreSQL with pg_ctl" \
                "inspect the PostgreSQL log under PGDATA, correct the reported data or socket problem, then rerun 'docker compose up --build --wait'."
        fi
        if [ "$db_name" != "postgres" ]; then
            if createdb --host=/run/postgresql --username="$db_user" "$db_name"; then
                :
            else
                status="$?"
                if pg_ctl -D "$PGDATA" -m fast -w stop; then
                    :
                else
                    stop_status="$?"
                    printf 'Temporary PostgreSQL cleanup also failed (exit %s). Next: inspect the PostgreSQL log and stop the temporary server before retrying.\n' "$stop_status" >&2
                fi
                postgres_fail "$status" "creating database $db_name as $db_user" \
                    "correct POSTGRES_DB or POSTGRES_USER using a valid PostgreSQL identifier, then rerun 'docker compose up --build --wait'."
            fi
        fi
        if pg_ctl -D "$PGDATA" -m fast -w stop; then
            :
        else
            status="$?"
            postgres_fail "$status" "stopping temporary PostgreSQL with pg_ctl" \
                "inspect the PostgreSQL log under PGDATA, stop the temporary server, then rerun 'docker compose up --build --wait'."
        fi
    fi

    set -- postgres -c "listen_addresses=*" -c "unix_socket_directories=/run/postgresql"
fi

runtime_command="${1:-}"
if [ -z "$runtime_command" ]; then
    printf 'PostgreSQL runtime command was not provided. Next: restore the image default CMD (postgres), then rerun the container.\n' >&2
    exit 64
fi
if ! command -v "$runtime_command" >/dev/null 2>&1; then
    printf 'PostgreSQL runtime command "%s" was not found. Next: restore the image default CMD or install that command, then rerun the container.\n' "$runtime_command" >&2
    exit 127
fi

exec "$@"
