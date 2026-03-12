# IroBot — Guide de Déploiement (Développement)

Guide pas-à-pas pour déployer IroBot en environnement de développement local.

---

## 1. Prérequis

| Outil | Version minimale | Vérification |
|-------|-----------------|--------------|
| Docker Desktop | 24+ | `docker --version` |
| Docker Compose | v2+ | `docker compose version` |
| Git | 2.x | `git --version` |
| Node.js | 20+ | `node --version` (optionnel, pour dev frontend hors Docker) |
| Python | 3.11+ | `python3 --version` (optionnel, pour dev backend hors Docker) |
| uv | latest | `uv --version` (optionnel, pour dev backend hors Docker) |

Vous aurez aussi besoin d'une **clé API Mistral AI** valide : [console.mistral.ai](https://console.mistral.ai).

---

## 2. Cloner et configurer

```bash
git clone <repo-url> IrobotApp
cd IrobotApp
```

Copier le fichier de configuration :

```bash
cp .env.example .env
```

Modifier `.env` — les deux valeurs **obligatoires** à renseigner :

```env
MISTRAL_API_KEY=votre_clé_mistral_ici
JWT_SECRET_KEY=une-clé-secrète-locale
```

Les autres valeurs par défaut conviennent pour le développement local.

---

## 3. Démarrer les services d'infrastructure

Lancer MinIO, PostgreSQL et Redis en premier (les autres services en dépendent) :

```bash
docker compose up -d minio postgres redis
```

Attendre que les health checks passent :

```bash
docker compose ps
```

Les trois services doivent afficher `healthy` avant de continuer.

---

## 4. Initialiser la base de données et MinIO

### Base de données

Crée les extensions pgvector, l'administrateur par défaut et la configuration initiale :

```bash
POSTGRES_HOST=localhost uv run --with psycopg2-binary scripts/init_db.py
```

> **Note :** `POSTGRES_HOST=localhost` est nécessaire car le script tourne sur la machine hôte, pas dans Docker.

### Appliquer les migrations Alembic

```bash
docker compose run --rm api uv run alembic upgrade head
```

### MinIO

Crée les 4 buckets nécessaires (`uploads`, `processed`, `ocr-images`, `audit-archives`) :

```bash
MINIO_ENDPOINT=localhost:9000 uv run --with minio scripts/init_minio.py
```

---

## 5. Démarrer tous les services

```bash
docker compose up -d
```

Cela construit et démarre les 8 services :

| Service | Rôle | Port |
|---------|------|------|
| `minio` | Stockage objets (S3) | 9000 (API), 9001 (console) |
| `postgres` | Base de données + pgvector | 5432 |
| `redis` | Broker Celery + cache | 6379 |
| `api` | Backend FastAPI | 8000 |
| `worker` | Worker Celery (OCR, ingestion) | — |
| `beat` | Planificateur Celery Beat | — |
| `frontend` | Interface Next.js | 80 (interne) |
| `nginx` | Reverse proxy (point d'entrée) | **80** |

L'ordre de démarrage est géré par `depends_on` + health checks.

---

## 6. Vérifier le déploiement

### Health check API

```bash
curl http://localhost/api/v1/health
```

Réponse attendue : tous les services en `ok`.

### Interface web

- **Application :** http://localhost
- **Console MinIO :** http://localhost:9001 (login : `minioadmin` / `minioadmin123`)

### Connexion administrateur

- **Email :** `admin@beac.int`
- **Mot de passe :** `Admin@beac2024`
- **Matricule :** `ADM001`

---

## 7. Workflow de développement

### Backend (hot-reload)

Le backend est monté en volume (`./backend:/app`) et uvicorn tourne avec `--reload`. Toute modification dans `backend/` est prise en compte automatiquement.

Pour voir les logs en temps réel :

```bash
docker compose logs -f api
```

### Frontend (deux options)

**Option A — via Docker (rebuild) :**

```bash
docker compose build frontend && docker compose up -d frontend
```

**Option B — dev local (hot-reload) :**

```bash
cd frontend
npm install
npm run dev
```

Le frontend local tourne sur http://localhost:3000. Configurer les appels API vers `http://localhost:8000` ou passer par nginx sur le port 80.

### Migrations de base de données

```bash
# Créer une nouvelle migration
docker compose exec api uv run alembic revision --autogenerate -m "description"

# Appliquer les migrations
docker compose exec api uv run alembic upgrade head

# Historique
docker compose exec api uv run alembic history

# Revenir en arrière
docker compose exec api uv run alembic downgrade -1
```

### Logs des services

```bash
docker compose logs -f              # Tous les services
docker compose logs -f api          # Backend uniquement
docker compose logs -f worker       # Worker Celery
docker compose logs -f beat         # Celery Beat
docker compose logs -f frontend     # Frontend
```

---

## 8. Dépannage

### Conflits de ports

Si le port 80 est déjà utilisé, modifier `docker-compose.yml` :

```yaml
nginx:
  ports:
    - "8080:80"  # Utiliser un autre port
```

Ports utilisés : 80, 8000, 5432, 6379, 9000, 9001.

### MinIO/Postgres non prêt

Si `init_db.py` ou `init_minio.py` échoue, vérifier que les services sont `healthy` :

```bash
docker compose ps
docker compose logs minio
docker compose logs postgres
```

### Erreur clé API Mistral

Vérifier que `MISTRAL_API_KEY` est bien défini dans `.env` et que la clé est valide. Les appels OCR, embedding et chat échoueront sans clé valide.

### Erreur de certificat SSL dans le conteneur

Le Dockerfile backend inclut `ca-certificates` et configure `SSL_CERT_FILE`. Si les appels HTTPS échouent :

```bash
docker compose exec api update-ca-certificates
docker compose restart api worker beat
```

### LibreOffice lent ou en erreur

La conversion Office → PDF utilise LibreOffice headless. Si la conversion bloque :

```bash
docker compose exec api pgrep -la soffice
docker compose restart worker
```

### Réinitialisation complète

```bash
docker compose down -v   # Supprime les conteneurs ET les volumes
docker compose up -d
# Puis ré-initialiser DB + MinIO (étapes 3-4)
```

---

## 9. Commandes utiles

| Commande | Description |
|----------|-------------|
| `docker compose up -d` | Démarrer tous les services |
| `docker compose down` | Arrêter tous les services |
| `docker compose ps` | État des services |
| `docker compose build` | Reconstruire les images |
| `docker compose build --no-cache` | Reconstruire sans cache |
| `docker compose restart api` | Redémarrer un service |
| `docker compose exec postgres psql -U raguser -d ragdb` | Shell PostgreSQL |
| `docker compose exec redis redis-cli` | Shell Redis |
| `docker compose logs -f --tail=100 api` | 100 dernières lignes + suivi |

---

## Structure des variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `MISTRAL_API_KEY` | — | **Obligatoire.** Clé API Mistral |
| `JWT_SECRET_KEY` | — | **Obligatoire.** Secret pour les tokens JWT |
| `MINIO_ROOT_USER` | `minioadmin` | Utilisateur MinIO |
| `MINIO_ROOT_PASSWORD` | `minioadmin123` | Mot de passe MinIO |
| `POSTGRES_DB` | `ragdb` | Nom de la base |
| `POSTGRES_USER` | `raguser` | Utilisateur PostgreSQL |
| `POSTGRES_PASSWORD` | `ragpass123` | Mot de passe PostgreSQL |
| `REDIS_URL` | `redis://redis:6379/0` | URL Redis |
| `CHAT_MODEL` | `mistral-small-latest` | Modèle de chat |
| `EMBEDDING_MODEL` | `mistral-embed` | Modèle d'embeddings |
| `CHUNK_SIZE` | `1000` | Taille des chunks (tokens) |
| `CHUNK_OVERLAP` | `200` | Chevauchement des chunks |
| `RAG_TOP_K` | `5` | Nombre de chunks récupérés |
| `USD_TO_XAF_RATE` | `655` | Taux de conversion USD→XAF |
