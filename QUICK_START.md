# Quick Start Guide - Docker Deployment

## 📋 Prerequisites
- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- 4GB+ RAM available
- 2GB+ free disk space

## 🚀 Quick Start (5 minutes)

### Step 1: Setup Environment
```bash
# Copy environment template
cp .env.example .env

# On Windows:
copy .env.example .env
```

### Step 2: Build Images
```bash
docker-compose build
```

### Step 3: Start Services
```bash
docker-compose up -d
```

### Step 4: Verify Services
```bash
docker-compose ps
```

All services should show "Up" status.

## 🌐 Access Services

| Service | URL | Port |
|---------|-----|------|
| **Frontend (Vite React)** | http://localhost:8080 | 8080 |
| **Next.js Web** | http://localhost:3000 | 3000 |
| **Nginx Proxy** | http://localhost | 80 |
| **Flask Backend** | http://localhost:5000 | 5000 |
| **Express API** | http://localhost:3001 | 3001 |
| **Redis** | localhost | 6379 |

## 📊 View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f api
docker-compose logs -f web
```

## ⚙️ Common Commands

| Command | Description |
|---------|-------------|
| `docker-compose up -d` | Start all services in background |
| `docker-compose down` | Stop and remove containers |
| `docker-compose restart` | Restart all services |
| `docker-compose restart backend` | Restart specific service |
| `docker-compose ps` | Show running services |
| `docker-compose logs -f` | Follow logs in real-time |
| `docker-compose build` | Build/rebuild images |
| `docker system prune` | Clean up unused images/volumes |

## 🔧 Troubleshooting

### Port Already in Use
```bash
# Windows: Find process using port
netstat -ano | findstr :5000

# Linux/Mac: Find process using port
lsof -i :5000

# Change port in docker-compose.yml and rebuild
docker-compose build
docker-compose up -d
```

### Services Not Starting
```bash
# Check logs
docker-compose logs backend

# Check if Docker daemon is running
docker ps
```

### Out of Memory
```bash
# Check Docker resource usage
docker stats

# Limit service memory (edit docker-compose.yml)
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
```

## 📁 Project Structure

```
stock-market/
├── Dockerfile.backend      # Flask backend image
├── Dockerfile.api          # Express API image
├── Dockerfile.web          # Next.js frontend image
├── Dockerfile.client       # Vite React client image
├── docker-compose.yml      # Docker Compose configuration
├── nginx.conf              # Nginx reverse proxy config
├── .env.example            # Environment variables template
├── app.py                  # Flask app
├── backend/                # Backend code
├── api/                    # Express API code
├── web/                    # Next.js frontend
├── client/                 # Vite React client
└── DOCKER_DEPLOYMENT.md    # Detailed documentation
```

## 🚨 Important Files

- **docker-compose.yml** - Main configuration file
- **nginx.conf** - API routing and proxy rules
- **.env** - Environment variables (create from .env.example)
- **Dockerfile.* ** - Container definitions for each service

## 📝 Environment Variables

Key variables in `.env`:
```
FLASK_ENV=production
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://localhost/api
REDIS_HOST=redis
```

## 🔐 Production Tips

1. **Use HTTPS**: Update nginx.conf with SSL certificates
2. **Set strong passwords**: For any database connections
3. **Limit resources**: Set memory/CPU limits in docker-compose.yml
4. **Use health checks**: Already configured in Dockerfiles
5. **Monitor logs**: Use centralized logging solution
6. **Backup data**: Regular backups of cache and data

## 📞 Help & Support

For detailed information, see: `DOCKER_DEPLOYMENT.md`

Key sections:
- Architecture overview
- Service details
- Performance tuning
- Troubleshooting
- Production deployment
- Monitoring and maintenance

## 🔄 Workflow Examples

### Development Changes
```bash
# After code changes
docker-compose build backend
docker-compose up -d backend
docker-compose logs -f backend
```

### Full Reset
```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Scale Services (with load balancer)
```bash
docker-compose up -d --scale backend=3
```

---

**Ready to deploy?** Run `deploy.sh` (Linux/Mac) or `deploy.bat` (Windows) for an interactive deployment menu!
