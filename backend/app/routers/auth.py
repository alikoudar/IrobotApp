"""Auth router — login, logout, refresh, profile."""

import logging

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import get_current_user
from app.models.database import User, get_db
from app.models.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
    UserProfileUpdate,
    UserResponse,
)
from app.services.auth_service import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT tokens."""
    user = await authenticate_user(body.email, body.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé",
        )

    access_token = create_access_token(str(user.id), user.role, user.email)
    refresh_token = create_refresh_token(str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/logout")
async def logout(body: RefreshRequest):
    """Blacklist refresh token."""
    settings = get_settings()
    try:
        payload = decode_token(body.refresh_token)
        jti = payload.get("jti")
        if jti:
            r = aioredis.from_url(settings.redis_url)
            ttl = settings.jwt_refresh_token_expire_days * 86400
            await r.setex(f"blacklist:{jti}", ttl, "1")
            await r.aclose()
    except Exception:
        pass  # logout should not fail
    return {"status": "ok", "message": "Déconnexion réussie"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Refresh access token."""
    settings = get_settings()
    try:
        payload = decode_token(body.refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de rafraîchissement invalide ou expiré",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Type de token invalide",
        )

    # Check blacklist
    jti = payload.get("jti")
    if jti:
        try:
            r = aioredis.from_url(settings.redis_url)
            is_blacklisted = await r.exists(f"blacklist:{jti}")
            await r.aclose()
            if is_blacklisted:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token révoqué",
                )
        except HTTPException:
            raise
        except Exception:
            pass

    user_id = payload.get("sub")
    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilisateur introuvable ou désactivé",
        )

    access_token = create_access_token(str(user.id), user.role, user.email)
    new_refresh_token = create_refresh_token(str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user profile."""
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse)
async def update_me(
    body: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user profile."""
    if body.name is not None:
        current_user.name = body.name

    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change current user password."""
    if not current_user.password_hash or not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=400,
            detail="Mot de passe actuel incorrect",
        )

    current_user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"status": "ok", "message": "Mot de passe modifié avec succès"}
