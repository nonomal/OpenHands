# OpenHands Enterprise Local Development Setup

This guide provides instructions for setting up OpenHands Enterprise locally for development.

## Prerequisites

- **Docker** and **Docker Compose** (v2+)
- **Python 3.12+**
- **Poetry** (Python package manager)
- **Node.js 18+** and **npm** (for frontend)
- An LLM API key (OpenAI, Anthropic, or other supported provider)

## Quick Start

### 1. Start Infrastructure Services

Start all required services using Docker Compose:

```bash
cd enterprise

# Start PostgreSQL, Redis, Keycloak, and LiteLLM
docker-compose -f docker-compose.local.yml up -d
```

This will start:
- **PostgreSQL** on port `5432` (database for OpenHands and Keycloak)
- **Redis** on port `6379` (caching and pub/sub)
- **Keycloak** on port `8080` (authentication)
- **LiteLLM** on port `4000` (LLM proxy)

### 2. Configure Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` and set your LLM API keys. For LiteLLM to work, you need at least one of:
- `OPENAI_API_KEY` - for GPT models
- `ANTHROPIC_API_KEY` - for Claude models

Update the docker-compose to include your API keys:

```bash
# Add to litellm service environment in docker-compose.local.yml
# Or create a .env file for docker-compose

# Then restart litellm
docker-compose -f docker-compose.local.yml up -d litellm
```

### 3. Initialize the Database

Run Alembic migrations to set up the database schema:

```bash
cd enterprise
poetry install
poetry run alembic upgrade head
```

### 4. Configure Keycloak (Authentication)

#### Option A: Skip Keycloak (Simplified Setup)

For basic local development without authentication, you can skip Keycloak by not setting `GITHUB_APP_CLIENT_ID` and related variables. The app will still work but OAuth login won't be available.

#### Option B: Set Up Keycloak Realm

1. Access Keycloak Admin Console at `http://localhost:8080`
2. Login with `admin` / `admin`
3. Create a new realm called `openhands`
4. Create a client:
   - Client ID: `openhands-client`
   - Client authentication: ON
   - Valid redirect URIs: `http://localhost:3000/*`, `http://localhost:3001/*`
5. Copy the client secret and update your `.env`:
   ```
   KEYCLOAK_CLIENT_SECRET=<your-client-secret>
   ```

### 5. Build the Frontend

```bash
# From the repository root (not enterprise/)
cd ..
make build-frontend
# OR
cd frontend && npm install && npm run build
```

### 6. Start the Enterprise Backend

```bash
cd enterprise

# Option A: Using Make
OPENHANDS_PATH=../ make start-backend

# Option B: Using Poetry directly
FRONTEND_DIRECTORY=../frontend/build poetry run uvicorn saas_server:app --host 127.0.0.1 --port 3000 --reload
```

### 7. Access the Application

- **Frontend**: http://localhost:3000 (or 3001 if using dev server)
- **Backend API**: http://localhost:3000/api
- **Keycloak Admin**: http://localhost:8080
- **LiteLLM Proxy**: http://localhost:4000

## Individual Service Setup

If you prefer to run services individually:

### PostgreSQL

```bash
docker run -d \
  --name openhands-postgres \
  -p 5432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=openhands \
  postgres:15
```

### Redis

```bash
docker run -d \
  --name openhands-redis \
  -p 6379:6379 \
  redis:7-alpine
```

### Keycloak

```bash
docker run -d \
  --name openhands-keycloak \
  -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -e KC_HTTP_ENABLED=true \
  -e KC_HOSTNAME_STRICT=false \
  quay.io/keycloak/keycloak:26.1.1 start-dev
```

### LiteLLM

```bash
# Create litellm-config.yaml first (see file in this directory)
docker run -d \
  --name openhands-litellm \
  -p 4000:4000 \
  -v $(pwd)/litellm-config.yaml:/app/config.yaml \
  -e LITELLM_MASTER_KEY=sk-local-dev-master-key \
  -e OPENAI_API_KEY=your-openai-key \
  -e ANTHROPIC_API_KEY=your-anthropic-key \
  ghcr.io/berriai/litellm:main-latest \
  --config /app/config.yaml --port 4000 --host 0.0.0.0
```

## Configuration Details

### Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL user | `postgres` |
| `DB_PASS` | PostgreSQL password | `postgres` |
| `DB_NAME` | PostgreSQL database name | `openhands` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `KEYCLOAK_SERVER_URL` | Keycloak internal URL | - |
| `KEYCLOAK_SERVER_URL_EXT` | Keycloak external URL | - |
| `KEYCLOAK_REALM_NAME` | Keycloak realm | - |
| `KEYCLOAK_CLIENT_ID` | Keycloak client ID | - |
| `KEYCLOAK_CLIENT_SECRET` | Keycloak client secret | - |
| `LITE_LLM_API_URL` | LiteLLM proxy URL | `http://localhost:4000` |
| `LITE_LLM_API_KEY` | LiteLLM master key | - |
| `LITELLM_DEFAULT_MODEL` | Default model to use | `litellm_proxy/claude-sonnet-4-20250514` |
| `OPENHANDS_CONFIG_CLS` | Server config class | `server.config.SaaSServerConfig` |
| `LOCAL_DEPLOYMENT` | Flag for local mode | `true` |

### LiteLLM Configuration

The `litellm-config.yaml` file defines which LLM models are available through the proxy. You can add or modify models as needed.

To test if LiteLLM is working:

```bash
curl http://localhost:4000/v1/models
```

### Keycloak Realm Setup for GitHub OAuth

To enable GitHub OAuth through Keycloak:

1. Create a GitHub OAuth App at https://github.com/settings/developers
2. In Keycloak:
   - Go to Identity Providers > Add provider > GitHub
   - Enter your GitHub Client ID and Secret
   - Set redirect URI to match your Keycloak URL

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs openhands-postgres

# Test connection
psql -h localhost -U postgres -d openhands
```

### Redis Connection Issues

```bash
# Check if Redis is running
docker ps | grep redis

# Test connection
redis-cli -h localhost ping
```

### Keycloak Issues

```bash
# Check logs
docker logs openhands-keycloak

# Access admin console
open http://localhost:8080/admin
```

### LiteLLM Issues

```bash
# Check logs
docker logs openhands-litellm

# Check health
curl http://localhost:4000/health

# List available models
curl http://localhost:4000/v1/models
```

### Common Issues

1. **"Connection refused" errors**: Ensure all Docker containers are running and ports are not blocked.

2. **Authentication failures**: Check Keycloak configuration and client credentials.

3. **LLM errors**: Verify your API keys are correctly set in the LiteLLM environment.

4. **Database migration errors**: Ensure PostgreSQL is running before running migrations.

## Stopping Services

```bash
# Stop all services
docker-compose -f docker-compose.local.yml down

# Stop and remove volumes (clears all data)
docker-compose -f docker-compose.local.yml down -v
```

## Development Tips

1. **Hot reloading**: Use `--reload` flag with uvicorn for automatic server restarts.

2. **Frontend development**: Run the frontend dev server separately for faster iteration:
   ```bash
   cd ../frontend && npm run dev
   ```

3. **Database changes**: After modifying models, create a new migration:
   ```bash
   poetry run alembic revision --autogenerate -m "description"
   poetry run alembic upgrade head
   ```

4. **Debugging**: Set `LOG_PLAIN_TEXT=1` for readable logs.

## Minimal Setup (Without Authentication)

For the simplest possible setup without OAuth:

```bash
# Start only PostgreSQL and Redis
docker run -d --name openhands-postgres -p 5432:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=openhands postgres:15

docker run -d --name openhands-redis -p 6379:6379 redis:7-alpine

# Create minimal .env
cat > .env << 'EOF'
DB_HOST=localhost
REDIS_HOST=localhost
OPENHANDS_CONFIG_CLS=server.config.SaaSServerConfig
LOCAL_DEPLOYMENT=true
POSTHOG_CLIENT_KEY=test
LOG_PLAIN_TEXT=1
EOF

# Run migrations and start server
poetry install
poetry run alembic upgrade head
FRONTEND_DIRECTORY=../frontend/build poetry run uvicorn saas_server:app --host 0.0.0.0 --port 3000 --reload
```

This provides a working enterprise server without Keycloak authentication or LiteLLM proxy. You can configure LLM directly through the UI or environment variables.
