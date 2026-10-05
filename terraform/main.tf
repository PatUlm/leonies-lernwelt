locals {
  project       = "lernwelt"
  hostname      = "lernwelt.nieda.de"
  proxy_network = "proxy-manager"
}

# Local image tag (repo:tag), built by bin/release.sh on the netcup1 daemon.
# No registry: the image is built on the daemon that runs the container and is
# referenced directly. Written to image.auto.tfvars on every release.
variable "image" {
  type        = string
  description = "Local image tag, e.g. lernwelt:20261004-120000"
}

variable "api_image" {
  type        = string
  description = "Local image tag of the API, e.g. lernwelt-api:20261004-120000"
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

# Profiles and saved progress. Lives outside the containers, so releases and
# rollbacks keep it.
resource "docker_volume" "data" {
  name = "${local.project}_data"

  lifecycle {
    prevent_destroy = true
  }
}

resource "docker_container" "api" {
  name    = "${local.project}_api"
  image   = var.api_image
  restart = "unless-stopped"

  env = ["TZ=Europe/Berlin", "MAX_PROFILES=200"]

  volumes {
    volume_name    = docker_volume.data.name
    container_path = "/data"
  }

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
  # Same host, only /api: the longer rule wins over the web router.
  labels {
    label = "traefik.http.routers.${local.project}-api.rule"
    value = "Host(`${local.hostname}`) && PathPrefix(`/api`)"
  }
  labels {
    label = "traefik.http.routers.${local.project}-api.entrypoints"
    value = "web, websecure"
  }
  labels {
    label = "traefik.http.routers.${local.project}-api.tls"
    value = "true"
  }
  labels {
    label = "traefik.http.routers.${local.project}-api.tls.certresolver"
    value = "production"
  }
  labels {
    label = "traefik.http.services.${local.project}-api.loadbalancer.server.port"
    value = "8081"
  }

  network_mode = "bridge"
  networks_advanced {
    name = local.proxy_network
  }
}
