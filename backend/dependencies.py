"""
FastAPI Dependencies
Provides dependency injection for authentication and authorization
"""

from typing import Optional
from pydantic import BaseModel
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import Config

# Try to import auth libraries (optional)
try:
    from jose import JWTError, jwt
    from passlib.context import CryptContext
    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False
    JWTError = Exception

# Security
security = HTTPBearer(auto_error=False)

# Password hashing (only if auth libraries available)
if AUTH_AVAILABLE and Config.AUTH_ENABLED:
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class OptionalUser(BaseModel):
    """
    Optional user model for authentication
    Currently returns anonymous user since auth is disabled for development
    """
    username: str = "anonymous"
    is_authenticated: bool = False
    role: str = "admin"
    disabled: bool = False


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> OptionalUser:
    """
    Dependency to get current user (optional)
    
    Returns anonymous user if auth is disabled
    Validates JWT token if auth is enabled
    """
    # If auth is disabled, return anonymous user
    if not Config.AUTH_ENABLED:
        return OptionalUser(
            username="anonymous",
            is_authenticated=False,
            role="admin",
            disabled=False
        )
    
    # Auth is enabled but no credentials provided
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Check if auth libraries are installed
    if not AUTH_AVAILABLE:
        raise HTTPException(
            status_code=500,
            detail="Authentication libraries not installed (python-jose, passlib)"
        )
    
    # Validate JWT token
    try:
        payload = jwt.decode(
            credentials.credentials,
            Config.JWT_SECRET_KEY,
            algorithms=[Config.JWT_ALGORITHM]
        )
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        
        # Return authenticated user
        return OptionalUser(
            username=username,
            is_authenticated=True,
            role=payload.get("role", "user"),
            disabled=False
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication token")