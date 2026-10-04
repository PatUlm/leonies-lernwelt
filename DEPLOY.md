# Deployment – clock.nieda.de

Runbook für das Ausrollen auf **netcup1**. Für die Entwicklung reicht `npm run dev`
(siehe README). Das Muster entspricht dem Tiefenlicht-Deployment.

## Zielumgebung

| Was | Wert |
|-----|------|
| Domain | `clock.nieda.de` (öffentlich) – wird später umbenannt |
| Server | `netcup1` (SSH-Host aus `~/.ssh/config`) |
| Laufzeit | Docker-Container `clock_web` (nginx-unprivileged, Port 8080, statische Seite) |
| Reverse-Proxy | Traefik im Docker-Netz `proxy-manager`, TLS via Certresolver `production` |
| Verwaltung | Terraform (`terraform/main.tf`), State im S3-Bucket (`terraform/backend.hcl`) |

## Mechanik

Es gibt **keine Container-Registry**. `bin/release.sh` baut das Image mit
`DOCKER_HOST=ssh://netcup1` direkt auf dem Server (nur der per `.dockerignore`
gefilterte Build-Kontext geht über SSH; `DOCKER_BUILDKIT=0`, weil buildx über `ssh://`
eine SSH-Verbindungsflut auslöst). Der Build führt `npm test` aus und bricht bei roten
Tests ab. Danach steht der neue Tag in `terraform/image.auto.tfvars`.

`bin/tunnel.sh` öffnet einen SSH-Tunnel auf den Docker-Socket des Servers und lässt
`terraform plan`/`apply` dagegen laufen. Jedes Release hat einen eindeutigen Tag
(Default `YYYYMMDD-HHMMSS`, ein vorhandener Tag wird nie überschrieben); das vorherige
Image bleibt für einen Rollback auf dem Server.

Deployt wird der **Arbeitsstand**, nicht ein Git-Tag – also vorher committen.

## Voraussetzungen (einmalig)

```bash
DOCKER_HOST=ssh://netcup1 docker version   # zeigt Client UND Server
cp terraform/backend.hcl.example terraform/backend.hcl   # ausfüllen (gitignored)
task init
```

Außerdem: AWS-Credentials für das S3-Backend, `terraform`, `task`.

## Ablauf

```bash
npm test && npm run typecheck
git add -A && git commit
task release      # Image auf netcup1 bauen, schreibt terraform/image.auto.tfvars
task plan         # erwartet: Container mit neuem Image ersetzen
task deploy       # anwenden (nicht-interaktiv: task deploy -- -auto-approve)
```

Prüfen:

```bash
curl -s https://clock.nieda.de/healthz   # {"ok":true,"version":"<Tag>"}
```

Beim ersten Deploy eines Hostnamens liefert Traefik einige Sekunden ein
Standardzertifikat, bis Let's Encrypt ausgestellt hat.

## Rollback

```bash
DOCKER_HOST=ssh://netcup1 docker image ls clock
echo 'image = "clock:<alter-tag>"' > terraform/image.auto.tfvars
task deploy
```

## Hostname oder Projektname ändern

`locals` in `terraform/main.tf` (`project`, `hostname`), `REPO` in `bin/release.sh` und
`key` in `terraform/backend.hcl`. Ein neuer `project`-Name legt einen neuen Container
an; den alten vorher mit `task plan` prüfen. Ein neuer State-Key braucht
`terraform init -migrate-state`.

## Hinweis zu Spielständen

Der Lernfortschritt liegt im Browser (`localStorage`) und ist an die Domain gebunden.
Ein Domainwechsel startet auf dem Tablet bei null.
