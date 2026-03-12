# IroBot — Guide de Déploiement (Production)

Guide pas-à-pas pour déployer IroBot sur un serveur de production.

---

## 1. Prérequis

### Serveur

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| CPU | 4 cœurs | 8 cœurs |
| RAM | 8 Go | 16 Go |
| Stockage | 50 Go SSD | 100 Go SSD |
| OS | Ubuntu 22.04+ / Debian 12+ | Ubuntu 24.04 LTS |

### Logiciels

- Docker Engine 24+ et Docker Compose v2 (pas Docker Desktop)
- Git
- Nom de domaine (recommandé)
- Certificat SSL (Let's Encrypt ou personnalisé)
- Clé API Mistral AI

---

## 2. Préparation du serveur

### Installer Docker Engine

```bash
# Ubuntu / Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Se reconnecter pour appliquer le groupe
```

### Créer un utilisateur dédié

```bash
sudo adduser --system --group --shell /bin/bash irobot
sudo usermod -aG docker irobot
sudo su - irobot
```

### Configurer le pare-feu

```bash
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
```

> **Important :** Ne PAS exposer les ports 5432 (Postgres), 6379 (Redis), 9000 (MinIO API) vers l'extérieur.

---

## 3. Cloner et configurer

```bash
cd /opt
sudo git clone <repo-url> irobot
sudo chown -R irobot:irobot /opt/irobot
cd /opt/irobot
```

### Créer le fichier `.env` de production

```bash
cp .env.example .env
```

Modifier `.env` avec des valeurs de production **sécurisées** :

```env
# MinIO — mots de passe forts
MINIO_ENDPOINT=minio:9000
MINIO_ROOT_USER=irobot-minio-admin
MINIO_ROOT_PASSWORD=CHANGEZ_MOI_mot_de_passe_fort_32chars
MINIO_SECURE=false

# PostgreSQL — mots de passe forts
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=ragdb
POSTGRES_USER=raguser
POSTGRES_PASSWORD=CHANGEZ_MOI_mot_de_passe_fort_32chars

# Redis
REDIS_URL=redis://:CHANGEZ_MOI_redis_password@redis:6379/0

# Mistral AI
MISTRAL_API_KEY=votre_vraie_clé_mistral

# JWT — générer avec : openssl rand -hex 32
JWT_SECRET_KEY=CHANGEZ_MOI_generer_avec_openssl_rand

# Paramètres applicatifs
MAX_UPLOAD_FILES=10
MAX_FILE_SIZE_MB=10
EMBEDDING_MODEL=mistral-embed
EMBEDDING_DIMENSION=1024
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
CHAT_MODEL=mistral-small-latest
CHAT_MAX_TOKENS=2048
RAG_TOP_K=5
USD_TO_XAF_RATE=655
```

Générer un JWT secret fort :

```bash
openssl rand -hex 32
```

---

## 4. Configuration Docker Compose de production

Créer `docker-compose.prod.yml` à la racine du projet :

```yaml
services:
  minio:
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    deploy:
      resources:
        limits:
          memory: 1G

  postgres:
    ports: !reset []
    command: >
      postgres
        -c shared_buffers=256MB
        -c work_mem=16MB
        -c maintenance_work_mem=128MB
        -c effective_cache_size=1GB
        -c max_connections=100
    deploy:
      resources:
        limits:
          memory: 2G

  redis:
    command: redis-server --requirepass ${REDIS_PASSWORD:-changeme} --appendonly yes
    ports: !reset []
    deploy:
      resources:
        limits:
          memory: 512M

  api:
    command: uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
    ports: !reset []
    volumes: !reset []
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "2"

  worker:
    command: uv run celery -A app.workers.celery_app worker --loglevel=warning --concurrency=4
    volumes: !reset []
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "2"

  beat:
    command: uv run celery -A app.workers.celery_app beat --loglevel=warning
    volumes: !reset []
    deploy:
      resources:
        limits:
          memory: 256M

  frontend:
    deploy:
      resources:
        limits:
          memory: 256M

  nginx:
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./nginx/certbot:/var/www/certbot:ro
    deploy:
      resources:
        limits:
          memory: 256M
```

> **Notes :**
> - Les volumes de code source sont supprimés (pas de hot-reload en production)
> - `--reload` est remplacé par `--workers 4`
> - Les ports internes ne sont plus exposés vers l'hôte
> - Redis est protégé par un mot de passe avec persistance AOF

---

## 5. Configuration Nginx pour la production

Créer `nginx/nginx.prod.conf` :

```nginx
# Redirection HTTP → HTTPS
server {
    listen 80;
    server_name votre-domaine.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name votre-domaine.com;

    # Certificats SSL
    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    # Paramètres SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # En-têtes de sécurité
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Taille max des uploads
    client_max_body_size 100M;

    # Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;

    # Rate limiting (défini en dehors du bloc server)
    # limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

    # API
    location /api/ {
        proxy_pass http://api:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        chunked_transfer_encoding off;

        # Rate limiting
        # limit_req zone=api burst=50 nodelay;
    }

    # Frontend
    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Obtenir un certificat SSL (Let's Encrypt)

```bash
# Installer certbot
sudo apt install certbot

# Démarrer nginx d'abord avec la config HTTP seulement
# Puis obtenir le certificat
sudo certbot certonly --webroot -w /opt/irobot/nginx/certbot \
    -d votre-domaine.com --non-interactive --agree-tos -m admin@votre-domaine.com

# Copier les certificats
sudo cp /etc/letsencrypt/live/votre-domaine.com/fullchain.pem /opt/irobot/nginx/ssl/
sudo cp /etc/letsencrypt/live/votre-domaine.com/privkey.pem /opt/irobot/nginx/ssl/

# Renouvellement automatique (cron)
echo "0 0 1 * * certbot renew --quiet && docker compose restart nginx" | sudo crontab -
```

---

## 6. Build et déploiement

### Construire les images

```bash
cd /opt/irobot
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```

### Démarrer l'infrastructure

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d minio postgres redis
```

Attendre que les health checks passent :

```bash
docker compose ps
```

### Initialiser la base de données

```bash
# Depuis le serveur, exécuter dans le conteneur
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api \
    uv run python -c "
import subprocess, os
os.environ['POSTGRES_HOST'] = 'postgres'
subprocess.run(['uv', 'run', '--with', 'psycopg2-binary', 'python', '/app/../scripts/init_db.py'], check=True)
"
```

Ou plus simplement, installer les dépendances localement :

```bash
# Avec uv installé localement
POSTGRES_HOST=localhost uv run --with psycopg2-binary scripts/init_db.py
```

> Si Postgres n'est pas exposé (production), utiliser `docker compose exec` :

```bash
docker compose exec api uv run alembic upgrade head
```

### Initialiser MinIO

```bash
MINIO_ENDPOINT=localhost:9000 \
MINIO_ROOT_USER=irobot-minio-admin \
MINIO_ROOT_PASSWORD=votre_mot_de_passe \
uv run --with minio scripts/init_minio.py
```

### Démarrer tous les services

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Vérifier

```bash
curl http://localhost/api/v1/health
```

---

## 7. Sécurisation

### Checklist obligatoire

- [ ] **Mots de passe forts** pour MinIO, PostgreSQL, Redis, JWT
- [ ] **JWT_SECRET_KEY** généré avec `openssl rand -hex 32`
- [ ] **CORS** restreint au domaine réel (modifier `app/main.py`)
- [ ] **Pare-feu** : seuls les ports 80, 443, 22 sont ouverts
- [ ] **SSL/TLS** activé via nginx
- [ ] **Console MinIO** accessible uniquement en local (127.0.0.1:9001)
- [ ] **Mot de passe admin** changé après première connexion
- [ ] **Fichier `.env`** avec permissions restrictives :

```bash
chmod 600 /opt/irobot/.env
```

### Redis AUTH

Avec le `docker-compose.prod.yml` ci-dessus, Redis est protégé par mot de passe. Ajuster `REDIS_URL` dans `.env` :

```env
REDIS_URL=redis://:votre_mot_de_passe_redis@redis:6379/0
```

---

## 8. Sauvegardes

### PostgreSQL

```bash
# Sauvegarde manuelle
docker compose exec postgres pg_dump -U raguser ragdb | gzip > backups/db_$(date +%Y%m%d_%H%M%S).sql.gz

# Cron quotidien (ajouter au crontab)
0 2 * * * cd /opt/irobot && docker compose exec -T postgres pg_dump -U raguser ragdb | gzip > backups/db_$(date +\%Y\%m\%d).sql.gz
```

### MinIO

```bash
# Sauvegarde du volume
docker run --rm -v irobot_minio_data:/data -v $(pwd)/backups:/backup alpine \
    tar czf /backup/minio_$(date +%Y%m%d).tar.gz /data
```

### Restauration PostgreSQL

```bash
gunzip -c backups/db_20260310.sql.gz | docker compose exec -T postgres psql -U raguser -d ragdb
```

### Restauration MinIO

```bash
docker compose stop minio
docker run --rm -v irobot_minio_data:/data -v $(pwd)/backups:/backup alpine \
    sh -c "rm -rf /data/* && tar xzf /backup/minio_20260310.tar.gz -C /"
docker compose start minio
```

### Fichier .env

```bash
cp /opt/irobot/.env /secure-backup-location/.env.backup
```

---

## 9. Monitoring et logs

### Rotation des logs Docker

Créer/modifier `/etc/docker/daemon.json` :

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
```

Redémarrer Docker :

```bash
sudo systemctl restart docker
```

### Surveillance de la santé

```bash
# Script de vérification (à mettre en cron toutes les 5 min)
#!/bin/bash
HEALTH=$(curl -sf http://localhost/api/v1/health)
if [ $? -ne 0 ]; then
    echo "$(date): Health check FAILED" >> /var/log/irobot-health.log
    # Ajouter alerte (email, webhook, etc.)
fi
```

### Espace disque

```bash
# Vérifier les volumes Docker
docker system df
docker system df -v

# Taille des données MinIO
docker compose exec minio du -sh /data
```

### Logs applicatifs

```bash
docker compose logs -f --tail=200 api
docker compose logs -f --tail=200 worker
docker compose logs --since="1h" api    # Dernière heure
```

---

## 10. Mises à jour

### Procédure de mise à jour

```bash
cd /opt/irobot

# 1. Sauvegarder
docker compose exec -T postgres pg_dump -U raguser ragdb | gzip > backups/db_pre_update_$(date +%Y%m%d).sql.gz

# 2. Récupérer le code
git pull origin main

# 3. Reconstruire les images
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# 4. Appliquer les migrations
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api uv run alembic upgrade head

# 5. Redémarrer les services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 6. Vérifier
curl http://localhost/api/v1/health
```

### Rollback

```bash
# Revenir au commit précédent
git checkout <commit-precedent>

# Reconstruire et redémarrer
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Restaurer la DB si nécessaire
gunzip -c backups/db_pre_update_YYYYMMDD.sql.gz | docker compose exec -T postgres psql -U raguser -d ragdb
```

---

## 11. Considérations de mise à l'échelle

### Workers Celery

Augmenter le nombre de workers dans `docker-compose.prod.yml` :

```yaml
worker:
  command: uv run celery -A app.workers.celery_app worker --loglevel=warning --concurrency=8
  deploy:
    replicas: 2
```

### Connection pooling PostgreSQL

Pour un trafic élevé, ajouter PgBouncer devant PostgreSQL :

```yaml
pgbouncer:
  image: edoburu/pgbouncer
  environment:
    DATABASE_URL: postgres://raguser:password@postgres:5432/ragdb
    POOL_MODE: transaction
    MAX_CLIENT_CONN: 200
    DEFAULT_POOL_SIZE: 25
```

### Instances Redis séparées

Séparer le cache et la file d'attente Celery sur deux instances Redis distinctes pour éviter que le flush du cache n'affecte les tâches en cours.

### MinIO distribué

Pour la haute disponibilité, passer en mode distribué MinIO avec plusieurs nœuds (4 minimum).

---

## Résumé des commandes

| Action | Commande |
|--------|----------|
| Build | `docker compose -f docker-compose.yml -f docker-compose.prod.yml build` |
| Démarrer | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` |
| Arrêter | `docker compose -f docker-compose.yml -f docker-compose.prod.yml down` |
| Logs | `docker compose logs -f <service>` |
| Migrations | `docker compose exec api uv run alembic upgrade head` |
| Sauvegarde DB | `docker compose exec -T postgres pg_dump -U raguser ragdb \| gzip > backup.sql.gz` |
| Santé | `curl http://localhost/api/v1/health` |
