"""
Pydantic Models for Group Operations
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class Group(BaseModel):
    """Group model"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    machine_count: int = 0
    created_at: datetime
    updated_at: datetime


class GroupCreate(BaseModel):
    """Create group request"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class GroupUpdate(BaseModel):
    """Update group request"""
    description: Optional[str] = Field(None, max_length=500)


class BulkGroupOperation(BaseModel):
    """Bulk group operation request"""
    machine_ids: List[str] = Field(..., min_length=1)
    groups: List[str] = Field(..., min_length=1)


class GroupResponse(BaseModel):
    """Group response"""
    name: str
    machine_count: int = 0
    description: Optional[str] = None
