"""
WebSocket Router for Real-Time Updates
Broadcasts machine updates to all connected clients
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Set, Dict, Any
from datetime import datetime, timezone
import logging
import json
import asyncio

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])

# ============================================================================
# WEBSOCKET CONNECTION MANAGER
# ============================================================================
class ConnectionManager:
    """Manages WebSocket connections and broadcasts"""
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.machine_connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket, machine_id: str = None):
        """Accept a new WebSocket connection"""
        await websocket.accept()
        
        async with self._lock:
            self.active_connections.add(websocket)
            
            if machine_id:
                if machine_id not in self.machine_connections:
                    self.machine_connections[machine_id] = set()
                self.machine_connections[machine_id].add(websocket)
                logger.info(f"✅ WebSocket connected for machine: {machine_id}")
            else:
                logger.info(f"✅ WebSocket connected (global)")
    
    async def disconnect(self, websocket: WebSocket, machine_id: str = None):
        """Remove a WebSocket connection"""
        async with self._lock:
            self.active_connections.discard(websocket)
            
            if machine_id and machine_id in self.machine_connections:
                self.machine_connections[machine_id].discard(websocket)
                if not self.machine_connections[machine_id]:
                    del self.machine_connections[machine_id]
                logger.info(f"❌ WebSocket disconnected for machine: {machine_id}")
            else:
                logger.info(f"❌ WebSocket disconnected (global)")
    
    async def broadcast(self, message: Dict[Any, Any]):
        """Broadcast message to all connected clients"""
        if not self.active_connections:
            return
        
        message_text = json.dumps(message)
        dead_connections = set()
        
        # Send to all connections
        for connection in self.active_connections.copy():
            try:
                await connection.send_text(message_text)
            except Exception as e:
                logger.debug(f"Failed to send to connection: {e}")
                dead_connections.add(connection)
        
        # Clean up dead connections
        if dead_connections:
            async with self._lock:
                for connection in dead_connections:
                    self.active_connections.discard(connection)
                    # Remove from machine-specific connections too
                    for machine_set in self.machine_connections.values():
                        machine_set.discard(connection)
    
    async def broadcast_to_machine(self, machine_id: str, message: Dict[Any, Any]):
        """Broadcast message to clients watching a specific machine"""
        if machine_id not in self.machine_connections:
            return
        
        message_text = json.dumps(message)
        dead_connections = set()
        
        for connection in self.machine_connections[machine_id].copy():
            try:
                await connection.send_text(message_text)
            except Exception as e:
                logger.debug(f"Failed to send to machine connection: {e}")
                dead_connections.add(connection)
        
        # Clean up dead connections
        if dead_connections:
            async with self._lock:
                for connection in dead_connections:
                    self.machine_connections[machine_id].discard(connection)
                if not self.machine_connections[machine_id]:
                    del self.machine_connections[machine_id]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get connection statistics"""
        return {
            "total_connections": len(self.active_connections),
            "machine_specific_connections": len(self.machine_connections),
            "machines_watched": list(self.machine_connections.keys())
        }

# Global WebSocket manager instance
ws_manager = ConnectionManager()

# ============================================================================
# WEBSOCKET ENDPOINTS
# ============================================================================

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Global WebSocket endpoint for real-time updates
    Receives all machine updates
    """
    await ws_manager.connect(websocket)
    
    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            
            # Echo back for testing (optional)
            if data == "ping":
                await websocket.send_text(json.dumps({
                    "type": "pong",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }))
            
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await ws_manager.disconnect(websocket)


@router.websocket("/ws/machines/{machine_id}")
async def machine_websocket_endpoint(websocket: WebSocket, machine_id: str):
    """
    Machine-specific WebSocket endpoint
    Only receives updates for a specific machine
    """
    await ws_manager.connect(websocket, machine_id)
    
    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            
            # Echo back for testing
            if data == "ping":
                await websocket.send_text(json.dumps({
                    "type": "pong",
                    "machine_id": machine_id,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }))
            
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, machine_id)
    except Exception as e:
        logger.error(f"WebSocket error for machine {machine_id}: {e}")
        await ws_manager.disconnect(websocket, machine_id)


@router.get("/ws/stats")
async def websocket_stats():
    """Get WebSocket connection statistics"""
    return ws_manager.get_stats()


# ============================================================================
# HELPER FUNCTIONS (for use by other routers)
# ============================================================================

async def broadcast_machine_update(machine_data: Dict[Any, Any]):
    """
    Broadcast machine update to all connected clients
    Called by ingestion endpoints
    """
    machine_id = machine_data.get("machine_id")
    
    message = {
        "type": "machine_update",
        "data": machine_data,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    # Broadcast to all global connections
    await ws_manager.broadcast(message)
    
    # Also broadcast to machine-specific connections
    if machine_id:
        await ws_manager.broadcast_to_machine(machine_id, message)


async def broadcast_alert(alert_data: Dict[Any, Any]):
    """Broadcast new alert to all clients"""
    message = {
        "type": "alert",
        "data": alert_data,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await ws_manager.broadcast(message)


async def broadcast_status_change(machine_id: str, old_status: str, new_status: str):
    """Broadcast machine status change"""
    message = {
        "type": "status_change",
        "data": {
            "machine_id": machine_id,
            "old_status": old_status,
            "new_status": new_status
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await ws_manager.broadcast(message)
    await ws_manager.broadcast_to_machine(machine_id, message)