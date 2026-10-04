locals {
  # Hostname and project name are planned to change later (see DEPLOY.md).
  project       = "clock"
  hostname      = "clock.nieda.de"
  proxy_network = "proxy-manager"
}

# Local image tag (repo:tag), built by bin/release.sh on the netcup1 daemon.
# No registry: the image is built on the daemon that runs the container and is
# referenced directly. Written to image.auto.tfvars on every release.
variable "image" {
  type        = string
  description = "Local image tag, e.g. clock:20261004-1200"
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

  network_mode = "bridge"
  networks_advanced {
    name = local.proxy_network
  }
}
