#!/bin/bash

# Stock Market Docker Deployment Script
# This script automates common Docker deployment tasks

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check dependencies
check_dependencies() {
    print_header "Checking Dependencies"
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    print_success "Docker found: $(docker --version)"
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    print_success "Docker Compose found: $(docker-compose --version)"
}

# Build images
build_images() {
    print_header "Building Docker Images"
    docker-compose build --progress=plain
    print_success "Docker images built successfully"
}

# Start services
start_services() {
    print_header "Starting Docker Services"
    docker-compose up -d
    print_success "Docker services started"
    
    # Wait for services to be ready
    print_info "Waiting for services to be healthy..."
    sleep 5
    
    print_header "Service Status"
    docker-compose ps
}

# Stop services
stop_services() {
    print_header "Stopping Docker Services"
    docker-compose stop
    print_success "Docker services stopped"
}

# View logs
view_logs() {
    local service=$1
    if [ -z "$service" ]; then
        print_header "Showing Logs (All Services)"
        docker-compose logs -f --tail=50
    else
        print_header "Showing Logs ($service)"
        docker-compose logs -f --tail=50 "$service"
    fi
}

# Health check
health_check() {
    print_header "Health Check"
    
    local services=("backend" "api" "web" "client" "nginx" "redis")
    
    for service in "${services[@]}"; do
        if docker-compose ps "$service" | grep -q "Up"; then
            print_success "$service is running"
        else
            print_error "$service is not running"
        fi
    done
}

# Clean up
cleanup() {
    print_header "Cleaning Up"
    
    read -p "Remove containers? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose down
        print_success "Containers removed"
    fi
    
    read -p "Remove volumes? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose down -v
        print_success "Volumes removed"
    fi
}

# Rebuild
rebuild() {
    print_header "Rebuilding Services"
    docker-compose down
    docker-compose build --no-cache
    docker-compose up -d
    print_success "Services rebuilt and started"
}

# Restart
restart() {
    local service=$1
    if [ -z "$service" ]; then
        print_header "Restarting All Services"
        docker-compose restart
        print_success "All services restarted"
    else
        print_header "Restarting $service"
        docker-compose restart "$service"
        print_success "$service restarted"
    fi
}

# Setup environment
setup_env() {
    if [ ! -f ".env" ]; then
        print_info "Creating .env file from template"
        cp .env.example .env
        print_success ".env file created"
        print_warning "Please review and update .env file if needed"
    else
        print_info ".env file already exists"
    fi
}

# Show status
show_status() {
    print_header "Docker Status"
    docker-compose ps
    
    print_header "Service Endpoints"
    echo "Frontend (Vite React):    http://localhost:8080"
    echo "Next.js Web:              http://localhost:3000"
    echo "Flask Backend:            http://localhost:5000"
    echo "Express API:              http://localhost:3001"
    echo "Nginx Reverse Proxy:      http://localhost"
    echo "Redis:                    localhost:6379"
}

# Main menu
show_menu() {
    print_header "Stock Market Docker Deployment"
    echo "1) Setup environment (.env)"
    echo "2) Build Docker images"
    echo "3) Start services"
    echo "4) Stop services"
    echo "5) Restart services"
    echo "6) Rebuild (clean build and restart)"
    echo "7) View logs"
    echo "8) Health check"
    echo "9) Show status"
    echo "10) Cleanup (remove containers/volumes)"
    echo "0) Exit"
    echo
}

# Main script
if [ $# -eq 0 ]; then
    # Interactive mode
    check_dependencies
    while true; do
        show_menu
        read -p "Select option: " choice
        
        case $choice in
            1) setup_env ;;
            2) build_images ;;
            3) start_services ;;
            4) stop_services ;;
            5) restart ;;
            6) rebuild ;;
            7) view_logs ;;
            8) health_check ;;
            9) show_status ;;
            10) cleanup ;;
            0) 
                print_info "Exiting..."
                exit 0
                ;;
            *)
                print_error "Invalid option"
                ;;
        esac
        
        echo
        read -p "Press Enter to continue..."
    done
else
    # Command line mode
    check_dependencies
    case $1 in
        setup) setup_env ;;
        build) build_images ;;
        start) start_services ;;
        stop) stop_services ;;
        restart) restart "$2" ;;
        rebuild) rebuild ;;
        logs) view_logs "$2" ;;
        health) health_check ;;
        status) show_status ;;
        clean) cleanup ;;
        *)
            echo "Usage: $0 [setup|build|start|stop|restart|rebuild|logs|health|status|clean]"
            exit 1
            ;;
    esac
fi
