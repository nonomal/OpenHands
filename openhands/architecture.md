# OpenHands Architecture

This document provides detailed architecture diagrams and explanations for the OpenHands system.

## Table of Contents

- [System Architecture Overview](#system-architecture-overview)
- [Conversation Startup & WebSocket Flow](#conversation-startup--websocket-flow)
- [Authentication Flow](#authentication-flow)
- [Agent Execution & LLM Flow](#agent-execution--llm-flow)
- [External Integrations](#external-integrations)
- [Metrics, Logs & Observability](#metrics-logs--observability)

---

## System Architecture Overview

OpenHands uses a multi-tier architecture with these main components:

```mermaid
flowchart TB
    subgraph AppServer["OpenHands App Server (Single Instance)"]
        API["REST API<br/>(FastAPI)"]
        Auth["Authentication"]
        ConvMgr["Conversation<br/>Manager"]
        SandboxSvc["Sandbox<br/>Service"]
    end

    subgraph RuntimeAPI["Runtime API (Separate Service)"]
        RuntimeMgr["Runtime<br/>Manager"]
        WarmPool["Warm Runtime<br/>Pool"]
    end

    subgraph Sandbox["Sandbox (Docker/K8s Container)"]
        AS["Agent Server<br/>(openhands-agent-server)"]
        AES["Action Execution<br/>Server"]
        Browser["Browser<br/>Environment"]
        FS["File System"]
    end

    User["User"] -->|"1. HTTP/REST"| API
    API --> Auth
    Auth --> ConvMgr
    ConvMgr --> SandboxSvc

    SandboxSvc -->|"2. POST /start"| RuntimeMgr
    RuntimeMgr -->|"Check pool"| WarmPool
    WarmPool -->|"Warm runtime<br/>available?"| RuntimeMgr
    RuntimeMgr -->|"3. Provision or<br/>assign runtime"| Sandbox

    User -.->|"4. WebSocket<br/>(Direct)"| AS

    AS -->|"HTTP"| AES
    AES --> Browser
    AES --> FS
```

### Component Responsibilities

| Component | Location | Instances | Purpose |
|-----------|----------|-----------|---------|
| **App Server** | Host | 1 per deployment | REST API, auth, conversation management |
| **Sandbox Service** | Inside App Server | 1 | Manages sandbox lifecycle, calls Runtime API |
| **Runtime API** | Separate service | 1 per deployment | Provisions runtimes, manages warm pool |
| **Agent Server** | Inside sandbox | 1 per sandbox | AI agent loop, LLM calls, state management |
| **Action Execution Server** | Inside sandbox | 1 per sandbox | Execute bash, file ops, browser actions |

### Runtime API Endpoints

The Runtime API manages the actual container/pod lifecycle:

| Endpoint | Purpose |
|----------|---------|
| `POST /start` | Start a new runtime (or assign from warm pool) |
| `POST /stop` | Stop and clean up a runtime |
| `POST /pause` | Pause a running runtime |
| `POST /resume` | Resume a paused runtime |
| `GET /sessions/{id}` | Get runtime status |
| `GET /list` | List all active runtimes |

## Conversation Startup & WebSocket Flow

When a user starts a conversation, this sequence occurs:

```mermaid
sequenceDiagram
    autonumber
    participant User as User (Browser)
    participant App as App Server
    participant SS as Sandbox Service
    participant RAPI as Runtime API
    participant Pool as Warm Pool
    participant Sandbox as Sandbox (Container)
    participant AS as Agent Server
    participant AES as Action Execution Server

    Note over User,AES: Phase 1: Conversation Creation
    User->>App: POST /api/conversations
    App->>App: Authenticate user
    App->>SS: Create sandbox

    Note over SS,Pool: Phase 2: Runtime Provisioning
    SS->>RAPI: POST /start (image, env, config)
    RAPI->>Pool: Check for warm runtime
    alt Warm runtime available
        Pool-->>RAPI: Return warm runtime
        RAPI->>RAPI: Assign to session
    else No warm runtime
        RAPI->>Sandbox: Create new container
        Sandbox->>AS: Start Agent Server
        Sandbox->>AES: Start Action Execution Server
        AES-->>AS: Ready
    end
    RAPI-->>SS: Runtime URL + session API key
    SS-->>App: Sandbox info
    App-->>User: Conversation ID + Sandbox URL

    Note over User,AES: Phase 3: Direct WebSocket Connection
    User->>AS: WebSocket: /sockets/events/{id}
    AS-->>User: Connection accepted
    AS->>User: Replay historical events

    Note over User,AES: Phase 4: User Sends Message
    User->>AS: WebSocket: SendMessageRequest
    AS->>AS: Agent processes message
    AS->>AS: LLM call → generate action

    Note over User,AES: Phase 5: Action Execution Loop
    loop Agent Loop
        AS->>AES: HTTP: Execute action
        AES->>AES: Run in sandbox
        AES-->>AS: Observation result
        AS->>User: WebSocket: Event update
        AS->>AS: Update state, next action
    end

    Note over User,AES: Phase 6: Task Complete
    AS->>User: WebSocket: AgentStateChanged (FINISHED)
```

### Key Points

1. **Initial Setup via App Server**: The App Server handles authentication and coordinates with the Sandbox Service
2. **Runtime API Provisioning**: The Sandbox Service calls the Runtime API, which checks for warm runtimes before creating new containers
3. **Warm Pool Optimization**: Pre-warmed runtimes reduce startup latency significantly
4. **Direct WebSocket to Sandbox**: Once created, the user's browser connects **directly** to the Agent Server inside the sandbox
5. **App Server Not in Hot Path**: After connection, all real-time communication bypasses the App Server entirely
6. **Agent Server Orchestrates**: The Agent Server manages the AI loop, calling the Action Execution Server for actual command execution

## Authentication Flow

OpenHands uses Keycloak for identity management in the SaaS deployment. The authentication flow involves multiple services:

```mermaid
sequenceDiagram
    autonumber
    participant User as User (Browser)
    participant App as App Server
    participant KC as Keycloak
    participant IdP as Identity Provider<br/>(GitHub, Google, etc.)
    participant DB as User Database

    Note over User,DB: OAuth 2.0 / OIDC Authentication Flow

    User->>App: Access OpenHands
    App->>User: Redirect to Keycloak
    User->>KC: Login request
    KC->>User: Show login options
    User->>KC: Select provider (e.g., GitHub)
    KC->>IdP: OAuth redirect
    User->>IdP: Authenticate
    IdP-->>KC: OAuth callback + tokens
    KC->>KC: Create/update user session
    KC-->>User: Redirect with auth code
    User->>App: Auth code
    App->>KC: Exchange code for tokens
    KC-->>App: Access token + Refresh token
    App->>App: Create signed JWT cookie
    App->>DB: Store/update user record
    App-->>User: Set keycloak_auth cookie

    Note over User,DB: Subsequent Requests

    User->>App: Request with cookie
    App->>App: Verify JWT signature
    App->>KC: Validate token (if needed)
    KC-->>App: Token valid
    App->>App: Extract user context
    App-->>User: Authorized response
```

### Authentication Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **Keycloak** | Identity provider, SSO, token management | External service |
| **UserAuth** | Abstract auth interface | `openhands/server/user_auth/user_auth.py` |
| **SaasUserAuth** | Keycloak implementation | `enterprise/server/auth/saas_user_auth.py` |
| **JWT Service** | Token signing/verification | `openhands/app_server/services/jwt_service.py` |
| **Auth Routes** | Login/logout endpoints | `enterprise/server/routes/auth.py` |

### Token Flow

1. **Keycloak Access Token**: Short-lived token for API access
2. **Keycloak Refresh Token**: Long-lived token to obtain new access tokens
3. **Signed JWT Cookie**: App Server's session cookie containing encrypted Keycloak tokens
4. **Provider Tokens**: OAuth tokens for GitHub, GitLab, etc. (stored separately for git operations)

## Agent Execution & LLM Flow

When the agent executes inside the sandbox, it makes LLM calls through LiteLLM:

```mermaid
sequenceDiagram
    autonumber
    participant User as User (Browser)
    participant AS as Agent Server
    participant Agent as Agent<br/>(CodeAct)
    participant LLM as LLM Class
    participant Lite as LiteLLM
    participant Proxy as LLM Proxy<br/>(llm-proxy.app.all-hands.dev)
    participant Provider as LLM Provider<br/>(OpenAI, Anthropic, etc.)
    participant AES as Action Execution Server

    Note over User,AES: Agent Loop - LLM Call Flow

    User->>AS: WebSocket: User message
    AS->>Agent: Process message
    Agent->>Agent: Build prompt from state

    Agent->>LLM: completion(messages, tools)
    LLM->>LLM: Apply config (model, temp, etc.)

    alt Using OpenHands Provider
        LLM->>Lite: litellm_proxy/{model}
        Lite->>Proxy: POST /chat/completions
        Proxy->>Proxy: Auth, rate limit, routing
        Proxy->>Provider: Forward request
        Provider-->>Proxy: Response
        Proxy-->>Lite: Response
    else Using Direct Provider
        LLM->>Lite: {provider}/{model}
        Lite->>Provider: Direct API call
        Provider-->>Lite: Response
    end

    Lite-->>LLM: ModelResponse
    LLM->>LLM: Track metrics (cost, tokens)
    LLM-->>Agent: Parsed response

    Agent->>Agent: Parse action from response
    AS->>User: WebSocket: Action event

    Note over User,AES: Action Execution

    AS->>AES: HTTP: Execute action
    AES->>AES: Run command/edit file
    AES-->>AS: Observation
    AS->>User: WebSocket: Observation event

    Agent->>Agent: Update state
    Note over Agent: Loop continues...
```

### LLM Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **LLM Class** | Wrapper with retries, metrics, config | `openhands/llm/llm.py` |
| **LiteLLM** | Universal LLM API adapter | External library |
| **LLM Proxy** | OpenHands managed proxy for billing/routing | `llm-proxy.app.all-hands.dev` |
| **LLM Registry** | Manages multiple LLM instances | `openhands/llm/llm_registry.py` |

### Model Routing

```
User selects model
        │
        ▼
┌───────────────────┐
│ Model prefix?     │
└───────────────────┘
        │
        ├── openhands/claude-3-5  ──► Rewrite to litellm_proxy/claude-3-5
        │                              Base URL: llm-proxy.app.all-hands.dev
        │
        ├── anthropic/claude-3-5  ──► Direct to Anthropic API
        │                              (User's API key)
        │
        ├── openai/gpt-4          ──► Direct to OpenAI API
        │                              (User's API key)
        │
        └── azure/gpt-4           ──► Direct to Azure OpenAI
                                       (User's API key + endpoint)
```

### LLM Proxy Benefits

When using `openhands/` prefixed models:
- **Unified Billing**: Costs tracked through OpenHands account
- **No API Keys Needed**: Users don't need their own provider keys
- **Rate Limiting**: Managed quotas and throttling
- **Model Routing**: Automatic failover and load balancing
- **Usage Tracking**: Detailed metrics and cost analysis

## External Integrations

OpenHands integrates with external services (GitHub, Slack, Jira, etc.) through webhook-based event handling:

```mermaid
sequenceDiagram
    autonumber
    participant Ext as External Service<br/>(GitHub/Slack/Jira)
    participant App as App Server
    participant IntRouter as Integration Router
    participant Manager as Integration Manager
    participant Conv as Conversation Service
    participant Sandbox as Sandbox

    Note over Ext,Sandbox: Webhook Event Flow (e.g., GitHub Issue Created)

    Ext->>App: POST /api/integration/{service}/events
    App->>IntRouter: Route to service handler
    IntRouter->>IntRouter: Verify signature<br/>(HMAC/signing secret)

    IntRouter->>Manager: Parse event payload
    Manager->>Manager: Extract context<br/>(repo, issue, user)
    Manager->>Manager: Map external user → OpenHands user<br/>(via stored tokens)

    Manager->>Conv: Create conversation<br/>(with issue context)
    Conv->>Sandbox: Provision sandbox
    Sandbox-->>Conv: Ready

    Manager->>Sandbox: Start agent with task

    Note over Ext,Sandbox: Agent Works on Task...

    Sandbox-->>Manager: Task complete
    Manager->>Ext: POST result<br/>(PR, comment, etc.)

    Note over Ext,Sandbox: Callback Flow (Agent → External Service)

    Sandbox->>App: Webhook callback<br/>/api/v1/webhooks
    App->>Manager: Process callback
    Manager->>Ext: Update external service
```

### Supported Integrations

| Integration | Trigger Events | Agent Actions |
|-------------|----------------|---------------|
| **GitHub** | Issue created, PR opened, @mention | Create PR, comment, push commits |
| **GitLab** | Issue created, MR opened | Create MR, comment, push commits |
| **Slack** | @mention in channel | Reply in thread, create tasks |
| **Jira** | Issue created/updated | Update ticket, add comments |
| **Linear** | Issue created | Update status, add comments |

### Integration Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **Integration Routes** | Webhook endpoints per service | `enterprise/server/routes/integration/` |
| **Integration Managers** | Business logic per service | `enterprise/integrations/{service}/` |
| **Token Manager** | Store/retrieve OAuth tokens | `enterprise/server/auth/token_manager.py` |
| **Callback Processor** | Handle agent → service updates | `enterprise/integrations/{service}/*_callback_processor.py` |

### Integration Authentication

```
External Service (e.g., GitHub)
        │
        ▼
┌─────────────────────────────────┐
│ GitHub App Installation         │
│ - Webhook secret for signature  │
│ - App private key for API calls │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ User Account Linking            │
│ - Keycloak user ID              │
│ - GitHub user ID                │
│ - Stored OAuth tokens           │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Agent Execution                 │
│ - Uses linked tokens for API    │
│ - Can push, create PRs, comment │
└─────────────────────────────────┘
```

## Metrics, Logs & Observability

OpenHands uses multiple systems for monitoring, analytics, and debugging:

```mermaid
flowchart LR
    subgraph Sources["Sources"]
        Agent["Agent Server"]
        App["App Server"]
        Frontend["Frontend"]
    end

    subgraph Collection["Collection"]
        JSONLog["JSON Logs"]
        Metrics["Metrics"]
        PH["PostHog"]
    end

    subgraph Services["Services"]
        DD["DataDog"]
        PHCloud["PostHog Cloud"]
    end

    Agent --> JSONLog
    App --> JSONLog
    App --> PH
    Frontend --> PH

    JSONLog --> DD
    Metrics --> DD
    PH --> PHCloud
```

### Logging Infrastructure

| Component | Format | Destination | Purpose |
|-----------|--------|-------------|---------|
| **Application Logs** | JSON (when `LOG_JSON=1`) | stdout → DataDog | Debugging, error tracking |
| **Access Logs** | JSON (Uvicorn) | stdout → DataDog | Request tracing |
| **LLM Debug Logs** | Plain text | File (optional) | LLM call debugging |

### JSON Log Format

When `LOG_JSON=1` is set, all logs are emitted as single-line JSON for DataDog ingestion:

```json
{
  "message": "Conversation started",
  "severity": "INFO",
  "conversation_id": "abc-123",
  "user_id": "user-456",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Metrics Tracked

| Metric | Tracked By | Storage | Purpose |
|--------|------------|---------|---------|
| **LLM Cost** | `Metrics` class | Conversation stats file | Billing, budget limits |
| **Token Usage** | `Metrics` class | Conversation stats file | Usage analytics |
| **Response Latency** | `Metrics` class | Conversation stats file | Performance monitoring |
| **User Events** | PostHog | PostHog Cloud | Product analytics |
| **Feature Flags** | PostHog | PostHog Cloud | Gradual rollouts |

### PostHog Analytics

PostHog is used for both product analytics and feature flags:

**Frontend Events:**
- `conversation_started`
- `download_trajectory_button_clicked`
- Feature flag checks

**Backend Events:**
- Experiment assignments
- Conversion tracking

### DataDog Integration

Logs are ingested by DataDog through structured JSON output:

1. **Log Collection**: Container stdout/stderr → DataDog Agent → DataDog Logs
2. **APM Traces**: Distributed tracing across services (when enabled)
3. **Dashboards**: Custom dashboards for:
   - Error rates by service
   - Request latency percentiles
   - Conversation success rates
   - LLM cost tracking

### Conversation Stats Persistence

Per-conversation metrics are persisted for billing and analytics:

```python
# Location: openhands/server/services/conversation_stats.py
ConversationStats:
  - service_to_metrics: Dict[str, Metrics]
  - accumulated_cost: float
  - token_usage: TokenUsage
  
# Stored at: {file_store}/conversation_stats/{conversation_id}.pkl
```
