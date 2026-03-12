# IroBot — Makefile
# Commandes de développement et d'opérations

COMPOSE         = docker compose
COMPOSE_PROD    = docker compose -f docker-compose.yml -f docker-compose.prod.yml
BACKUP_DIR      = ./backups
TIMESTAMP       = $(shell date +%Y%m%d_%H%M%S)

# Colors
GREEN  = \033[0;32m
YELLOW = \033[0;33m
RED    = \033[0;31m
NC     = \033[0m

.DEFAULT_GOAL := help

.PHONY: help up down restart build rebuild ps logs \
        logs-api logs-worker logs-beat logs-frontend logs-nginx \
        infra infra-down \
        db-init db-migrate db-revision db-downgrade db-history db-shell \
        minio-init \
        init seed \
        backup-db restore-db backup-minio backup-all backup-list \
        redis-cli redis-flush \
        health status \
        clean prune \
        prod-up prod-build prod-deploy

# ─── Help ──────────────────────────────────────────────────────────────────────

help: ## Afficher cette aide
	@echo ""
	@echo "  $(GREEN)IroBot$(NC) — Commandes disponibles"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

# ─── Docker Compose Lifecycle ──────────────────────────────────────────────────

up: ## Démarrer tous les services
	@$(COMPOSE) up -d
	@echo "$(GREEN)✓ Services démarrés$(NC)"

down: ## Arrêter tous les services
	@$(COMPOSE) down
	@echo "$(YELLOW)✓ Services arrêtés$(NC)"

restart: ## Redémarrer tous les services
	@$(COMPOSE) restart
	@echo "$(GREEN)✓ Services redémarrés$(NC)"

build: ## Construire les images
	@$(COMPOSE) build
	@echo "$(GREEN)✓ Build terminé$(NC)"

rebuild: ## Reconstruire sans cache
	@$(COMPOSE) build --no-cache
	@echo "$(GREEN)✓ Rebuild terminé$(NC)"

ps: ## État des services
	@$(COMPOSE) ps

logs: ## Suivre les logs de tous les services
	@$(COMPOSE) logs -f

logs-api: ## Suivre les logs du backend
	@$(COMPOSE) logs -f api

logs-worker: ## Suivre les logs du worker Celery
	@$(COMPOSE) logs -f worker

logs-beat: ## Suivre les logs de Celery Beat
	@$(COMPOSE) logs -f beat

logs-frontend: ## Suivre les logs du frontend
	@$(COMPOSE) logs -f frontend

logs-nginx: ## Suivre les logs de nginx
	@$(COMPOSE) logs -f nginx

# ─── Infrastructure ───────────────────────────────────────────────────────────

infra: ## Démarrer uniquement MinIO, PostgreSQL, Redis
	@$(COMPOSE) up -d minio postgres redis
	@echo "$(GREEN)✓ Infrastructure démarrée$(NC)"

infra-down: ## Arrêter les services d'infrastructure
	@$(COMPOSE) stop minio postgres redis
	@echo "$(YELLOW)✓ Infrastructure arrêtée$(NC)"

# ─── Database ──────────────────────────────────────────────────────────────────

db-init: ## Initialiser la base (extensions + admin + config)
	@POSTGRES_HOST=localhost uv run --with psycopg2-binary scripts/init_db.py
	@echo "$(GREEN)✓ Base de données initialisée$(NC)"

db-migrate: ## Appliquer les migrations Alembic
	@$(COMPOSE) exec api uv run alembic upgrade head
	@echo "$(GREEN)✓ Migrations appliquées$(NC)"

db-revision: ## Créer une migration (MSG="description")
	@$(COMPOSE) exec api uv run alembic revision --autogenerate -m "$(MSG)"
	@echo "$(GREEN)✓ Migration créée$(NC)"

db-downgrade: ## Revenir d'une migration
	@$(COMPOSE) exec api uv run alembic downgrade -1
	@echo "$(YELLOW)✓ Downgrade effectué$(NC)"

db-history: ## Afficher l'historique des migrations
	@$(COMPOSE) exec api uv run alembic history

db-shell: ## Ouvrir un shell PostgreSQL
	@$(COMPOSE) exec postgres psql -U raguser -d ragdb

# ─── MinIO ─────────────────────────────────────────────────────────────────────

minio-init: ## Créer les buckets MinIO
	@MINIO_ENDPOINT=localhost:9000 uv run --with minio scripts/init_minio.py
	@echo "$(GREEN)✓ MinIO initialisé$(NC)"

# ─── Seeds & Init ─────────────────────────────────────────────────────────────

init: infra ## Initialisation complète (infra → DB → MinIO → services)
	@echo "$(YELLOW)⏳ Attente des health checks...$(NC)"
	@sleep 10
	@$(MAKE) db-init
	@$(MAKE) minio-init
	@$(MAKE) up
	@echo "$(GREEN)✓ Initialisation complète$(NC)"

seed: db-init minio-init ## Relancer les scripts de seed

# ─── Backup & Restore ─────────────────────────────────────────────────────────

$(BACKUP_DIR):
	@mkdir -p $(BACKUP_DIR)

backup-db: $(BACKUP_DIR) ## Sauvegarder PostgreSQL
	@$(COMPOSE) exec -T postgres pg_dump -U raguser ragdb | gzip > $(BACKUP_DIR)/db_$(TIMESTAMP).sql.gz
	@echo "$(GREEN)✓ Sauvegarde DB : $(BACKUP_DIR)/db_$(TIMESTAMP).sql.gz$(NC)"

restore-db: ## Restaurer PostgreSQL (FILE=chemin)
	@if [ -z "$(FILE)" ]; then \
		echo "$(RED)✗ Spécifier FILE=chemin_vers_backup.sql.gz$(NC)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)⚠ Restauration depuis $(FILE)...$(NC)"
	@gunzip -c $(FILE) | $(COMPOSE) exec -T postgres psql -U raguser -d ragdb
	@echo "$(GREEN)✓ Restauration terminée$(NC)"

backup-minio: $(BACKUP_DIR) ## Sauvegarder les données MinIO
	@docker run --rm -v irobot_minio_data:/data -v $(PWD)/$(BACKUP_DIR):/backup alpine \
		tar czf /backup/minio_$(TIMESTAMP).tar.gz /data
	@echo "$(GREEN)✓ Sauvegarde MinIO : $(BACKUP_DIR)/minio_$(TIMESTAMP).tar.gz$(NC)"

backup-all: backup-db backup-minio ## Sauvegarder tout (DB + MinIO)
	@echo "$(GREEN)✓ Toutes les sauvegardes terminées$(NC)"

backup-list: ## Lister les sauvegardes disponibles
	@echo "$(YELLOW)Sauvegardes disponibles :$(NC)"
	@ls -lh $(BACKUP_DIR)/ 2>/dev/null || echo "  Aucune sauvegarde trouvée."

# ─── Redis ─────────────────────────────────────────────────────────────────────

redis-cli: ## Ouvrir un shell Redis
	@$(COMPOSE) exec redis redis-cli

redis-flush: ## Vider le cache Redis
	@echo "$(RED)⚠ Ceci va vider tout le cache Redis.$(NC)"
	@read -p "Continuer ? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@$(COMPOSE) exec redis redis-cli FLUSHALL
	@echo "$(YELLOW)✓ Cache Redis vidé$(NC)"

# ─── Health & Status ───────────────────────────────────────────────────────────

health: ## Vérifier la santé de l'API
	@curl -sf http://localhost/api/v1/health | python3 -m json.tool && \
		echo "$(GREEN)✓ API en bonne santé$(NC)" || \
		echo "$(RED)✗ API non disponible$(NC)"

status: ## Afficher l'état complet
	@echo "$(YELLOW)═══ Services Docker ═══$(NC)"
	@$(COMPOSE) ps
	@echo ""
	@echo "$(YELLOW)═══ Santé API ═══$(NC)"
	@curl -sf http://localhost/api/v1/health | python3 -m json.tool 2>/dev/null || \
		echo "$(RED)API non disponible$(NC)"

# ─── Cleanup ───────────────────────────────────────────────────────────────────

clean: ## Arrêter et supprimer les volumes
	@echo "$(RED)⚠ Ceci va supprimer TOUTES les données (DB, MinIO, Redis).$(NC)"
	@read -p "Continuer ? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@$(COMPOSE) down -v
	@echo "$(YELLOW)✓ Services arrêtés et volumes supprimés$(NC)"

prune: ## Nettoyer les ressources Docker inutilisées
	@docker system prune -f
	@echo "$(GREEN)✓ Nettoyage terminé$(NC)"

# ─── Production ────────────────────────────────────────────────────────────────

prod-build: ## Construire les images de production
	@$(COMPOSE_PROD) build
	@echo "$(GREEN)✓ Build production terminé$(NC)"

prod-up: ## Démarrer en mode production
	@$(COMPOSE_PROD) up -d
	@echo "$(GREEN)✓ Production démarrée$(NC)"

prod-deploy: ## Déploiement complet en production
	@echo "$(YELLOW)═══ Déploiement production ═══$(NC)"
	@$(COMPOSE_PROD) build
	@$(COMPOSE_PROD) run --rm api uv run alembic upgrade head
	@$(COMPOSE_PROD) up -d
	@echo "$(GREEN)✓ Déploiement terminé$(NC)"
	@$(MAKE) health
