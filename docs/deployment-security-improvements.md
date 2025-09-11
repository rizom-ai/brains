# Deployment Security Improvements Plan

## Current State

Currently, the Hetzner deployment uses root for all operations:
- SSH access as root
- Docker containers managed by root
- No dedicated deploy user (creation was failing)

## Security Issues

1. **Violates Principle of Least Privilege**
   - Everything runs with maximum permissions
   - No separation of concerns

2. **Increased Attack Surface**
   - Compromised app = root access to server
   - No defense in depth

3. **Poor Auditability**
   - All actions appear as root
   - Hard to track deployment vs maintenance tasks

## Proposed Solution

### Phase 1: Deploy User Setup
Create a dedicated deploy user during server provisioning:

```bash
# Create deploy user with home directory
useradd -m -s /bin/bash deploy

# Add to docker group (to manage containers without sudo)
usermod -aG docker deploy

# Set up SSH key authentication
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Limited sudo access (only what's needed)
cat > /etc/sudoers.d/deploy << EOF
deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart docker
deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop docker
deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl start docker
deploy ALL=(ALL) NOPASSWD: /usr/bin/apt-get update
deploy ALL=(ALL) NOPASSWD: /usr/bin/apt-get upgrade docker*
EOF
```

### Phase 2: Docker User Mapping
Run containers as non-root user:

```dockerfile
# In Dockerfile
RUN useradd -m -u 1001 appuser
USER appuser

# When running container
docker run --user 1001:1001 ...
```

### Phase 3: Directory Permissions
Set proper ownership:

```bash
# App directories owned by deploy
chown -R deploy:deploy /app/personal-brain

# Data directories with specific permissions
chown -R 1001:1001 /app/personal-brain/data
chmod 750 /app/personal-brain/data
```

## Implementation Steps

1. **Update Terraform provisioning**
   - Add user creation to cloud-init script
   - Ensure SSH keys are properly copied

2. **Modify deployment scripts**
   - Switch from root to deploy user
   - Update SSH commands
   - Handle sudo where necessary

3. **Update Dockerfile**
   - Add non-root user
   - Set proper file permissions
   - Use USER directive

4. **Test deployment flow**
   - Verify SSH access works
   - Ensure Docker commands work
   - Test app functionality

## Migration Path

For existing deployments:

1. SSH as root one final time
2. Run user creation script
3. Test deploy user access
4. Update local deployment config
5. Future deployments use deploy user

## Benefits

- **Security**: Reduced attack surface
- **Compliance**: Follows security best practices
- **Debugging**: Easier to track issues
- **Professional**: Production-ready setup

## Estimated Effort

- Initial implementation: 2-3 hours
- Testing: 1-2 hours
- Documentation updates: 1 hour
- Total: ~6 hours

## Priority

**Medium** - Current Docker isolation provides some security, but this should be done before:
- Handling sensitive user data
- Multi-tenant deployments
- Production release

## Notes

- Keep root access for emergency recovery
- Document the security model clearly
- Consider adding fail2ban for additional protection
- Maybe add UFW firewall rules for defense in depth