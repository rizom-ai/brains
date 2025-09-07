# Health Checks Implementation Plan

## Overview

Health checks provide runtime monitoring of service availability and performance. They enable early problem detection, automatic recovery, and improved observability for production deployments.

## Why Health Checks Matter

1. **Production Readiness**: Know when services are failing before users report issues
2. **Auto-Recovery**: Container orchestrators can restart unhealthy services
3. **Load Balancing**: Remove unhealthy instances from rotation
4. **Monitoring**: Track service health metrics over time
5. **Debugging**: Quickly identify which component is causing issues

## Current State

### What Exists

- **MCP HTTP Server**: Has `/health` and `/status` endpoints
- **Daemon Registry**: Health check system for daemon processes
- **Interface Plugins**: Can implement `healthCheck()` methods

### What's Missing

Core services lack health check methods:
- EntityService (database operations)
- JobQueueService (background processing)
- ConversationService (message history)
- AIService (API connectivity)
- EmbeddingService (vector generation)
- ContentService (template generation)

## Design Principles

### 1. Lightweight Checks
- Health checks should be fast (<100ms)
- Avoid expensive operations in basic health checks
- Cache results when appropriate

### 2. Graceful Degradation
- Services can be partially healthy
- Distinguish between critical and non-critical failures
- Allow system to operate with degraded components

### 3. Standardized Response
```typescript
interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  message?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}
```

### 4. Hierarchical Aggregation
- Each service reports its own health
- Shell aggregates service health
- App provides overall system health

## Implementation Plan

### Phase 1: Service-Level Health Checks

#### EntityService
```typescript
class EntityService {
  async getHealth(): Promise<HealthStatus> {
    try {
      // Check database connection
      await this.db.select().from(entities).limit(1);
      
      // Check disk space for file storage
      const stats = await fs.statfs(this.dataDir);
      const freePercent = (stats.available / stats.size) * 100;
      
      if (freePercent < 10) {
        return {
          status: "degraded",
          message: "Low disk space",
          details: { freePercent },
          timestamp: new Date().toISOString()
        };
      }
      
      return {
        status: "healthy",
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}
```

#### JobQueueService
```typescript
class JobQueueService {
  async getHealth(): Promise<HealthStatus> {
    try {
      // Check database
      const jobCount = await this.getJobCount();
      
      // Check worker status
      const workers = this.getActiveWorkers();
      
      // Check for stalled jobs
      const stalledJobs = await this.getStalledJobs();
      
      if (stalledJobs > 10) {
        return {
          status: "degraded",
          message: "High number of stalled jobs",
          details: { stalledJobs, workers: workers.length },
          timestamp: new Date().toISOString()
        };
      }
      
      return {
        status: "healthy",
        details: { 
          pendingJobs: jobCount,
          activeWorkers: workers.length 
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}
```

#### AIService
```typescript
class AIService {
  private lastCheckTime = 0;
  private cachedStatus: HealthStatus | null = null;
  private readonly CACHE_DURATION = 60000; // 1 minute

  async getHealth(): Promise<HealthStatus> {
    // Cache expensive API checks
    const now = Date.now();
    if (this.cachedStatus && (now - this.lastCheckTime) < this.CACHE_DURATION) {
      return this.cachedStatus;
    }

    try {
      // Quick API key validation
      if (!this.apiKey) {
        return {
          status: "unhealthy",
          message: "API key not configured",
          timestamp: new Date().toISOString()
        };
      }
      
      // Optional: Test API with minimal request
      // const response = await this.client.models.list();
      
      this.cachedStatus = {
        status: "healthy",
        details: { provider: "anthropic" },
        timestamp: new Date().toISOString()
      };
      this.lastCheckTime = now;
      
      return this.cachedStatus;
    } catch (error) {
      this.cachedStatus = {
        status: "unhealthy",
        message: error.message,
        timestamp: new Date().toISOString()
      };
      this.lastCheckTime = now;
      return this.cachedStatus;
    }
  }
}
```

### Phase 2: Shell Aggregation

```typescript
class Shell {
  async getHealth(): Promise<SystemHealth> {
    const services = {
      entity: await this.entityService.getHealth(),
      jobQueue: await this.jobQueueService.getHealth(),
      ai: await this.aiService.getHealth(),
      embedding: await this.embeddingService.getHealth(),
      conversation: await this.conversationService.getHealth(),
      content: await this.contentService.getHealth(),
    };
    
    // Determine overall status
    const statuses = Object.values(services).map(s => s.status);
    let overall: "healthy" | "degraded" | "unhealthy";
    
    if (statuses.every(s => s === "healthy")) {
      overall = "healthy";
    } else if (statuses.some(s => s === "unhealthy")) {
      overall = "unhealthy";
    } else {
      overall = "degraded";
    }
    
    return {
      status: overall,
      services,
      timestamp: new Date().toISOString(),
      version: this.version,
      uptime: process.uptime()
    };
  }
}
```

### Phase 3: HTTP Endpoints

#### Unified Health Endpoint
```typescript
// GET /health
{
  "status": "degraded",
  "services": {
    "entity": { "status": "healthy" },
    "jobQueue": { 
      "status": "degraded", 
      "message": "High number of stalled jobs",
      "details": { "stalledJobs": 15 }
    },
    "ai": { "status": "healthy" },
    "embedding": { "status": "healthy" },
    "conversation": { "status": "healthy" },
    "content": { "status": "healthy" }
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0",
  "uptime": 3600
}
```

#### Liveness Probe
```typescript
// GET /health/live
// Simple check - is the process running?
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Readiness Probe
```typescript
// GET /health/ready
// Can the service handle requests?
{
  "ready": true,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Health Check Levels

### Healthy
- All checks passing
- System fully operational
- No degradation in performance

### Degraded
- Some non-critical checks failing
- System operational but with reduced capacity
- Examples:
  - Low disk space warning
  - High job queue backlog
  - Slow response times

### Unhealthy
- Critical checks failing
- System cannot serve requests properly
- Examples:
  - Database connection failed
  - Required API keys missing
  - Out of disk space

## Integration Points

### Docker
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3333/health/live || exit 1
```

### Docker Compose
```yaml
services:
  brain:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3333/health/live"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 40s
```

### Kubernetes
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3333
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3333
  initialDelaySeconds: 5
  periodSeconds: 5
```

## Monitoring Integration

### Prometheus Metrics
```typescript
// GET /metrics
# HELP brain_health_status Current health status (1=healthy, 0.5=degraded, 0=unhealthy)
# TYPE brain_health_status gauge
brain_health_status 1

# HELP brain_service_health Health status per service
# TYPE brain_service_health gauge
brain_service_health{service="entity"} 1
brain_service_health{service="jobQueue"} 0.5
brain_service_health{service="ai"} 1
```

### Grafana Dashboard
- Overall system health gauge
- Per-service health status
- Historical health trends
- Alert thresholds

## Testing Strategy

### Unit Tests
```typescript
describe("EntityService Health Check", () => {
  it("should return healthy when database is accessible", async () => {
    const service = new EntityService(mockDb);
    const health = await service.getHealth();
    expect(health.status).toBe("healthy");
  });
  
  it("should return unhealthy when database fails", async () => {
    mockDb.select.mockRejectedValue(new Error("Connection failed"));
    const health = await service.getHealth();
    expect(health.status).toBe("unhealthy");
  });
  
  it("should return degraded on low disk space", async () => {
    mockFs.statfs.mockResolvedValue({ 
      available: 1000, 
      size: 100000 
    });
    const health = await service.getHealth();
    expect(health.status).toBe("degraded");
  });
});
```

### Integration Tests
```typescript
describe("System Health Check", () => {
  it("should aggregate service health correctly", async () => {
    const response = await request(app).get("/health");
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status");
    expect(response.body).toHaveProperty("services");
    expect(response.body.services).toHaveProperty("entity");
  });
});
```

### Load Testing
- Verify health checks remain fast under load
- Ensure health checks don't impact normal operations
- Test caching behavior

## Implementation Timeline

### Week 1: Core Services
- [ ] Implement EntityService.getHealth()
- [ ] Implement JobQueueService.getHealth()
- [ ] Implement ConversationService.getHealth()
- [ ] Add unit tests

### Week 2: AI & Content Services
- [ ] Implement AIService.getHealth()
- [ ] Implement EmbeddingService.getHealth()
- [ ] Implement ContentService.getHealth()
- [ ] Add caching for expensive checks

### Week 3: Aggregation & Endpoints
- [ ] Implement Shell.getHealth() aggregation
- [ ] Add HTTP endpoints (/health, /health/live, /health/ready)
- [ ] Add Prometheus metrics endpoint
- [ ] Integration tests

### Week 4: Documentation & Deployment
- [ ] Update Docker configurations
- [ ] Create Kubernetes manifests
- [ ] Document monitoring setup
- [ ] Create Grafana dashboard template

## Success Criteria

1. All services expose health check methods
2. Unified /health endpoint aggregates all service health
3. Docker and Kubernetes health probes configured
4. Response time < 100ms for basic health checks
5. Monitoring dashboard shows real-time health status
6. Alerts trigger on service degradation

## Future Enhancements

- **Custom Health Checks**: Plugins can register their own health checks
- **Performance Metrics**: Include response time percentiles
- **Dependency Mapping**: Show which services depend on others
- **Auto-Recovery Actions**: Trigger self-healing operations
- **Historical Analysis**: Track health patterns over time