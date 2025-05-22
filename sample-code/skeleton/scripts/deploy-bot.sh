#!/bin/bash
# Script to deploy the personal brain bot

# Create project directory if it doesn't exist
mkdir -p /opt/personal-brain

# Check if repository already exists
if [ -d "/opt/personal-brain/.git" ]; then
  cd /opt/personal-brain
  git pull
else
  # First time clone
  git clone https://github.com/$GITHUB_REPOSITORY /opt/personal-brain
  cd /opt/personal-brain
fi

# Install prerequisites and Bun if not already installed
if ! command -v bun &> /dev/null; then
  echo "Installing prerequisites for Bun..."
  sudo apt-get update
  sudo apt-get install -y unzip
  
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
else
  echo "Bun is already installed"
fi

# Install dependencies
bun install

# Create .env file from environment variables
cat > .env << EOF
MATRIX_HOMESERVER_URL=${MATRIX_HOMESERVER_URL}
MATRIX_USER_ID=${MATRIX_USER_ID}
MATRIX_ACCESS_TOKEN=${MATRIX_ACCESS_TOKEN}
MATRIX_ROOM_IDS=${MATRIX_ROOM_IDS}
COMMAND_PREFIX=${COMMAND_PREFIX}
OPENAI_API_KEY=${OPENAI_API_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
WEBSITE_DOMAIN=${WEBSITE_DOMAIN}
WEBSITE_DEPLOYMENT_TYPE=${WEBSITE_DEPLOYMENT_TYPE}
BRAIN_ENV=production
EOF

# Print number of lines in .env to verify
echo "Verifying .env file was created with $(wc -l < .env) lines"

# Set up database if needed
bun run db:generate
bun run db:migrate

# Print working directory for debugging
echo "Working directory: $(pwd)"

# Directly start the application
echo "Starting personal-brain..."
bun run restart