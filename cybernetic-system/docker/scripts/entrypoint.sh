#!/bin/bash
set -e

# Cybernetic Application Entrypoint
# Handles database migrations and application startup

echo "==> Starting Cybernetic VSM Platform..."
echo "==> Environment: ${MIX_ENV:-prod}"

# Wait for database to be ready
wait_for_postgres() {
    echo "==> Waiting for PostgreSQL..."
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if pg_isready -h ${PGHOST:-postgres} -p ${PGPORT:-5432} -U ${PGUSER:-cybernetic} > /dev/null 2>&1; then
            echo "==> PostgreSQL is ready!"
            return 0
        fi
        echo "==> Attempt $attempt/$max_attempts - PostgreSQL not ready, waiting..."
        sleep 2
        attempt=$((attempt + 1))
    done

    echo "==> ERROR: PostgreSQL did not become ready in time"
    return 1
}

# Wait for RabbitMQ to be ready
wait_for_rabbitmq() {
    echo "==> Waiting for RabbitMQ..."
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -s -o /dev/null -w "%{http_code}" http://${RABBITMQ_HOST:-rabbitmq}:15672/api/health/checks/alarms | grep -q "200"; then
            echo "==> RabbitMQ is ready!"
            return 0
        fi
        echo "==> Attempt $attempt/$max_attempts - RabbitMQ not ready, waiting..."
        sleep 2
        attempt=$((attempt + 1))
    done

    echo "==> WARNING: RabbitMQ health check failed, proceeding anyway..."
    return 0
}

# Run database migrations
run_migrations() {
    echo "==> Running database migrations..."

    if [ "${SKIP_MIGRATIONS:-false}" = "true" ]; then
        echo "==> Skipping migrations (SKIP_MIGRATIONS=true)"
        return 0
    fi

    # Run migrations using the release eval command
    if [ -f "bin/cybernetic" ]; then
        bin/cybernetic eval "Cybernetic.Release.migrate()"
    else
        # For development, use mix
        mix ecto.migrate
    fi

    echo "==> Migrations complete!"
}

# Seed the database (optional)
run_seeds() {
    if [ "${RUN_SEEDS:-false}" = "true" ]; then
        echo "==> Running database seeds..."
        if [ -f "bin/cybernetic" ]; then
            bin/cybernetic eval "Cybernetic.Release.seed()"
        else
            mix run priv/repo/seeds.exs
        fi
        echo "==> Seeds complete!"
    fi
}

# Main execution
main() {
    # Wait for dependencies
    wait_for_postgres
    wait_for_rabbitmq

    # Run migrations and seeds
    run_migrations
    run_seeds

    echo "==> Starting application..."

    # Start the application based on environment
    if [ -f "bin/cybernetic" ]; then
        # Production release
        exec bin/cybernetic start
    else
        # Development mode
        exec mix phx.server
    fi
}

# Handle signals for graceful shutdown
trap 'echo "==> Received shutdown signal, stopping..."; exit 0' SIGTERM SIGINT

# Run main
main "$@"
