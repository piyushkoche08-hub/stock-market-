# Stock Market Application - Docker Deployment Guide

## Overview
This document provides instructions for deploying the Stock Market application using Docker and Docker Compose.

## Project Architecture

The application consists of multiple services:
- **Backend (Flask)** - Python Flask API server
- **API (Express)** - Node.js Express API with WebSocket support
- **Web (Next.js)** - Next.js frontend application
- **Client (Vite React)** - React dashboard application
- **Nginx** - Reverse proxy and load balancer
- **Redis** - Caching service (optional)

## Prerequisites

- Docker >= 20.10
- Docker Compose >= 2.0
- Git
- 2GB+ free disk space
- 4GB+ RAM recommended

## Installation

### 1. Clone/Navigate to Project Directory
```bash
cd /path/to/stock-market
```

### 2. Create Environment File
```bash
cp .env.example .env
# Edit .env if needed
```

### 3. Build Docker Images
```bash
docker-compose build
```

### 4. Start All Services
```bash
docker-compose up -d
```

### 5. Verify Services
```bash
docker-compose ps
```

All services should show "Up" status.

## Accessing the Application

- **Frontend (Vite React)**: http://localhost:8080
- **Next.js Web**: http://localhost:3000
- **Flask Backend**: http://localhost:5000
- **Express API**: http://localhost:3001
- **Nginx Reverse Proxy**: http://localhost

## Common Docker Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f api
docker-compose logs -f web
docker-compose logs -f client
```

### Stop Services
```bash
docker-compose stop
```

### Restart Services
```bash
docker-compose restart
```

### Remove Containers (keep volumes)
```bash
docker-compose down
```

### Remove Everything (including volumes)
```bash
docker-compose down -v
```

### Rebuild Services
```bash
docker-compose build --no-cache
docker-compose up -d
```

## Service Details

### Backend (Flask)
- **Port**: 5000
- **Health Check**: `/index`
- **Dockerfile**: `Dockerfile.backend`
- **Startup Time**: ~10-15 seconds

### API (Express)
- **Port**: 3001
- **Health Check**: `/api/health`
- **Dockerfile**: `Dockerfile.api`
- **Startup Time**: ~5-10 seconds
- **Features**: WebSocket support for real-time updates

### Web (Next.js)
- **Port**: 3000
- **Health Check**: Root endpoint
- **Dockerfile**: `Dockerfile.web`
- **Startup Time**: ~10-20 seconds
- **Note**: Set `NEXT_PUBLIC_API_URL` for API endpoint

### Client (Vite React)
- **Port**: 80 (via Nginx)
- **Dockerfile**: `Dockerfile.client`
- **Startup Time**: ~5 seconds
- **Served by**: Nginx

### Redis (Cache)
- **Port**: 6379
- **Data Persistence**: Enabled
- **Health Check**: PING command

### Nginx (Reverse Proxy)
- **Port**: 80 (HTTP), 443 (HTTPS - needs config)
- **Config**: `nginx.conf`
- **Routes**:
  - `/` → Vite React client or Next.js web
  - `/stock/*` → Flask backend
  - `/api/*` → Express API
  - `/ws/*` → Express API WebSocket

## Performance Tuning

### Flask Backend
- Adjust `--workers` in `Dockerfile.backend`
- Default: 4 workers
- Recommendation: `--workers 2 * CPU_COUNT + 1`

### Memory Management
- Monitor container memory with: `docker stats`
- Adjust memory limits in `docker-compose.yml` if needed

### Redis Caching
- Enable by default in docker-compose
- Check redis connection in backend code

## Troubleshooting

### Container Won't Start
```bash
docker-compose logs service_name
```

### Port Already in Use
```bash
# Find process using port
lsof -i :5000  # or other port

# Change port in docker-compose.yml
```

### Out of Disk Space
```bash
# Clean unused images/volumes
docker system prune -a
```

### WebSocket Connection Issues
- Ensure Nginx is configured correctly
- Check `nginx.conf` for `/ws/` location block
- Verify Express API is running: `docker-compose logs api`

## Production Deployment

### For Production:

1. **Use Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env with production values
   docker-compose --env-file .env up -d
   ```

2. **Enable HTTPS**
   - Update `nginx.conf` with SSL certificates
   - Use Let's Encrypt with Certbot

3. **Set Resource Limits**
   ```yaml
   services:
     backend:
       deploy:
         resources:
           limits:
             cpus: '1'
             memory: 512M
   ```

4. **Use External Volume Storage**
   ```yaml
   volumes:
     backend_cache:
       driver: local
       driver_opts:
         type: nfs
         o: addr=<nfs-server>,vers=4,soft,timeo=180,bg,tcp,rw
         device: ":/export/backend"
   ```

5. **Implement Monitoring**
   - Add Prometheus/Grafana for metrics
   - Add ELK stack for logging
   - Use health checks properly

6. **Database Considerations**
   - Connect to external database if needed
   - Update environment variables accordingly
   - Set up proper backups

## Scaling

### Horizontal Scaling
```bash
# Scale backend service to 3 replicas
docker-compose up -d --scale backend=3

# Note: Load balancer (Nginx) must be configured for this
```

### Adding More Workers
Edit `Dockerfile.backend`:
```dockerfile
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "8", "--timeout", "60", "app:app"]
```

## Maintenance

### Update Dependencies
```bash
# Update Python dependencies
pip install --upgrade -r requirements.txt
# Rebuild Docker images
docker-compose build --no-cache

# Update Node dependencies
npm update
docker-compose build --no-cache
```

### Backup Cache Data
```bash
docker exec stock-market-redis redis-cli BGSAVE
docker cp stock-market-redis:/data/dump.rdb ./backup/
```

### View Redis Cache
```bash
docker exec -it stock-market-redis redis-cli
> KEYS *
> GET key_name
```

## Additional Resources

- [Docker Documentation](https://docs.docker.com)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Flask Deployment](https://flask.palletsprojects.com/en/2.3.x/deploying/)
- [Node.js Best Practices](https://nodejs.org/en/docs/)
- [Nginx Documentation](https://nginx.org/en/docs/)

## Support

For issues or questions:
1. Check logs: `docker-compose logs`
2. Verify services are running: `docker-compose ps`
3. Check port availability: `netstat -tuln | grep LISTEN`
4. Review docker-compose.yml configuration

---
Last Updated: 2026-05-26
