export interface DeployWorkflowTemplateOptions {
  secretNames: string[];
  bootstrapSecrets: string[];
}

export interface PreDeployHookTemplateOptions {
  deployConfigPath?: string;
  brainYamlPath?: string;
}

export function renderPreDeployHook(
  options: PreDeployHookTemplateOptions = {},
): string {
  const deployConfigPath = options.deployConfigPath ?? "config/deploy.yml";
  const brainYamlPath = options.brainYamlPath ?? "brain.yaml";

  return `#!/usr/bin/env bash
set -euo pipefail

BRAIN_FILE="${brainYamlPath}"
SSH_USER="$(ruby -e 'require "yaml"; config = YAML.load_file("${deployConfigPath}") || {}; puts(config.dig("ssh", "user") || "root")')"
IFS=',' read -ra HOSTS <<< "$KAMAL_HOSTS"
for host in "\${HOSTS[@]}"; do
  scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$BRAIN_FILE" "\${SSH_USER}@\${host}:/opt/brain.yaml"
done
`;
}

export function renderExtractBrainConfigScript(): string {
  return `#!/usr/bin/env ruby
require "yaml"

config = YAML.load_file("brain.yaml") || {}
brain_model = config["brain"]
brain_domain = config["domain"]

raise "Missing brain in brain.yaml" if brain_model.nil? || brain_model.to_s.strip.empty?
raise "Missing domain in brain.yaml" if brain_domain.nil? || brain_domain.to_s.strip.empty?

brain_domain = brain_domain.to_s.strip
labels = brain_domain.split(".")
preview_domain = if labels.length >= 3
  labels.dup.tap { |parts| parts[0] = "#{parts[0]}-preview" }.join(".")
else
  "preview.#{brain_domain}"
end
www_domain = if labels.length == 2
  "www.#{brain_domain}"
else
  ""
end

github_env = ENV["GITHUB_ENV"]
raise "Missing GITHUB_ENV" if github_env.nil? || github_env.empty?

instance_name = ENV["INSTANCE_NAME"]
if instance_name.nil? || instance_name.empty?
  instance_name = File.basename(Dir.pwd)
end

registry_username = ENV["GITHUB_REPOSITORY_OWNER"]
raise "Missing GITHUB_REPOSITORY_OWNER" if registry_username.nil? || registry_username.empty?

repository = ENV["GITHUB_REPOSITORY"]
raise "Missing GITHUB_REPOSITORY" if repository.nil? || repository.empty?
repository_name = repository.split("/", 2).last
raise "Missing repository name" if repository_name.nil? || repository_name.empty?

File.open(github_env, "a") do |file|
  file.puts("INSTANCE_NAME=#{instance_name}")
  file.puts("BRAIN_MODEL=#{brain_model}")
  file.puts("BRAIN_DOMAIN=#{brain_domain}")
  file.puts("PREVIEW_DOMAIN=#{preview_domain}")
  file.puts("WWW_DOMAIN=#{www_domain}")
  file.puts("IMAGE_REPOSITORY=ghcr.io/#{registry_username}/#{repository_name}")
  file.puts("REGISTRY_USERNAME=#{registry_username}")
end
`;
}

export function renderPublishImageWorkflow(): string {
  return `name: Publish Image

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          ref: \${{ github.sha }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Extract image metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/\${{ github.repository_owner }}/\${{ github.event.repository.name }}
          tags: |
            type=raw,value=latest
            type=raw,value=\${{ github.sha }}

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Build and push image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: deploy/Dockerfile
          target: standalone
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: |
            \${{ steps.meta.outputs.labels }}
            service=brain
`;
}

export function renderDeployWorkflow(
  options: DeployWorkflowTemplateOptions,
): string {
  const { secretNames, bootstrapSecrets } = options;
  const workflowSecretsEnv = secretNames
    .map((name) => `          ${name}: \${{ secrets.${name} }}`)
    .join("\n");
  const bootstrapSecretsLiteral = JSON.stringify(bootstrapSecrets);
  return `name: Deploy

on:
  workflow_run:
    workflows: ["Publish Image"]
    branches: ["main"]
    types: [completed]
  workflow_dispatch:

jobs:
  deploy:
    if: |
      github.event_name == 'workflow_dispatch' ||
      github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          ref: \${{ github.event.workflow_run.head_sha || github.sha }}

      - name: Set up Bun
        uses: oven-sh/setup-bun@v2

      - name: Extract config from brain.yaml
        run: ./scripts/extract-brain-config.rb
        env:
          INSTANCE_NAME: \${{ github.event.repository.name }}

      - name: Validate env via varlock
        env:
${workflowSecretsEnv}
        run: bunx varlock@1.1.0 load --path .env.schema

      - name: Load env via varlock
        env:
${workflowSecretsEnv}
        run: |
          for attempt in 1 2 3; do
            if bunx varlock@1.1.0 load --path .env.schema --format json --compact > /tmp/varlock-env.json; then
              break
            fi
            if [ "$attempt" = "3" ]; then
              exit 1
            fi
            sleep 5
          done
          node <<'NODE'
          import { appendFileSync, readFileSync } from "node:fs";
          const env = JSON.parse(readFileSync('/tmp/varlock-env.json', 'utf8'));
          const githubEnvPath = process.env.GITHUB_ENV;

          if (!githubEnvPath) {
            throw new Error('Missing GITHUB_ENV');
          }

          const newline = String.fromCharCode(10);
          const carriageReturn = String.fromCharCode(13);
          const bootstrapSecrets = new Set(${bootstrapSecretsLiteral});

          function normalizeNewlines(value) {
            return String(value).split(carriageReturn + newline).join(newline);
          }

          function escapeWorkflowCommand(value) {
            return value
              .split('%').join('%25')
              .split(carriageReturn).join('%0D')
              .split(newline).join('%0A');
          }

          function envDelimiter(key, value) {
            let delimiter = key + '_EOF';
            while (value.includes(newline + delimiter + newline)) {
              delimiter = delimiter + '_X';
            }
            return delimiter;
          }

          function appendEnv(key, value) {
            const text = normalizeNewlines(value);
            if (text.length > 0) {
              console.log('::add-mask::' + escapeWorkflowCommand(text));
            }

            if (text.includes(newline)) {
              const delimiter = envDelimiter(key, text);
              appendFileSync(
                githubEnvPath,
                key + '<<' + delimiter + newline + text + newline + delimiter + newline,
              );
            } else {
              appendFileSync(githubEnvPath, key + '=' + text + newline);
            }
          }

          for (const [key, value] of Object.entries(env)) {
            if (bootstrapSecrets.has(key) || value === null || value === undefined) {
              continue;
            }
            appendEnv(key, value);
          }
          NODE

      - name: Write Kamal SSH key
        run: |
          node <<'NODE'
          import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
          const env = JSON.parse(readFileSync('/tmp/varlock-env.json', 'utf8'));
          const privateKey = env.KAMAL_SSH_PRIVATE_KEY;
          if (privateKey === null || privateKey === undefined) {
            throw new Error('Missing KAMAL_SSH_PRIVATE_KEY');
          }

          const newline = String.fromCharCode(10);
          const carriageReturn = String.fromCharCode(13);
          let privateKeyText = String(privateKey)
            .split(carriageReturn + newline)
            .join(newline)
            .split('\\n')
            .join(newline);
          if (!privateKeyText.endsWith(newline)) {
            privateKeyText += newline;
          }

          const sshDir = process.env.HOME + '/.ssh';
          mkdirSync(sshDir, { recursive: true });
          writeFileSync(sshDir + '/id_ed25519', privateKeyText, {
            encoding: 'utf8',
            mode: 0o600,
          });
          NODE

      - name: Configure SSH client
        run: |
          mkdir -p ~/.ssh
          cat > ~/.ssh/config <<'EOF'
          Host *
            IdentityFile ~/.ssh/id_ed25519
            IdentitiesOnly yes
            BatchMode yes
            ConnectTimeout 5
            StrictHostKeyChecking no
            UserKnownHostsFile /dev/null
          EOF
          chmod 600 ~/.ssh/config

      - name: Write .kamal/secrets
        run: |
          mkdir -p .kamal
          node <<'NODE'
          import { readFileSync, writeFileSync } from "node:fs";
          const deployYaml = readFileSync('config/deploy.yml', 'utf8');
          const env = JSON.parse(readFileSync('/tmp/varlock-env.json', 'utf8'));
          const secretNames = new Set([
            'KAMAL_REGISTRY_PASSWORD',
            'CERTIFICATE_PEM',
            'PRIVATE_KEY_PEM',
          ]);

          let inSecrets = false;
          for (const line of deployYaml.split(/\\r?\\n/)) {
            if (/^\\s*secret:\\s*$/.test(line)) {
              inSecrets = true;
              continue;
            }

            if (inSecrets) {
              const match = line.match(/^\\s{4}-\\s*([A-Z0-9_]+)\\s*$/);
              if (match) {
                secretNames.add(match[1]);
                continue;
              }

              if (/^\\S/.test(line)) {
                break;
              }
            }
          }

          const lines = [];
          for (const name of secretNames) {
            const value = env[name];
            if (value === null || value === undefined) {
              continue;
            }

            const text = String(value);
            const escaped = text.replace(/'/g, "\\'");
            lines.push(name + "='" + escaped + "'");
          }

          writeFileSync('.kamal/secrets', lines.join('\\n') + '\\n');
          NODE

      - name: Provision server
        id: provision
        run: bun deploy/scripts/provision-server.ts

      - name: Update Cloudflare DNS
        env:
          SERVER_IP: \${{ steps.provision.outputs.server_ip }}
        run: |
          BRAIN_DOMAIN="$BRAIN_DOMAIN" bun deploy/scripts/update-dns.ts
          if [ -n "\${WWW_DOMAIN:-}" ]; then
            BRAIN_DOMAIN="$WWW_DOMAIN" bun deploy/scripts/update-dns.ts
          fi
          BRAIN_DOMAIN="$PREVIEW_DOMAIN" bun deploy/scripts/update-dns.ts

      - name: Install Kamal
        run: |
          gem install --user-install kamal
          ruby -r rubygems -e 'puts Gem.user_dir + "/bin"' >> "$GITHUB_PATH"

      - name: Validate SSH key
        run: ssh-keygen -y -f ~/.ssh/id_ed25519 >/dev/null

      - name: Wait for SSH access
        env:
          SERVER_IP: \${{ steps.provision.outputs.server_ip }}
        run: |
          SSH_USER="$(ruby -e 'require "yaml"; config = YAML.load_file("config/deploy.yml") || {}; puts(config.dig("ssh", "user") || "root")')"
          for attempt in $(seq 1 18); do
            if ssh "$SSH_USER@$SERVER_IP" true >/dev/null 2>&1; then
              exit 0
            fi
            echo "SSH not ready yet (attempt $attempt/18); retrying in 5s..."
            sleep 5
          done
          echo "SSH never became ready for $SSH_USER@$SERVER_IP; last attempt output:" >&2
          ssh "$SSH_USER@$SERVER_IP" true >&2 || true
          exit 1

      - name: Release stale Kamal deploy lock
        env:
          SERVER_IP: \${{ steps.provision.outputs.server_ip }}
          VERSION: \${{ github.event.workflow_run.head_sha || github.sha }}
          PREVIEW_DOMAIN: \${{ env.PREVIEW_DOMAIN }}
        run: kamal lock release || true

      - name: Deploy
        env:
          SERVER_IP: \${{ steps.provision.outputs.server_ip }}
          VERSION: \${{ github.event.workflow_run.head_sha || github.sha }}
          PREVIEW_DOMAIN: \${{ env.PREVIEW_DOMAIN }}
        run: kamal setup --skip-push

      - name: Verify origin TLS
        env:
          SERVER_IP: \${{ steps.provision.outputs.server_ip }}
        run: |
          curl -I -k --max-time 20 --resolve "$BRAIN_DOMAIN:443:$SERVER_IP" "https://$BRAIN_DOMAIN"
          if [ -n "\${WWW_DOMAIN:-}" ]; then
            curl -I -k --max-time 20 --resolve "$WWW_DOMAIN:443:$SERVER_IP" "https://$WWW_DOMAIN"
          fi
          curl -I -k --max-time 20 --resolve "$PREVIEW_DOMAIN:443:$SERVER_IP" "https://$PREVIEW_DOMAIN"

      - name: Dump remote proxy diagnostics
        if: failure()
        env:
          SERVER_IP: \${{ steps.provision.outputs.server_ip }}
        run: |
          SSH_USER="$(ruby -e 'require "yaml"; config = YAML.load_file("config/deploy.yml") || {}; puts(config.dig("ssh", "user") || "root")')"
          ssh "$SSH_USER@$SERVER_IP" '
            docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
            echo "--- kamal-proxy logs ---"
            docker logs kamal-proxy --tail 200 || true
            echo "--- kamal-proxy inspect ---"
            docker inspect kamal-proxy || true
          '
`;
}
