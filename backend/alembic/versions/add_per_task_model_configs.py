"""Add per-task model config keys

Revision ID: b1f2c3d4e5f6
Revises: ac0758074aad
Create Date: 2026-03-12

"""
from alembic import op

# revision identifiers
revision = "b1f2c3d4e5f6"
down_revision = "ac0758074aad"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        INSERT INTO app_config (key, value, description, category, updated_at) VALUES
            ('title_model', '"mistral-small-latest"', 'Modèle de génération de titres', 'models', NOW()),
            ('classify_model', '"mistral-small-latest"', 'Modèle de classification d''intention', 'models', NOW()),
            ('vision_model', '"mistral-small-latest"', 'Modèle de vision (analyse d''image)', 'models', NOW()),
            ('greeting_model', '"mistral-small-latest"', 'Modèle de réponse aux salutations', 'models', NOW())
        ON CONFLICT (key) DO NOTHING;
    """)


def downgrade():
    op.execute(
        "DELETE FROM app_config WHERE key IN ('title_model','classify_model','vision_model','greeting_model');"
    )
