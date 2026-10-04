locals {
  project  = "lernwelt"
  hostname = "lernwelt.nieda.de"
  # Former hostname, permanently redirected to the current one.
  legacy_hostname = "clock.nieda.de"
  proxy_network   = "proxy-manager"
}

# Local image tag (repo:tag), built by bin/release.sh on the netcup1 daemon.
# No registry: the image is built on the daemon that runs the container and is
# referenced directly. Written to image.auto.tfvars on every release.
variable "image" {
  type        = string
  description = "Local image tag, e.g. lernwelt:20261004-120000"
}

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = ">= 3.0.2"
    }
  }

  # Partial backend config: bucket/key/region come from the gitignored
  # backend.hcl (terraform init -backend-config=backend.hcl).
  backend "s3" {}
}

provider "docker" {}

resource "docker_container" "web" {
  name    = "${local.project}_web"
  image   = var.image
  restart = "unless-stopped"

  env = ["TZ=Europe/Berlin"]

  labels {
    label = "project"
    value = local.project
  }
  labels {
    label = "traefik.enable"
    value = "true"
  }
  labels {
    label = "traefik.docker.network"
    value = local.proxy_network
  }
  labels {
    label = "traefik.http.routers.${local.project}.entrypoints"
    value = "web, websecure"
  }
  labels {
    label = "traefik.http.routers.${local.project}.rule"
    value = "Host(`${local.hostname}`)"
  }
  labels {
    label = "traefik.http.services.${local.project}.loadbalancer.server.port"
    value = "8080"
  }
  labels {
    label = "traefik.http.routers.${local.project}.tls"
    value = "true"
  }
  labels {
    label = "traefik.http.routers.${local.project}.tls.certresolver"
    value = "production"
  }

  # Old bookmarks on clock.nieda.de land on the new hostname.
  labels {
    label = "traefik.http.routers.${local.project}-legacy.entrypoints"
    value = "web, websecure"
  }
  labels {
    label = "traefik.http.routers.${local.project}-legacy.rule"
    value = "Host(`${local.legacy_hostname}`)"
  }
  labels {
    label = "traefik.http.routers.${local.project}-legacy.tls"
    value = "true"
  }
  labels {
    label = "traefik.http.routers.${local.project}-legacy.tls.certresolver"
    value = "production"
  }
  labels {
    label = "traefik.http.routers.${local.project}-legacy.middlewares"
    value = "${local.project}-legacy-redirect"
  }
  labels {
    label = "traefik.http.middlewares.${local.project}-legacy-redirect.redirectregex.regex"
    value = "^https?://${replace(local.legacy_hostname, ".", "\\.")}/(.*)"
  }
  labels {
    label = "traefik.http.middlewares.${local.project}-legacy-redirect.redirectregex.replacement"
    value = "https://${local.hostname}/$${1}"
  }
  labels {
    label = "traefik.http.middlewares.${local.project}-legacy-redirect.redirectregex.permanent"
    value = "true"
  }

  network_mode = "bridge"
  networks_advanced {
    name = local.proxy_network
  }
}
