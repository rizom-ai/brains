# Docker deployment configuration

# Wait for server to be ready
resource "null_resource" "wait_for_server" {
  depends_on = [hcloud_server.main]

  provisioner "local-exec" {
    command = <<-EOT
      echo "Waiting for server to be ready..."
      for i in {1..30}; do
        if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@${hcloud_server.main.ipv4_address} "echo 'SSH ready'" 2>/dev/null; then
          echo "Server is ready!"
          exit 0
        fi
        echo "Waiting... (attempt $i/30)"
        sleep 10
      done
      echo "Server failed to become ready"
      exit 1
    EOT
  }
}

# Install Docker on the server
resource "null_resource" "install_docker" {
  depends_on = [null_resource.wait_for_server]

  connection {
    type     = "ssh"
    user     = "root"
    host     = hcloud_server.main.ipv4_address
    timeout  = "10m"
    private_key = file(var.ssh_private_key_path)
  }

  provisioner "remote-exec" {
    inline = [
      # Update system
      "apt-get update -qq",
      
      # Install Docker prerequisites
      "apt-get install -y -qq curl ca-certificates gnupg lsb-release",
      
      # Add Docker GPG key
      "install -m 0755 -d /etc/apt/keyrings",
      "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg",
      "chmod a+r /etc/apt/keyrings/docker.gpg",
      
      # Add Docker repository
      "echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable\" | tee /etc/apt/sources.list.d/docker.list > /dev/null",
      
      # Install Docker
      "apt-get update -qq",
      "apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin",
      
      # Start Docker
      "systemctl start docker",
      "systemctl enable docker",
      
      # Create dedicated user for the app
      "useradd -r -m -d /opt/personal-brain -s /bin/false personal-brain || true",
      
      # Create data directories with correct ownership
      "mkdir -p /opt/personal-brain/data /opt/personal-brain/brain-repo /opt/personal-brain/website /opt/personal-brain/matrix-storage",
      "chown -R personal-brain:personal-brain /opt/personal-brain",
      
      # Create docker network
      "docker network create personal-brain-net || true"
    ]
  }
}

# Pull Docker image from registry
resource "null_resource" "pull_image" {
  depends_on = [null_resource.install_docker]
  
  # This resource only runs if a registry is configured
  # Without a registry, the deployment should fail earlier
  count = var.docker_registry != "" ? 1 : 0

  # Triggers to force re-pulling the image
  triggers = {
    # Always pull on apply - this is appropriate for 'latest' tag
    always_run = timestamp()
  }

  connection {
    type        = "ssh"
    user        = "root"
    host        = hcloud_server.main.ipv4_address
    private_key = file(var.ssh_private_key_path)
    timeout     = "5m"
  }

  provisioner "remote-exec" {
    inline = [
      # Login to registry if credentials are provided
      "set -e",
      "echo 'Pulling Docker image from registry...'",
      
      # Handle different registries
      "echo 'Registry: ${var.docker_registry}'",
      "echo 'User: ${var.registry_user}'",
      "if [ '${var.docker_registry}' = 'ghcr.io' ] && [ -n '${var.registry_token}' ]; then",
      "  echo 'Logging into GitHub Container Registry...'",
      "  echo '${var.registry_token}' | docker login ghcr.io -u '${var.registry_user}' --password-stdin || exit 1",
      "elif [ '${var.docker_registry}' = 'docker.io' ] && [ -n '${var.registry_token}' ]; then",
      "  echo 'Logging into Docker Hub...'",
      "  echo '${var.registry_token}' | docker login -u '${var.registry_user}' --password-stdin || exit 1",
      "else",
      "  echo 'WARNING: No registry authentication configured'",
      "fi",
      
      # Pull the image
      "echo 'Pulling image: ${var.docker_image}'",
      "docker pull '${var.docker_image}'",
      
      # Verify image was pulled
      "echo 'Verifying image was pulled:'",
      "docker images --format '{{.Repository}}:{{.Tag}}' | grep '^${var.docker_image}$' || (echo 'ERROR: Image not found after pull'; exit 1)",
      
      # Logout from registry
      "docker logout || true"
    ]
  }
}


# Copy environment file
resource "null_resource" "copy_env" {
  depends_on = [
    null_resource.install_docker,
    null_resource.pull_image
  ]

  connection {
    type        = "ssh"
    user        = "root"
    host        = hcloud_server.main.ipv4_address
    private_key = file(var.ssh_private_key_path)
    timeout     = "2m"
  }

  provisioner "file" {
    source      = var.env_file_path
    destination = "/opt/personal-brain/.env"
  }
}

# Deploy Personal Brain container
resource "null_resource" "deploy_container" {
  depends_on = [null_resource.copy_env]

  connection {
    type        = "ssh"
    user        = "root"
    host        = hcloud_server.main.ipv4_address
    private_key = file(var.ssh_private_key_path)
    timeout     = "2m"
  }

  # Triggers to redeploy when image changes
  triggers = {
    docker_image = var.docker_image
    # Trigger redeployment when the image was pulled
    image_id = null_resource.pull_image[0].id
  }

  provisioner "remote-exec" {
    inline = [
      # Stop existing container
      "docker stop personal-brain || true",
      "docker rm personal-brain || true",
      
      # Verify image exists before trying to run it
      "echo 'Checking for Docker image: ${var.docker_image}'",
      "if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q '^${var.docker_image}$'; then echo 'ERROR: Image ${var.docker_image} not found!'; echo 'Available images:'; docker images; exit 1; fi",
      
      # Get the UID/GID of the personal-brain user on the host
      "HOST_UID=$(id -u personal-brain)",
      "HOST_GID=$(id -g personal-brain)",
      
      # Run new container with user mapping to match host user
      "echo 'Starting container with image: ${var.docker_image}'",
      "docker run -d \\",
      "  --name personal-brain \\",
      "  --restart unless-stopped \\",
      "  --network personal-brain-net \\",
      "  --user $HOST_UID:$HOST_GID \\",
      "  -p ${var.app_port}:3333 \\",
      "  -v /opt/personal-brain/data:/app/data \\",
      "  -v /opt/personal-brain/brain-repo:/app/brain-repo \\",
      "  -v /opt/personal-brain/website:/app/website \\",
      "  -v /opt/personal-brain/matrix-storage:/app/.matrix-storage \\",
      "  -v /opt/personal-brain/.env:/app/.env:ro \\",
      "  ${var.docker_image}"
    ]
  }
}

# Output the status
output "container_status" {
  value = "Docker container deployed. Access at http://${hcloud_server.main.ipv4_address}:${var.app_port}"
}