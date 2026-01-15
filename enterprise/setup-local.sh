#!/bin/bash

# OpenHands Enterprise Local Development Setup Script
# This script helps set up the local development environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTERPRISE_DIR="$SCRIPT_DIR"
OPENHANDS_DIR="$(dirname "$ENTERPRISE_DIR")"

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     OpenHands Enterprise Local Development Setup          ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a Docker container is running
container_running() {
    docker ps --format '{{.Names}}' | grep -q "^$1$"
}

# Function to wait for a service
wait_for_service() {
    local host=$1
    local port=$2
    local name=$3
    local max_attempts=30
    local attempt=1
    
    echo -ne "  Waiting for $name to be ready..."
    while ! nc -z "$host" "$port" 2>/dev/null; do
        if [ $attempt -ge $max_attempts ]; then
            echo -e " ${RED}FAILED${NC}"
            echo -e "  ${RED}$name did not become ready in time${NC}"
            return 1
        fi
        sleep 2
        attempt=$((attempt + 1))
        echo -ne "."
    done
    echo -e " ${GREEN}READY${NC}"
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command_exists docker; then
    echo -e "  ${RED}✗ Docker is not installed${NC}"
    echo "  Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi
echo -e "  ${GREEN}✓ Docker${NC}"

if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
    echo -e "  ${RED}✗ Docker Compose is not installed${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓ Docker Compose${NC}"

if ! command_exists poetry; then
    echo -e "  ${RED}✗ Poetry is not installed${NC}"
    echo "  Install with: curl -sSL https://install.python-poetry.org | python3 -"
    exit 1
fi
echo -e "  ${GREEN}✓ Poetry${NC}"

echo ""

# Parse arguments
MINIMAL=false
FULL=false
START_ONLY=false
STOP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --minimal)
            MINIMAL=true
            shift
            ;;
        --full)
            FULL=true
            shift
            ;;
        --start)
            START_ONLY=true
            shift
            ;;
        --stop)
            STOP=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --minimal    Start only PostgreSQL and Redis (no Keycloak/LiteLLM)"
            echo "  --full       Start all services including Keycloak and LiteLLM"
            echo "  --start      Only start services, skip installation"
            echo "  --stop       Stop all services"
            echo "  --help       Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Stop services
if [ "$STOP" = true ]; then
    echo -e "${YELLOW}Stopping services...${NC}"
    cd "$ENTERPRISE_DIR"
    if [ -f docker-compose.local.yml ]; then
        docker compose -f docker-compose.local.yml down 2>/dev/null || true
    fi
    docker rm -f openhands-postgres openhands-redis openhands-keycloak openhands-litellm 2>/dev/null || true
    echo -e "${GREEN}Services stopped${NC}"
    exit 0
fi

# Determine mode
if [ "$MINIMAL" = false ] && [ "$FULL" = false ]; then
    echo -e "${YELLOW}Select setup mode:${NC}"
    echo "  1) Minimal (PostgreSQL + Redis only)"
    echo "  2) Full (PostgreSQL + Redis + Keycloak + LiteLLM)"
    read -p "Enter choice [1]: " choice
    choice=${choice:-1}
    
    if [ "$choice" = "1" ]; then
        MINIMAL=true
    else
        FULL=true
    fi
fi

echo ""

# Start services
if [ "$MINIMAL" = true ]; then
    echo -e "${YELLOW}Starting minimal services (PostgreSQL + Redis)...${NC}"
    
    # PostgreSQL
    if ! container_running openhands-postgres; then
        echo -e "  Starting PostgreSQL..."
        docker run -d \
            --name openhands-postgres \
            -p 5432:5432 \
            -e POSTGRES_USER=postgres \
            -e POSTGRES_PASSWORD=postgres \
            -e POSTGRES_DB=openhands \
            postgres:15 >/dev/null
    else
        echo -e "  ${GREEN}PostgreSQL already running${NC}"
    fi
    
    # Redis
    if ! container_running openhands-redis; then
        echo -e "  Starting Redis..."
        docker run -d \
            --name openhands-redis \
            -p 6379:6379 \
            redis:7-alpine >/dev/null
    else
        echo -e "  ${GREEN}Redis already running${NC}"
    fi
    
    wait_for_service localhost 5432 "PostgreSQL"
    wait_for_service localhost 6379 "Redis"
    
else
    echo -e "${YELLOW}Starting full services (PostgreSQL + Redis + Keycloak + LiteLLM)...${NC}"
    cd "$ENTERPRISE_DIR"
    
    # Use docker compose
    if docker compose version >/dev/null 2>&1; then
        docker compose -f docker-compose.local.yml up -d
    else
        docker-compose -f docker-compose.local.yml up -d
    fi
    
    wait_for_service localhost 5432 "PostgreSQL"
    wait_for_service localhost 6379 "Redis"
    wait_for_service localhost 8080 "Keycloak"
    wait_for_service localhost 4000 "LiteLLM"
fi

if [ "$START_ONLY" = true ]; then
    echo ""
    echo -e "${GREEN}Services started!${NC}"
    exit 0
fi

echo ""

# Create .env file if it doesn't exist
echo -e "${YELLOW}Configuring environment...${NC}"
cd "$ENTERPRISE_DIR"

if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "  ${GREEN}Created .env file from template${NC}"
    echo -e "  ${YELLOW}Please edit .env to add your LLM API keys!${NC}"
else
    echo -e "  ${GREEN}.env file already exists${NC}"
fi

echo ""

# Install Python dependencies
echo -e "${YELLOW}Installing Python dependencies...${NC}"
cd "$ENTERPRISE_DIR"
poetry install

echo ""

# Run database migrations
echo -e "${YELLOW}Running database migrations...${NC}"
poetry run alembic upgrade head

echo ""

echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║               Setup Complete!                              ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Services running:"
echo -e "  • PostgreSQL:  ${BLUE}localhost:5432${NC}"
echo -e "  • Redis:       ${BLUE}localhost:6379${NC}"
if [ "$FULL" = true ]; then
    echo -e "  • Keycloak:    ${BLUE}http://localhost:8080${NC} (admin/admin)"
    echo -e "  • LiteLLM:     ${BLUE}http://localhost:4000${NC}"
fi
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. Edit .env and add your LLM API keys (OPENAI_API_KEY or ANTHROPIC_API_KEY)"
echo ""
if [ "$FULL" = true ]; then
    echo "2. Configure LiteLLM with your API keys:"
    echo "   docker exec -it openhands-litellm /bin/sh"
    echo "   # Then set environment variables"
    echo ""
    echo "3. (Optional) Configure Keycloak realm for OAuth"
    echo ""
fi
echo "3. Build the frontend (from repo root):"
echo "   cd .. && make build-frontend"
echo ""
echo "4. Start the backend server:"
echo "   cd enterprise"
echo "   OPENHANDS_PATH=../ make start-backend"
echo ""
echo "5. Access the application at: ${BLUE}http://localhost:3000${NC}"
echo ""
echo "To stop all services: $0 --stop"
