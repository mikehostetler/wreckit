import Config

# Production-only compile-time configuration.
#
# Note: runtime configuration (ports, secrets, external endpoints) lives in
# `config/runtime.exs`.

# Enforce SSL redirects/HSTS in the Edge Gateway Endpoint when compiled for prod.
config :cybernetic, :enforce_tls, true
