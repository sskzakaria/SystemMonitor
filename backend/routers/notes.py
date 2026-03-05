"""
Machine Notes Router
Handles CRUD operations for machine notes
"""
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from bson import ObjectId
import logging

from database import db_manager
from utils.collections import MACHINE_NOTES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["notes"])


def validate_machine_id(machine_id: str) -> str:
    """Inline validation for machine ID"""
    if not machine_id or len(machine_id) < 3:
        raise HTTPException(status_code=400, detail="Machine ID must be at least 3 characters")
    if len(machine_id) > 100:
        raise HTTPException(status_code=400, detail="Machine ID must be less than 100 characters")
    return machine_id.strip()


def validate_note_content(content: str) -> str:
    """Inline validation for note content"""
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="Note content cannot be empty")
    
    content = content.strip()
    
    if len(content) > 5000:
        raise HTTPException(status_code=400, detail="Note content is too long (max 5000 characters)")
    
    return content


class NoteCreate(BaseModel):
    """Create note request"""
    content: str = Field(..., min_length=1, max_length=5000)
    category: Optional[str] = Field("general", max_length=50)


class NoteUpdate(BaseModel):
    """Update note request"""
    content: Optional[str] = Field(None, min_length=1, max_length=5000)
    category: Optional[str] = Field(None, max_length=50)


class Note(BaseModel):
    """Note response"""
    id: str
    machine_id: str
    content: str
    category: str
    created_by: str
    created_at: datetime
    updated_at: datetime


@router.get("/machines/{machine_id}/notes", response_model=List[Note])
async def get_machine_notes(
    machine_id: str,
    limit: int = 50,
    skip: int = 0
):
    """Get notes for a machine"""
    try:
        machine_id = validate_machine_id(machine_id)
        
        cursor = db_manager.mongodb_db[MACHINE_NOTES].find(
            {"machine_id": machine_id}
        ).sort("created_at", -1).skip(skip).limit(limit)
        
        notes = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            doc.pop("_id", None)
            notes.append(Note(**doc))
        
        return notes
    except Exception as e:
        logger.error(f"Error fetching notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/machines/{machine_id}/notes")
async def add_machine_note(machine_id: str, note: NoteCreate):
    """Add a note to a machine"""
    try:
        machine_id = validate_machine_id(machine_id)
        content = validate_note_content(note.content)
        
        note_doc = {
            "machine_id": machine_id,
            "content": content,
            "category": note.category or "general",
            "created_by": "admin",  # TODO: Get from auth context
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = await db_manager.mongodb_db[MACHINE_NOTES].insert_one(note_doc)
        
        logger.info(f"Added note to machine {machine_id}")
        return {
            "id": str(result.inserted_id),
            "message": "Note added successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding note: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/notes/{note_id}")
async def update_note(note_id: str, note: NoteUpdate):
    """Update a note"""
    try:
        # Validate ObjectId
        try:
            obj_id = ObjectId(note_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid note ID")
        
        # Build update dict
        update_fields = {}
        if note.content is not None:
            update_fields["content"] = validate_note_content(note.content)
        if note.category is not None:
            update_fields["category"] = note.category
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        update_fields["updated_at"] = datetime.utcnow()
        
        result = await db_manager.mongodb_db[MACHINE_NOTES].update_one(
            {"_id": obj_id},
            {"$set": update_fields}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Note not found")
        
        logger.info(f"Updated note {note_id}")
        return {"message": "Note updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating note: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str):
    """Delete a note"""
    try:
        # Validate ObjectId
        try:
            obj_id = ObjectId(note_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid note ID")
        
        result = await db_manager.mongodb_db[MACHINE_NOTES].delete_one(
            {"_id": obj_id}
        )
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Note not found")
        
        logger.info(f"Deleted note {note_id}")
        return {"message": "Note deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting note: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notes/recent", response_model=List[Note])
async def get_recent_notes(limit: int = 20):
    """Get recent notes across all machines"""
    try:
        cursor = db_manager.mongodb_db[MACHINE_NOTES].find({}).sort(
            "created_at", -1
        ).limit(limit)
        
        notes = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            doc.pop("_id", None)
            notes.append(Note(**doc))
        
        return notes
    except Exception as e:
        logger.error(f"Error fetching recent notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))
