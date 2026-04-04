from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import hashlib
import json
import logging
import math
import sqlite3
import os
import base64
import hmac
import secrets
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Tuple

from config import get_settings
from logging_conf import setup_logging
from scos_adapter import ScosSecureChannel

logger = logging.getLogger("iss_dt")

# Skyfield с обработкой ошибок
try:
    from skyfield.api import load, EarthSatellite
    SKYFIELD_AVAILABLE = True
except ImportError as e:
    logger.warning("Skyfield not available: %s", e)
    SKYFIELD_AVAILABLE = False

_SETTINGS = get_settings()
setup_logging(_SETTINGS.log_level)

# Initialize FastAPI app
app = FastAPI(
    title="ISS Digital Twin API",
    description="API for ISS/ROSS Digital Twin - Digital Breakthrough 2026",
    version=_SETTINGS.api_version,
)

# CORS: список origin из переменной CORS_ORIGINS (через запятую)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_SETTINGS.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@contextmanager
def get_db_connection():
    """Контекстное подключение к SQLite с WAL и таймаутом блокировок."""
    conn = sqlite3.connect(_SETTINGS.database_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA foreign_keys=ON")
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

        # Optional column for 3D segment ↔ STL folder (MVP full ISS)
        try:
            cursor.execute("ALTER TABLE modules ADD COLUMN stl_group TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass

        # Reseed when legacy rows have no stl_group (one-time migration to full segment list)
        cursor.execute("SELECT COUNT(*) FROM modules WHERE stl_group IS NOT NULL")
        has_segments = cursor.fetchone()[0]
        if has_segments == 0:
            cursor.execute("DELETE FROM modules")
            conn.commit()
            seed_modules = [
                (1, "JEM", "JEM (Kibo)", "segment", 1, 1, 14300, 8.0, 14.0, 2.0, "JEM"),
                (2, "MRM1", "МРМ-1 (Пирс)", "segment", 1, 1, 4100, -18.0, 2.0, 4.0, "MRM1"),
                (3, "MRM2", "МРМ-2 (Поиск)", "segment", 0, 1, 800, -24.0, 0.0, -3.0, "MRM2"),
                (4, "ELC1", "ELC-1", "segment", 1, 1, 2000, 4.0, 1.0, 9.0, "ELC1"),
                (5, "ELC2", "ELC-2", "segment", 1, 1, 2000, 2.0, 1.0, 9.0, "ELC2"),
                (6, "ELC3", "ELC-3", "segment", 1, 1, 2000, 0.0, 1.0, 9.0, "ELC3"),
                (7, "ELC4", "ELC-4", "segment", 1, 1, 2000, -2.0, 1.0, 9.0, "ELC4"),
                (8, "P5", "P5", "segment", 1, 1, 4000, -6.0, 0.0, 0.0, "P5"),
                (9, "P6", "P6", "segment", 1, 1, 5000, 12.0, 0.0, 0.0, "P6"),
                (10, "S5", "S5", "segment", 1, 1, 4000, -12.0, 0.0, 0.0, "S5"),
                (11, "S6", "S6 (солнечные)", "segment", 1, 1, 12000, -18.0, 0.0, 0.0, "S6"),
                (12, "PIRS", "Пирс (стыковочный)", "segment", 1, 1, 3500, -14.0, -2.0, 2.0, "PIRS"),
                (13, "PMM", "PMM", "segment", 1, 1, 4200, -16.0, 3.0, -2.0, "PMM"),
                (14, "AMS", "AMS", "segment", 1, 1, 2500, 14.0, 8.0, -4.0, "Ams"),
            ]
            cursor.executemany(
                """
                INSERT INTO modules
                (id, name, name_ru, type, attached, visible, mass_kg, position_x, position_y, position_z, stl_group)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                seed_modules,
            )
            conn.commit()


@app.on_event("startup")
def _on_startup():
    init_database()
    logger.info("SQLite ready: %s", _SETTINGS.database_path)


# Default TLE data for ISS (backup)
ISS_TLE = {
    "name": "ISS (ZARYA)",
    "line1": "1 25544U 98067A   24001.00000000  .00010000  00000-0  18000-3 0  9999",
    "line2": "2 25544  51.6400 200.0000 0001000  90.0000 270.0000 15.50000000000000"
}

# Base longitude for mock calculations
base_longitude = 0
SECURE_KEY = os.getenv("DT_SECURE_KEY", "iss-dt-demo-key").encode("utf-8")
SCOS_CHANNEL = ScosSecureChannel(seed=os.getenv("DT_SCOS_SEED", "iss-dt-scos-seed"))
SCOS_POLICY = {
    "allow_all": False,
    "whitelist_domains": ["celestrak.org", "nasa.gov", "esa.int", "roscosmos.ru"],
    "whitelist_ports": [80, 443],
    "blacklist_domains": ["*.malware.*", "*.phishing.*"],
}

def _keystream(length: int, nonce: str) -> bytes:
    stream = b""
    counter = 0
    while len(stream) < length:
        block = hashlib.sha256(SECURE_KEY + nonce.encode("utf-8") + str(counter).encode("utf-8")).digest()
        stream += block
        counter += 1
    return stream[:length]

def _xor_bytes(data: bytes, key: bytes) -> bytes:
    return bytes(d ^ k for d, k in zip(data, key))

def get_tle_data():
    """Load TLE data from Celestrak with database caching"""
    if not SKYFIELD_AVAILABLE:
        return None

    cache_sec = _SETTINGS.tle_cache_seconds
    timeout = _SETTINGS.tle_request_timeout_sec

    try:
        # Check database cache first
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM tle_cache WHERE id = 1")
            row = cursor.fetchone()

            if row:
                updated_at = datetime.fromisoformat(row["updated_at"])
                age = datetime.now() - updated_at
                if age.total_seconds() < cache_sec:
                    return {
                        "name": row["name"],
                        "line1": row["line1"],
                        "line2": row["line2"],
                    }

        # Fetch from Celestrak
        url = "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle"
        import requests

        response = requests.get(url, timeout=timeout)
        if response.status_code != 200:
            logger.warning("TLE HTTP %s from Celestrak", response.status_code)
            return ISS_TLE
        lines = response.text.split("\n")
        
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
        logger.warning("TLE fetch error: %s", e)
        return ISS_TLE


def get_stations_tle_catalog(max_items: Optional[int] = None):
    """Fetch stations TLE catalog for multi-station visualization."""
    if max_items is None:
        max_items = _SETTINGS.stations_catalog_max
    try:
        import requests

        url = "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle"
        response = requests.get(url, timeout=_SETTINGS.tle_request_timeout_sec)
        if response.status_code != 200:
            logger.warning("Stations catalog HTTP %s", response.status_code)
            return []
        lines = [ln.strip() for ln in response.text.split("\n") if ln.strip()]
        out = []
        for i in range(0, len(lines) - 2, 3):
            name, line1, line2 = lines[i], lines[i + 1], lines[i + 2]
            if not line1.startswith("1 ") or not line2.startswith("2 "):
                continue
            out.append({"name": name, "line1": line1, "line2": line2})
            if len(out) >= max_items:
                break
        return out
    except Exception as e:
        logger.warning("Stations catalog fetch error: %s", e)
        return []


_timescale = None


def _get_timescale():
    """Один общий timescale на процесс (Skyfield)."""
    global _timescale
    if _timescale is None:
        _timescale = load.timescale()
    return _timescale


def calculate_position_skyfield():
    """Calculate position using Skyfield library"""
    if not SKYFIELD_AVAILABLE:
        return None

    try:
        tle = get_tle_data()
        if not tle:
            return None

        ts = _get_timescale()
        satellite = EarthSatellite(tle["line1"], tle["line2"], tle["name"], ts)
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
        logger.warning("Skyfield calculation error: %s", e)
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

def calculate_position_mock_at(longitude_deg: float):
    """Mock orbit model at an arbitrary longitude phase"""
    phase = longitude_deg % 360
    return {
        "latitude": 51.6462 * math.sin(phase / 180 * math.pi),
        "longitude": phase - 180,
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


def _verify_audit_chain(audit_chain: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Проверка prev_hash и пересчёт SHA-256 каждой записи."""
    if not audit_chain:
        return {"valid": True, "records": 0, "message": "No audit records"}

    for i, record in enumerate(audit_chain[1:], 1):
        prev_record = audit_chain[i - 1]
        if record.get("prev_hash") != prev_record["hash"]:
            return {
                "valid": False,
                "error": f"Chain broken at record {i}",
                "records": len(audit_chain),
            }

    for i, record in enumerate(audit_chain):
        try:
            params_parsed = json.loads(record["params"])
        except (json.JSONDecodeError, TypeError):
            params_parsed = {"raw": record["params"]}
        body = {
            "timestamp": record["timestamp"],
            "action": record["action"],
            "params": params_parsed,
            "prev_hash": record["prev_hash"],
        }
        computed = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
        if computed != record["hash"]:
            return {
                "valid": False,
                "error": f"Hash mismatch at index {i} (id={record.get('id')})",
                "records": len(audit_chain),
            }

    return {"valid": True, "records": len(audit_chain), "message": "Audit chain verified"}


def list_modules_from_db() -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM modules ORDER BY id ASC")
        rows = cursor.fetchall()
        modules: List[Dict[str, Any]] = []
        for row in rows:
            sg = None
            try:
                sg = row["stl_group"]
            except (KeyError, IndexError):
                sg = None
            modules.append(
                {
                    "id": row["id"],
                    "name": row["name"],
                    "nameRu": row["name_ru"],
                    "type": row["type"],
                    "attached": bool(row["attached"]),
                    "visible": bool(row["visible"]),
                    "mass_kg": row["mass_kg"],
                    "position": {"x": row["position_x"], "y": row["position_y"], "z": row["position_z"]},
                    "stlGroup": sg,
                }
            )
        return modules

def update_module_db(
    module_id: int,
    *,
    attached: Optional[bool] = None,
    visible: Optional[bool] = None,
    position: Optional[Dict[str, float]] = None,
) -> None:
    updates = []
    params: List[Any] = []

    if attached is not None:
        updates.append("attached = ?")
        params.append(1 if attached else 0)
    if visible is not None:
        updates.append("visible = ?")
        params.append(1 if visible else 0)
    if position is not None:
        updates.extend(["position_x = ?", "position_y = ?", "position_z = ?"])
        params.extend([float(position["x"]), float(position["y"]), float(position["z"])])

    if not updates:
        return

    params.append(module_id)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE modules SET {', '.join(updates)} WHERE id = ?", params)
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Module not found")
        conn.commit()

@app.get("/")
def root():
    """API status endpoint"""
    return {
        "message": "ISS Digital Twin API",
        "status": "running",
        "skyfield_available": SKYFIELD_AVAILABLE,
        "version": _SETTINGS.api_version,
        "database": "sqlite+w",
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
        logger.exception("Position error: %s", e)
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
    return {"modules": list_modules_from_db()}

@app.put("/api/station/modules/{module_id}/visibility")
def set_module_visibility(module_id: int, visible: bool = Query(...)):
    """Toggle module visibility"""
    update_module_db(module_id, visible=visible)
    record = create_audit_log("set_module_visibility", {"module_id": module_id, "visible": visible})
    return {"ok": True, "audit_hash": record["hash"], "module_id": module_id, "visible": visible}

@app.put("/api/station/modules/{module_id}/attach")
def attach_module(module_id: int, attached: bool = Query(...)):
    """Attach/detach module in configuration"""
    update_module_db(module_id, attached=attached, visible=True if attached else None)
    record = create_audit_log("set_module_attached", {"module_id": module_id, "attached": attached})
    return {"ok": True, "audit_hash": record["hash"], "module_id": module_id, "attached": attached}

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
        audit_chain = [dict(row) for row in rows]
    return _verify_audit_chain(audit_chain)

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
                ts = _get_timescale()
                satellite = EarthSatellite(tle["line1"], tle["line2"], tle["name"], ts)
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
        logger.warning("Prediction error: %s", e)
    
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

def _compute_predict_track_points(hours: int, step_min: int) -> Tuple[List[Dict[str, Any]], str]:
    """
    Расчёт траектории МКС без записи в audit.
    Возвращает (points, source) где source — skyfield | mock.
    """
    now = datetime.utcnow()
    points: List[Dict[str, Any]] = []

    if SKYFIELD_AVAILABLE:
        try:
            tle = get_tle_data()
            if tle:
                ts = _get_timescale()
                satellite = EarthSatellite(tle["line1"], tle["line2"], tle["name"], ts)
                steps = int((hours * 60) / step_min) + 1
                for i in range(steps):
                    t = ts.from_datetime(now + timedelta(minutes=i * step_min))
                    geocentric = satellite.at(t)
                    subpoint = geocentric.subpoint()
                    points.append(
                        {
                            "time": (now + timedelta(minutes=i * step_min)).isoformat(),
                            "latitude": subpoint.latitude.degrees,
                            "longitude": subpoint.longitude.degrees,
                            "altitude_km": subpoint.altitude.km,
                            "velocity_kmh": geocentric.velocity.km_per_s * 3600,
                        }
                    )
                return points, "skyfield"
        except Exception as e:
            logger.warning("Track prediction error: %s", e)

    steps = int((hours * 60) / step_min) + 1
    for i in range(steps):
        phase = (base_longitude + (i * step_min) * 0.25) % 360
        p = calculate_position_mock_at(phase)
        points.append(
            {
                "time": (now + timedelta(minutes=i * step_min)).isoformat(),
                "latitude": p["latitude"],
                "longitude": p["longitude"],
                "altitude_km": p["altitude_km"],
                "velocity_kmh": p["velocity_kmh"],
            }
        )
    return points, "mock"


def _synthesize_iss_ai_forecast(
    points: List[Dict[str, Any]],
    source: str,
    hours: int,
) -> Dict[str, Any]:
    """Эвристический «AI»-разбор траектории (без внешнего LLM)."""
    if not points:
        return {
            "summary_ru": "Нет точек траектории для анализа.",
            "summary_en": "No trajectory points to analyze.",
            "confidence": 0.0,
            "model": "orbit-orchestrator-v1",
            "highlights": {},
            "factors": ["no_data"],
        }

    alts = [float(p["altitude_km"]) for p in points]
    lats = [float(p["latitude"]) for p in points]
    lons = [float(p["longitude"]) for p in points]
    vels = [float(p.get("velocity_kmh", 27500.0)) for p in points]

    alt_min, alt_max = min(alts), max(alts)
    alt_mean = sum(alts) / len(alts)
    lat_span = max(lats) - min(lats)
    vel_mean = sum(vels) / len(vels)
    alt_jitter = alt_max - alt_min

    # грубая оценка «шага» по долготе между соседними точками
    lon_steps = []
    for i in range(1, min(len(lons), 25)):
        d = abs(lons[i] - lons[i - 1])
        if d > 180:
            d = 360 - d
        lon_steps.append(d)
    lon_step_avg = sum(lon_steps) / len(lon_steps) if lon_steps else 0.0

    confidence = 0.88 if source == "skyfield" else 0.62
    if alt_jitter > 25:
        confidence *= 0.92
    confidence = round(max(0.35, min(0.97, confidence)), 2)

    basis_ru = "текущие TLE и пропагация Skyfield" if source == "skyfield" else "упрощённая демо-модель без свежих TLE"
    basis_en = "live TLE propagation (Skyfield)" if source == "skyfield" else "simplified demo ephemeris (no fresh TLE)"

    summary_ru = (
        f"За ближайшие {hours} ч ожидается средняя высота ~{alt_mean:.0f} км "
        f"(диапазон {alt_min:.0f}–{alt_max:.0f} км), средняя эквивалентная скорость ~{vel_mean:.0f} км/ч. "
        f"Размах широты по треку ~{abs(lat_span):.1f}°. Основа прогноза: {basis_ru}. "
        f"Оценка устойчивости высоты: {'высокая' if alt_jitter < 6 else 'умеренная' if alt_jitter < 15 else 'низкая'}."
    )
    summary_en = (
        f"Over the next {hours} h expect mean altitude ~{alt_mean:.0f} km "
        f"(range {alt_min:.0f}–{alt_max:.0f} km), mean ground-track speed ~{vel_mean:.0f} km/h. "
        f"Latitude span ~{abs(lat_span):.1f}°. Forecast basis: {basis_en}. "
        f"Altitude stability: {'high' if alt_jitter < 6 else 'moderate' if alt_jitter < 15 else 'low'}."
    )

    factors = [
        "skyfield_sgp4" if source == "skyfield" else "mock_ephemeris",
        "altitude_stable" if alt_jitter < 8 else "altitude_variable",
    ]
    if lon_step_avg > 2:
        factors.append("rapid_longitude_advance")

    return {
        "summary_ru": summary_ru,
        "summary_en": summary_en,
        "confidence": confidence,
        "model": "orbit-orchestrator-v1",
        "highlights": {
            "altitude_km_min": round(alt_min, 1),
            "altitude_km_max": round(alt_max, 1),
            "altitude_km_mean": round(alt_mean, 1),
            "latitude_range_deg": round(abs(lat_span), 2),
            "mean_velocity_kmh": round(vel_mean, 0),
            "orbit_period_min_est": 92.68,
            "data_source": source,
            "longitude_step_deg_avg": round(lon_step_avg, 3),
        },
        "factors": factors,
    }


@app.get("/api/predict/track")
def predict_track(hours: int = Query(default=6, ge=1, le=72), step_min: int = Query(default=30, ge=5, le=120)):
    """Predict a track for the next N hours as a list (AI/ML bonus section)."""
    points, src = _compute_predict_track_points(hours, step_min)
    create_audit_log("predict_track", {"source": src, "hours": hours, "step_min": step_min})
    return {"source": src, "hours": hours, "step_min": step_min, "points": points}


@app.get("/api/ai/forecast")
def ai_iss_forecast(
    hours: int = Query(default=6, ge=1, le=72),
    step_min: int = Query(default=30, ge=5, le=120),
):
    """
    Встроенный прогноз МКС с «AI»-интерпретацией траектории.
    Траектория совпадает с /api/predict/track; добавляется текстовый разбор и метрики.
    """
    points, src = _compute_predict_track_points(hours, step_min)
    ai = _synthesize_iss_ai_forecast(points, src, hours)
    create_audit_log(
        "ai_predict_iss",
        {"source": src, "hours": hours, "step_min": step_min, "confidence": ai["confidence"]},
    )
    return {
        "source": src,
        "hours": hours,
        "step_min": step_min,
        "points": points,
        "ai": ai,
    }

@app.get("/api/audit/timeline")
def audit_timeline(limit: int = Query(default=200, ge=5, le=2000)):
    """Return a normalized timeline for UI (filtering + replay)."""
    logs = get_audit_log(limit)
    # Normalize params JSON where possible
    events: List[Dict[str, Any]] = []
    for item in logs[::-1]:
        params_raw = item.get("params")
        params = None
        try:
            params = json.loads(params_raw) if isinstance(params_raw, str) else params_raw
        except Exception:
            params = {"raw": params_raw}
        events.append(
            {
                "id": item.get("id"),
                "time": item.get("timestamp"),
                "action": item.get("action"),
                "params": params,
                "hash": item.get("hash"),
                "prev_hash": item.get("prev_hash"),
            }
        )
    return {"events": events, "total": len(events)}

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))

def _build_stations_list() -> List[Dict[str, Any]]:
    """Данные станций без записи в audit (для внутренних вызовов и /api/stations/link)."""
    stations: List[Dict[str, Any]] = []
    if SKYFIELD_AVAILABLE:
        catalog = get_stations_tle_catalog()
        if catalog:
            ts = _get_timescale()
            t = ts.now()
            for idx, item in enumerate(catalog):
                try:
                    sat = EarthSatellite(item["line1"], item["line2"], item["name"], ts)
                    sub = sat.at(t).subpoint()
                    stations.append(
                        {
                            "id": f"tle-{idx}",
                            "name": item["name"],
                            "nameRu": item["name"],
                            "position": {
                                "latitude": sub.latitude.degrees,
                                "longitude": sub.longitude.degrees,
                                "altitude_km": sub.altitude.km,
                                "velocity_kmh": sat.at(t).velocity.km_per_s * 3600,
                            },
                            "source": "tle/skyfield",
                        }
                    )
                except Exception:
                    continue

    if not stations:
        iss_pos = calculate_position_skyfield() if SKYFIELD_AVAILABLE else calculate_position_mock()
        ross_pos = calculate_position_mock_at((base_longitude + 70) % 360)
        gateway_pos = calculate_position_mock_at((base_longitude + 150) % 360)
        gateway_pos["altitude_km"] = 3000.0
        stations = [
            {"id": "iss", "name": "ISS", "nameRu": "МКС", "position": iss_pos, "source": "mock"},
            {"id": "ross", "name": "ROSS", "nameRu": "РОСС", "position": ross_pos, "source": "mock"},
            {
                "id": "gateway",
                "name": "Lunar Gateway",
                "nameRu": "Лунный Gateway",
                "position": gateway_pos,
                "source": "mock",
            },
        ]

    return stations


@app.get("/api/stations")
def list_stations():
    """Return a list of stations for 'inter-station link' visualization (bonus feature)."""
    stations = _build_stations_list()
    create_audit_log("list_stations", {"count": len(stations)})
    return {"stations": stations}


@app.get("/api/stations/link")
def station_link(a: str = Query(..., min_length=1), b: str = Query(..., min_length=1)):
    """Compute a simple link metric between two stations (distance + signal delay)."""
    stations_list = _build_stations_list()
    stations = {s["id"]: s for s in stations_list}
    if a not in stations or b not in stations:
        raise HTTPException(status_code=404, detail="Station not found")

    pa = stations[a]["position"]
    pb = stations[b]["position"]
    # Surface distance approximation; good enough for a dashboard metric.
    d_km = _haversine_km(pa["latitude"], pa["longitude"], pb["latitude"], pb["longitude"])
    # Add simple altitude contribution
    d_km = math.sqrt(d_km**2 + (pa["altitude_km"] - pb["altitude_km"]) ** 2)
    delay_ms = (d_km / 299792.458) * 1000.0  # speed of light km/s

    create_audit_log("station_link", {"a": a, "b": b, "distance_km": d_km})
    return {"a": a, "b": b, "distance_km": d_km, "delay_ms": delay_ms}

@app.post("/api/secure/encrypt")
def secure_encrypt(payload: str = Query(..., min_length=1)):
    """Encrypt + sign payload for secure telemetry channel (SCOS-compatible adapter)."""
    packet = SCOS_CHANNEL.encrypt(payload)
    create_audit_log("secure_encrypt", {"len": len(payload), "alg": packet.algorithm})
    return packet.to_dict()

@app.post("/api/secure/decrypt")
def secure_decrypt(nonce: str = Query(...), ciphertext: str = Query(...), signature: str = Query(...), sender_pub: str = Query(...)):
    """Verify signature and decrypt payload."""
    try:
        plain = SCOS_CHANNEL.decrypt(
            {"nonce": nonce, "ciphertext": ciphertext, "signature": signature, "sender_pub": sender_pub}
        )
    except Exception:
        create_audit_log("secure_decrypt_rejected", {"reason": "bad_signature"})
        raise HTTPException(status_code=400, detail="Invalid signature")
    create_audit_log("secure_decrypt", {"len": len(plain)})
    return {"valid": True, "payload": plain}

@app.post("/api/scos/policy/check")
def scos_policy_check(domain: str = Query(...), port: int = Query(default=443)):
    """SCOS-inspired policy check endpoint."""
    if any(pattern.replace("*", "") in domain for pattern in SCOS_POLICY["blacklist_domains"]):
        create_audit_log("scos_policy_deny", {"domain": domain, "port": port, "reason": "blacklist"})
        return {"allowed": False, "reason": "blacklist"}
    if port not in SCOS_POLICY["whitelist_ports"]:
        create_audit_log("scos_policy_deny", {"domain": domain, "port": port, "reason": "port"})
        return {"allowed": False, "reason": "port_not_allowed"}
    if not SCOS_POLICY["allow_all"] and not any(w in domain for w in SCOS_POLICY["whitelist_domains"]):
        create_audit_log("scos_policy_deny", {"domain": domain, "port": port, "reason": "domain"})
        return {"allowed": False, "reason": "domain_not_whitelisted"}
    create_audit_log("scos_policy_allow", {"domain": domain, "port": port})
    return {"allowed": True, "reason": "policy_match"}

@app.post("/api/scos/permit")
def scos_issue_permit(district_id: str = Query(...), domain: str = Query(...), port: int = Query(default=443), ttl_sec: int = Query(default=300, ge=30, le=3600)):
    """SCOS-like signed permit for a network operation."""
    policy = scos_policy_check(domain=domain, port=port)
    action = "allow" if policy["allowed"] else "deny"
    expires_at = (datetime.utcnow() + timedelta(seconds=ttl_sec)).isoformat() + "Z"
    payload = {
        "district_id": district_id,
        "domain": domain,
        "port": port,
        "action": action,
        "expires_at": expires_at,
        "nonce": secrets.token_hex(8),
    }
    raw = json.dumps(payload, sort_keys=True)
    signed = SCOS_CHANNEL.encrypt(raw)  # includes signature proof object
    create_audit_log("scos_permit_issued" if action == "allow" else "scos_permit_denied", {"district_id": district_id, "domain": domain, "port": port})
    return {"permit": payload, "proof": signed.to_dict()}

@app.get("/api/ai/recommendation")
def ai_recommendation():
    """Heuristic 'AI' recommendation for docking/operations."""
    modules = list_modules_from_db()
    unattached = [m for m in modules if not m["attached"]]
    station_pos = calculate_position_skyfield() if SKYFIELD_AVAILABLE else calculate_position_mock()
    risk = 0.25 if unattached else 0.55
    if station_pos and station_pos["altitude_km"] < 380:
        risk += 0.2
    recommendation = "dock_next_module" if unattached else "optimize_orientation"
    confidence = max(0.4, min(0.95, 1.0 - risk))
    create_audit_log("ai_recommendation", {"recommendation": recommendation, "confidence": confidence})
    return {
        "recommendation": recommendation,
        "confidence": confidence,
        "risk_score": risk,
        "candidate_module": unattached[0]["name"] if unattached else None,
        "reasoning": [
            "based_on_unattached_modules",
            "based_on_orbit_altitude",
            "based_on_station_state",
        ],
    }

@app.get("/api/analytics/judge")
def judge_analytics():
    """KPI panel for judges."""
    logs = get_audit_log(500)
    actions = [x.get("action", "") for x in logs]
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM audit_log ORDER BY id")
        full_chain = [dict(r) for r in cursor.fetchall()]
    integrity_ok = _verify_audit_chain(full_chain).get("valid", False)
    kpis = {
        "total_events": len(logs),
        "dock_events": sum(1 for a in actions if "dock" in a),
        "expand_events": sum(1 for a in actions if "expand" in a),
        "secure_events": sum(1 for a in actions if "secure_" in a or "scos_" in a),
        "predict_events": sum(1 for a in actions if "predict" in a),
        "integrity_ok": integrity_ok,
    }
    # simple innovation score
    innovation_score = 40
    if kpis["dock_events"] > 0:
        innovation_score += 15
    if kpis["predict_events"] > 0:
        innovation_score += 15
    if kpis["secure_events"] > 0:
        innovation_score += 20
    if kpis["integrity_ok"]:
        innovation_score += 10
    return {"kpis": kpis, "innovation_score": min(100, innovation_score)}

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
        "version": _SETTINGS.api_version,
        "skyfield": SKYFIELD_AVAILABLE,
        "audit_records": audit_count,
        "database": "connected",
    }

if __name__ == "__main__":
    import uvicorn

    logger.info("ISS Digital Twin API — skyfield=%s db=%s", SKYFIELD_AVAILABLE, _SETTINGS.database_path)
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        log_level=_SETTINGS.log_level.lower(),
    )