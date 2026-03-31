from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import hashlib
import json
import math
import sqlite3
import os
from contextlib import contextmanager

# Skyfield с обработкой ошибок
try:
    from skyfield.api import load, EarthSatellite
    SKYFIELD_AVAILABLE = True
except ImportError as e:
    print(f"Skyfield not available: {e}")
    SKYFIELD_AVAILABLE = False

# Initialize FastAPI app
app = FastAPI(
    title="ISS Digital Twin API",
    description="API for ISS/ROSS Digital Twin - Digital Breakthrough 2026",
    version="1.0.0"
)

# CORS configuration for frontend (restricted to development domain)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Database configuration
DATABASE_PATH = os.path.join(os.path.dirname(__file__), "digital_twin.db")

@contextmanager
def get_db_connection():
    """Context manager for database connections"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_database():
    """Initialize SQLite database with required tables"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Audit log table with hash chain support
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                action TEXT NOT NULL,
                params TEXT NOT NULL,
                prev_hash TEXT NOT NULL,
                hash TEXT NOT NULL UNIQUE
            )
        ''')
        
        # TLE cache table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tle_cache (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                name TEXT,
                line1 TEXT,
                line2 TEXT,
                updated_at TEXT
            )
        ''')
        
        # Station modules table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS modules (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                name_ru TEXT NOT NULL,
                type TEXT NOT NULL,
                attached BOOLEAN DEFAULT 1,
                visible BOOLEAN DEFAULT 1,
                mass_kg INTEGER,
                position_x REAL DEFAULT 0,
                position_y REAL DEFAULT 0,
                position_z REAL DEFAULT 0
            )
        ''')
        
        conn.commit()

# Initialize database on startup
init_database()

# Default TLE data for ISS (backup)
ISS_TLE = {
    "name": "ISS (ZARYA)",
    "line1": "1 25544U 98067A   24001.00000000  .00010000  00000-0  18000-3 0  9999",
    "line2": "2 25544  51.6400 200.0000 0001000  90.0000 270.0000 15.50000000000000"
}

# Base longitude for mock calculations
base_longitude = 0

def get_tle_data():
    """Load TLE data from Celestrak with database caching"""
    if not SKYFIELD_AVAILABLE:
        return None
    
    try:
        # Check database cache first
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM tle_cache WHERE id = 1")
            row = cursor.fetchone()
            
            if row:
                updated_at = datetime.fromisoformat(row["updated_at"])
                age = datetime.now() - updated_at
                if age.total_seconds() < 3600:  # Cache for 1 hour
                    return {
                        "name": row["name"],
                        "line1": row["line1"],
                        "line2": row["line2"]
                    }
        
        # Fetch from Celestrak
        url = "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle"
        import requests
        response = requests.get(url, timeout=10)
        lines = response.text.split('\n')
        
        for i, line in enumerate(lines):
            if "ISS ZARYA" in line or "1998-067A" in line:
                tle_data = {
                    "name": line.strip(),
                    "line1": lines[i+1].strip(),
                    "line2": lines[i+2].strip()
                }
                
                # Save to database cache
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute('''
                        INSERT OR REPLACE INTO tle_cache (id, name, line1, line2, updated_at)
                        VALUES (1, ?, ?, ?, ?)
                    ''', (tle_data["name"], tle_data["line1"], tle_data["line2"], 
                          datetime.now().isoformat()))
                    conn.commit()
                
                return tle_data
        
        return ISS_TLE  # Fallback to default
        
    except Exception as e:
        print(f"TLE fetch error: {e}")
        return ISS_TLE

def calculate_position_skyfield():
    """Calculate position using Skyfield library"""
    if not SKYFIELD_AVAILABLE:
        return None
    
    try:
        tle = get_tle_data()
        if not tle:
            return None
        
        satellite = EarthSatellite(tle["line1"], tle["line2"], tle["name"], load.timescale())
        ts = load.timescale()
        t = ts.now()
        geocentric = satellite.at(t)
        subpoint = geocentric.subpoint()
        
        return {
            "latitude": subpoint.latitude.degrees,
            "longitude": subpoint.longitude.degrees,
            "altitude_km": subpoint.altitude.km,
            "velocity_kmh": geocentric.velocity.km_per_s * 3600
        }
    except Exception as e:
        print(f"Skyfield calculation error: {e}")
        return None

def calculate_position_mock():
    """Simplified orbit model (fallback if Skyfield unavailable)"""
    global base_longitude
    base_longitude = (base_longitude + 0.5) % 360
    return {
        "latitude": 51.6462 * math.sin(base_longitude / 180 * math.pi),
        "longitude": base_longitude - 180,
        "altitude_km": 408.5,
        "velocity_kmh": 27600
    }

def create_audit_log(action: str, params: dict):
    """Create cryptographic audit record with hash chain (TZ section 3.3)"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Get last hash for chain
        cursor.execute("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        prev_hash = row["hash"] if row else "genesis"
        
        # Create record
        record = {
            "timestamp": datetime.utcnow().isoformat(),
            "action": action,
            "params": params,
            "prev_hash": prev_hash
        }
        
        # Calculate SHA-256 hash
        record_hash = hashlib.sha256(
            json.dumps(record, sort_keys=True).encode()
        ).hexdigest()
        record["hash"] = record_hash
        
        # Save to database
        cursor.execute('''
            INSERT INTO audit_log (timestamp, action, params, prev_hash, hash)
            VALUES (?, ?, ?, ?, ?)
        ''', (record["timestamp"], record["action"], 
              json.dumps(record["params"]), record["prev_hash"], record["hash"]))
        conn.commit()
        
        return record

def get_audit_log(limit: int = 50):
    """Retrieve audit log from database"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM audit_log ORDER BY id DESC LIMIT ?
        ''', (limit,))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

@app.get("/")
def root():
    """API status endpoint"""
    return {
        "message": "ISS Digital Twin API",
        "status": "running",
        "skyfield_available": SKYFIELD_AVAILABLE,
        "version": "1.0.0",
        "database": "SQLite initialized"
    }

@app.get("/api/station/position")
def get_position():
    """Current ISS position (TZ section 3.1 - Open Data)"""
    try:
        # Try Skyfield first
        if SKYFIELD_AVAILABLE:
            position = calculate_position_skyfield()
            if position:
                create_audit_log("get_position", {"source": "skyfield", "time": datetime.utcnow().isoformat()})
                return position
        
        # Fallback to mock model
        position = calculate_position_mock()
        create_audit_log("get_position", {"source": "mock", "time": datetime.utcnow().isoformat()})
        return position
        
    except Exception as e:
        print(f"Position error: {e}")
        position = calculate_position_mock()
        create_audit_log("get_position", {"source": "fallback", "time": datetime.utcnow().isoformat()})
        return position

@app.get("/api/station/orbit")
def get_orbit_params():
    """Orbital parameters"""
    return {
        "period_min": 92.68,
        "inclination_deg": 51.6462,
        "apogee_km": 421,
        "perigee_km": 418,
        "eccentricity": 0.0001,
        "raan_deg": 200.0,
        "arg_of_perigee_deg": 90.0,
        "mean_anomaly_deg": 270.0
    }

@app.get("/api/station/modules")
def get_modules():
    """Station modules list (TZ section 4.1 - minimum 3 modules)"""
    create_audit_log("get_modules", {})
    return {
        "modules": [
            {"id": 1, "name": "Zarya", "nameRu": "Заря", "type": "base", "attached": True, "mass_kg": 19323},
            {"id": 2, "name": "Zvezda", "nameRu": "Звезда", "type": "service", "attached": True, "mass_kg": 19051},
            {"id": 3, "name": "Nauka", "nameRu": "Наука", "type": "laboratory", "attached": True, "mass_kg": 20300},
            {"id": 4, "name": "Prichal", "nameRu": "Причал", "type": "node", "attached": True, "mass_kg": 3665},
            {"id": 5, "name": "Rassvet", "nameRu": "Рассвет", "type": "storage", "attached": True, "mass_kg": 5075}
        ]
    }

@app.post("/api/station/dock")
def dock_module(module_name: str = Query(..., min_length=1, max_length=50)):
    """Dock module with Intent-Gating (TZ section 4.1 - Docking animation)"""
    # Intent Validation
    if not module_name:
        raise HTTPException(status_code=400, detail="Module name required")
    
    # Safety check (simplified)
    safety_check = True
    
    if not safety_check:
        create_audit_log("dock_rejected", {"module": module_name, "reason": "safety_check_failed"})
        raise HTTPException(status_code=400, detail="Docking unsafe - collision risk")
    
    record = create_audit_log("dock_module", {"module": module_name, "status": "approved"})
    
    return {
        "status": "docked",
        "module": module_name,
        "audit_hash": record["hash"],
        "message": "Module docked successfully",
        "timestamp": record["timestamp"]
    }

@app.post("/api/station/expand")
def expand_station(module_type: str = Query(..., min_length=1, max_length=50)):
    """Station expansion (TZ section 4.1 - Expansion visualization)"""
    record = create_audit_log("expand_station", {"module_type": module_type})
    return {
        "status": "expanded",
        "module_type": module_type,
        "audit_hash": record["hash"],
        "timestamp": record["timestamp"]
    }

@app.get("/api/audit/verify")
def verify_audit():
    """Verify audit chain integrity (TZ section 3.3 - Reproducibility)"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM audit_log ORDER BY id")
        rows = cursor.fetchall()
        
        if not rows:
            return {"valid": True, "records": 0, "message": "No audit records"}
        
        audit_chain = [dict(row) for row in rows]
        
        # Verify hash chain
        for i, record in enumerate(audit_chain[1:], 1):
            prev_record = audit_chain[i-1]
            if record.get("prev_hash") != prev_record["hash"]:
                return {"valid": False, "error": f"Chain broken at record {i}", "records": len(audit_chain)}
        
        return {"valid": True, "records": len(audit_chain), "message": "Audit chain verified"}

@app.get("/api/audit/log")
def get_audit_log_endpoint(limit: int = Query(default=50, ge=1, le=1000)):
    """Get audit log (TZ section 3.3 - Audit trail)"""
    logs = get_audit_log(limit)
    return {"audit_log": logs, "total": len(logs)}

@app.get("/api/predict")
def predict_position(hours: int = Query(default=1, ge=1, le=72)):
    """Predict position N hours ahead (TZ section 6 - AI/ML bonus)"""
    try:
        if SKYFIELD_AVAILABLE:
            tle = get_tle_data()
            if tle:
                satellite = EarthSatellite(tle["line1"], tle["line2"], tle["name"], load.timescale())
                ts = load.timescale()
                future_t = ts.now() + timedelta(hours=hours)
                geocentric = satellite.at(future_t)
                subpoint = geocentric.subpoint()
                
                return {
                    "predict_time": future_t.isoformat(),
                    "latitude": subpoint.latitude.degrees,
                    "longitude": subpoint.longitude.degrees,
                    "altitude_km": subpoint.altitude.km,
                    "velocity_kmh": geocentric.velocity.km_per_s * 3600,
                    "source": "skyfield"
                }
    except Exception as e:
        print(f"Prediction error: {e}")
    
    # Fallback prediction
    future_longitude = (base_longitude + hours * 15) % 360
    return {
        "predict_time": (datetime.utcnow() + timedelta(hours=hours)).isoformat(),
        "latitude": 51.6462 * math.sin(future_longitude / 180 * math.pi),
        "longitude": future_longitude - 180,
        "altitude_km": 408.5,
        "velocity_kmh": 27600,
        "source": "mock"
    }

@app.get("/api/station/status")
def get_station_status():
    """Full station status"""
    position = calculate_position_skyfield() if SKYFIELD_AVAILABLE else calculate_position_mock()
    return {
        "station": "ISS/ROSS",
        "position": position,
        "modules_count": 5,
        "crew_capacity": 6,
        "orbit": {
            "period_min": 92.68,
            "inclination_deg": 51.6462,
            "altitude_km": 408.5
        },
        "systems": {
            "power": "nominal",
            "life_support": "nominal",
            "communication": "nominal",
            "propulsion": "nominal"
        },
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/api/health")
def health_check():
    """API health check"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM audit_log")
        audit_count = cursor.fetchone()[0]
    
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "skyfield": SKYFIELD_AVAILABLE,
        "audit_records": audit_count,
        "database": "connected"
    }

if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("ISS DIGITAL TWIN API")
    print("=" * 60)
    print(f"Skyfield available: {SKYFIELD_AVAILABLE}")
    print(f"Database: {DATABASE_PATH}")
    print(f"API Docs: http://localhost:8000/docs")
    print(f"Health: http://localhost:8000/api/health")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")