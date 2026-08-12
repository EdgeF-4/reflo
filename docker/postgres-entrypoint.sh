#!/bin/sh
set -eu

if [ "${1:-}" = "postgres" ]; then
    : "${POSTGRES_PASSWORD:?Error: POSTGRES_PASSWORD is required. Next: set a non-empty local password and start the stack again.}"

    db_user="${POSTGRES_USER:-postgres}"
    db_name="${POSTGRES_DB:-$db_user}"

    if [ ! -s "$PGDATA/PG_VERSION" ]; then
        mkdir -p "$PGDATA" /run/postgresql
        chmod 0700 "$PGDATA"

        printf '%s\n' "$POSTGRES_PASSWORD" | initdb \
            --username="$db_user" \
            --pwfile=/dev/stdin \
            ${POSTGRES_INITDB_ARGS:-}

        printf '\nhost all all all scram-sha-256\n' >> "$PGDATA/pg_hba.conf"

        pg_ctl -D "$PGDATA" \
            -o "-c listen_addresses='' -c unix_socket_directories='/run/postgresql'" \
            -w start
        if [ "$db_name" != "postgres" ]; then
            createdb --host=/run/postgresql --username="$db_user" "$db_name"
        fi
        pg_ctl -D "$PGDATA" -m fast -w stop
    fi

    set -- postgres -c "listen_addresses=*" -c "unix_socket_directories=/run/postgresql"
fi

exec "$@"
