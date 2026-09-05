# MongoDB Connection Fix - Deployment Guide

## Issue Fixed
This update fixes the MongoDB connection issue where the application was experiencing DNS resolution failures when connecting to MongoDB Atlas in production:

```
pymongo.errors.AutoReconnect: ac-ocmw7yh-shard-00-01.oujnpkk.mongodb.net:27017:
[Errno -3] Temporary failure in name resolution
```

## Changes Made

### 1. Enhanced MongoDB Connection Configuration (`src/server.py`)
- Added comprehensive connection timeout settings:
  - `serverSelectionTimeoutMS=30000` (30 seconds for server selection)
  - `connectTimeoutMS=30000` (30 seconds for initial connection)
  - `socketTimeoutMS=30000` (30 seconds for socket operations)
- Enabled retry mechanisms:
  - `retryWrites=True`
  - `retryReads=True`
- Optimized connection pooling:
  - `maxPoolSize=50`
  - `minPoolSize=10`

### 2. Application Startup Retry Logic
- Implemented exponential backoff retry mechanism (5 attempts)
- Starts with 2-second delay, doubles with each retry
- Provides detailed logging for connection attempts
- Gracefully handles transient DNS/network issues

### 3. Docker DNS Improvements (`dockerfile`)
- Installed DNS utilities (`dnsutils`, `iputils-ping`) for diagnostics
- DNS configuration is handled at runtime via Docker daemon settings
- Use `--dns` flags when running containers to specify DNS servers

### 4. Pre-Start DNS Check (`docker-entrypoint.sh`)
- Validates MongoDB hostname resolution before application starts
- Provides early warning if DNS issues exist
- Displays DNS configuration for troubleshooting
- Uses retry logic to handle temporary DNS failures

### 5. Health Check Endpoint
- New `/health` endpoint to monitor MongoDB connectivity
- Returns HTTP 200 when healthy, 503 when degraded
- Useful for container orchestration platforms (Kubernetes, Docker Swarm, etc.)

## Deployment Instructions

### For Production Environments

#### Option 1: Using Environment Variables
Ensure your production environment has the correct `MONGODB_URI` set. For MongoDB Atlas:

```bash
export MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority"
```

#### Option 2: Docker Run with DNS Configuration
If DNS issues persist, you can specify DNS servers explicitly:

```bash
docker run -d \
  --dns 8.8.8.8 \
  --dns 8.8.4.4 \
  -e MONGODB_URI="your_mongodb_uri" \
  -p 8000:8000 \
  your-image-name
```

#### Option 3: Docker Compose
If using docker-compose, add DNS configuration:

```yaml
version: '3.8'
services:
  backend:
    build: ./backend_staging
    dns:
      - 8.8.8.8
      - 8.8.4.4
    environment:
      - MONGODB_URI=${MONGODB_URI}
    ports:
      - "8000:8000"
```

### For Azure/Cloud Deployments

If deploying to Azure Container Instances or similar:

1. Ensure the container has outbound internet access
2. Check that network security groups allow outbound DNS (port 53)
3. Verify outbound HTTPS (port 443) for MongoDB Atlas
4. Consider using Azure Private Link for MongoDB Atlas if available

### Monitoring and Troubleshooting

#### Check Application Health
```bash
curl http://your-app-url/health
```

Expected response when healthy:
```json
{
  "status": "ok",
  "mongodb": "healthy",
  "timestamp": "2025-10-23T06:30:00.000Z"
}
```

#### View Container Logs
```bash
docker logs <container-id>
```

Look for:
- `✓ Successfully resolved <mongodb-host>` - DNS is working
- `Successfully connected to MongoDB` - Connection established
- `MongoDB connection attempt X/5 failed` - Retrying connection

#### Test DNS Resolution in Container
```bash
docker exec <container-id> nslookup your-mongodb-host.mongodb.net
```

#### Common Issues and Solutions

**Issue: Still getting DNS errors**
- Solution: Add `--dns 8.8.8.8` to docker run command
- Or: Check firewall rules for outbound DNS (port 53)

**Issue: Connection timeout after DNS resolution**
- Solution: Check firewall rules for MongoDB port (27017)
- Or: Verify MongoDB Atlas IP whitelist includes your server IP

**Issue: Intermittent connection failures**
- Solution: The retry logic should handle this automatically
- Monitor `/health` endpoint for patterns

## Testing the Fix

### Local Testing
```bash
# Build the image
docker build -t musengage-backend ./backend_staging

# Run with your MongoDB URI
docker run -p 8000:8000 \
  -e MONGODB_URI="your_mongodb_uri" \
  musengage-backend

# Check health
curl http://localhost:8000/health
```

### Production Checklist
- [ ] MongoDB URI is correctly set in environment variables
- [ ] Container has outbound internet access
- [ ] DNS resolution is working (check entrypoint logs)
- [ ] `/health` endpoint returns 200 OK
- [ ] Application logs show "Successfully connected to MongoDB"
- [ ] No AutoReconnect errors in logs

## Rollback Plan

If issues persist, you can temporarily:
1. Revert to the previous deployment
2. Check MongoDB Atlas network access settings
3. Verify connection string credentials
4. Contact MongoDB Atlas support if the issue is on their end

## Additional Notes

- The application now tolerates up to 62 seconds of DNS/network issues during startup (5 retries with exponential backoff)
- Once connected, pymongo handles reconnections automatically
- The health check endpoint can be used by load balancers and monitoring systems
- All connection attempts are logged for debugging purposes
