---
title: Deploy to a VPS
---

# Deploy to a VPS

The baseline production shape is intentionally conventional:

```text
Internet → HTTPS/Nginx → Bun/Elysia → PostgreSQL
                         │
                         ├─ SvelteKit build
                         └─ S3-compatible storage (when used)

systemd worker → Bunway Jobs PostgreSQL database
```

Build, migrate, and start using the scripts in the generated `package.json`. Run `bunway db:migrate
--all` during a controlled release, not concurrently from every application process.

## Nginx

```nginx
server {
  listen 443 ssl http2;
  server_name app.example.com;

  client_max_body_size 25m;
  proxy_read_timeout 3600s;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_buffering off;
  }
}
```

Define `map $http_upgrade $connection_upgrade { default upgrade; '' close; }` in the `http` block.
`proxy_buffering off` permits timely SSE delivery; upgrade headers permit WebSockets. Use Certbot or
your platform's TLS process and add an HTTP-to-HTTPS server block.

## systemd application

```ini
[Unit]
Description=Bunway application
After=network.target

[Service]
Type=simple
User=bunway
WorkingDirectory=/srv/myapp
EnvironmentFile=/srv/myapp/.env
ExecStart=/home/bunway/.bun/bin/bun run src/app.ts
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Create a second unit for the worker with the same directory/environment and
`ExecStart=/home/bunway/.bun/bin/bunway worker`. Then use:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now myapp myapp-worker
sudo systemctl status myapp myapp-worker
journalctl -u myapp -u myapp-worker -f
```

Adjust executable paths to the deployment user. Multi-process Realtime is currently in-memory: a
publisher and subscriber must share a Bun process. Use one application process for those features until
an external bridge exists. Use S3-compatible storage instead of local disk across hosts.
