# Deployment – lernwelt.nieda.de

Runbook für das Ausrollen auf **netcup1**. Für die Entwicklung reicht `npm run dev`
(siehe README). Das Muster entspricht dem Tiefenlicht-Deployment.

## Zielumgebung

| Was | Wert |
|-----|------|
| Domain | `lernwelt.nieda.de` (öffentlich) |
| Server | `netcup1` (SSH-Host aus `~/.ssh/config`) |
| Laufzeit | Docker-Container `lernwelt_web` (nginx-unprivileged, Port 8080, statische Seite) und `lernwelt_api` (Node, Port 8081, Pfad `/api`) |
| Daten | Docker-Volume `lernwelt_data` (Profile als JSON-Dateien, Sprachaufnahmen unter `tts/`), in Terraform mit `prevent_destroy` geschützt |
| Reverse-Proxy | Traefik im Docker-Netz `proxy-manager`, TLS via Certresolver `production` |
| Verwaltung | Terraform (`terraform/main.tf`), State im S3-Bucket (`terraform/backend.hcl`) |

## Mechanik

Es gibt **keine Container-Registry**. `bin/release.sh` baut beide Images (`lernwelt` und
`lernwelt-api`, Dockerfile-Targets `web` und `api`) mit
`DOCKER_HOST=ssh://netcup1` direkt auf dem Server (nur der per `.dockerignore`
gefilterte Build-Kontext geht über SSH; `DOCKER_BUILDKIT=0`, weil buildx über `ssh://`
eine SSH-Verbindungsflut auslöst). Der Build führt `npm test` aus und bricht bei roten
Tests ab. Danach steht der neue Tag in `terraform/image.auto.tfvars`.

`bin/tunnel.sh` öffnet einen SSH-Tunnel auf den Docker-Socket des Servers und lässt
`terraform plan`/`apply` dagegen laufen. Das vorherige Image bleibt für einen Rollback
auf dem Server.

## Versionen

Releases tragen eine Kalenderversion nach [CalVer](https://calver.org/) im Schema
`YYYY.MM.MICRO`: Jahr, Monat ohne führende Null, Zähler der Releases im Monat ab 1
(`2026.10.1`, `2026.10.2`, `2026.11.1`). `bin/release.sh` ermittelt die nächste Version
aus den Git-Tags; ein vorhandener Image-Tag wird nie überschrieben. Die Version steht im
Image-Tag und in `/healthz`.

`bin/release.sh` baut nur einen **committeten** Stand (bricht bei offenen Änderungen ab)
und merkt sich Version und Commit in `terraform/release.env`. Nach erfolgreichem
`terraform apply` setzt `task deploy` den annotierten Tag `v<Version>` auf diesen Commit
und pusht ihn (`bin/tag-release.sh`), sobald `/healthz` diese Version meldet. Ein gebautes,
aber nicht deploytes Release belegt seine Version; das nächste bekommt die folgende.

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
task deploy       # anwenden und taggen (nicht-interaktiv: task deploy -- -auto-approve)
```

Prüfen:

```bash
curl -s https://lernwelt.nieda.de/healthz   # {"ok":true,"version":"<Version>"}
```

Beim ersten Deploy eines Hostnamens liefert Traefik einige Sekunden ein
Standardzertifikat, bis Let's Encrypt ausgestellt hat.

Während des Container-Tauschs antwortet Traefik etwa zwei Sekunden mit `404`: Er leitet erst
weiter, wenn der Health-Check des neuen Containers grün ist (in der Startphase jede Sekunde).

## Sprachaufnahmen

Die englischen Wörter liegen als MP3 im Volume (`/data/tts/en/<wort>.mp3` und
`<wort>.slow.mp3`), nicht im Image. Sie werden lokal mit Gemini TTS erzeugt und vor dem
Hochladen angehört:

```bash
node scripts/render-speech.ts            # fehlende Wörter (API-Key in ~/.config/lernwelt/gemini-api-key)
node scripts/render-speech.ts red blue   # einzelne Wörter neu aufnehmen
# .data/tts/en/index.html anhören
bin/tts-upload.sh                        # ersetzt alle Aufnahmen auf dem Server in einem Schritt
```

Ein Deploy ist dafür nicht nötig; Browser holen eine geänderte Aufnahme beim nächsten
Abspielen (ETag).

## Rollback

```bash
DOCKER_HOST=ssh://netcup1 docker image ls lernwelt
echo 'image = "lernwelt:<alter-tag>"' > terraform/image.auto.tfvars
task deploy
```

Ein Rollback setzt keinen Git-Tag: `bin/tag-release.sh` taggt nur, wenn `/healthz` die
Version aus `terraform/release.env` meldet, und bricht sonst mit einem Hinweis ab.

## Hostname oder Projektname ändern

`locals` in `terraform/main.tf` (`project`, `hostname`), `REPO` in `bin/release.sh` und
`key` in `terraform/backend.hcl`. Ein neuer `project`-Name legt einen neuen Container
an; den alten vorher mit `task plan` prüfen. Ein neuer State-Key braucht
`terraform init -migrate-state`.

## Hinweis zu Spielständen

Der Lernfortschritt liegt im Browser (`localStorage`) und ist an die Domain gebunden.
Ein Domainwechsel startet auf dem Tablet bei null.

## Spielstände sichern

Die Profile liegen im Volume `lernwelt_data`. Sicherung auf den Rechner:

```bash
DOCKER_HOST=ssh://netcup1 docker run --rm -v lernwelt_data:/data alpine tar -C /data -cz . > lernwelt-data-$(date +%F).tar.gz
```

Zurückspielen: Container `lernwelt_api` stoppen, Archiv mit `tar -xz` ins Volume entpacken, Container starten.
