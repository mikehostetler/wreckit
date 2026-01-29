# Multi-stage Dockerfile for Cybernetic VSM Framework
# Stage 1: Build
FROM elixir:1.18.3-otp-26-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    git \
    gcc \
    g++ \
    make \
    libc-dev \
    openssl-dev \
    ncurses-dev

# Set build environment
ENV MIX_ENV=prod

# Prepare build directory
WORKDIR /app

# Install hex and rebar
RUN mix local.hex --force && \
    mix local.rebar --force

# Copy mix files
COPY mix.exs mix.lock ./
COPY config config

# Get dependencies and compile them
RUN mix deps.get --only prod && \
    mix deps.compile

# Copy source code
COPY lib lib
COPY priv priv

# Compile application
RUN mix compile

# Build release
RUN mix release

# Stage 2: Runtime
FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache \
    openssl \
    ncurses-libs \
    libstdc++ \
    bash \
    curl \
    jq

# Create app user
RUN addgroup -g 1000 cybernetic && \
    adduser -D -s /bin/sh -u 1000 -G cybernetic cybernetic

WORKDIR /app

# Copy release from builder
COPY --from=builder --chown=cybernetic:cybernetic /app/_build/prod/rel/cybernetic ./

# Set environment
ENV HOME=/app \
    LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8 \
    PORT=4000 \
    RELEASE_COOKIE=cybernetic_cookie_change_in_prod \
    RELEASE_NODE=cybernetic@127.0.0.1

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:4000/health || exit 1

# Switch to app user
USER cybernetic

# Expose ports
EXPOSE 4000 4369 9568

# Start the application
CMD ["bin/cybernetic", "start"]
