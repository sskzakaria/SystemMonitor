"""
Pydantic Models for Tag Operations
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class Tag(BaseModel):
    """Tag model"""
    name: str = Field(..., min_length=1, max_length=50)
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    description: Optional[str] = Field(None, max_length=200)


class TagCreate(BaseModel):
    """Create tag request"""
    name: str = Field(..., min_length=1, max_length=50)
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    description: Optional[str] = Field(None, max_length=200)


class TagUpdate(BaseModel):
    """Update tag request"""
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    description: Optional[str] = Field(None, max_length=200)


class BulkTagOperation(BaseModel):
    """Bulk tag operation request"""
    machine_ids: List[str] = Field(..., min_length=1)
    tags: List[str] = Field(..., min_length=1)
    operation: str = Field(..., pattern=r'^(add|remove)$')


class TagResponse(BaseModel):
    """Tag response"""
    name: str
    count: int = 0
    color: Optional[str] = None
    description: Optional[str] = None
