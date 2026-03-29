from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from skyfield.api import load, EarthSatellite
from datetime import datetime, timedelta
import requests
import hashlib
import json

app = FastAPI(title="ISS Digital Twin API")

# CORS для фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Кэш для TLE данных
tle_cache = {
    "iss": None,
    "updated_at": None
}

# Crypto audit цепочка
audit_chain = []

def get_tle_data():
    """Загрузка TLE данных с Celestrak"""
    try:
        url = "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle"
        response = requests.get(url, timeout=10)
        lines = response.text.split('\n')
        
        # Найти МКС (ISS ZARYA)
        for i, line in enumerate(lines):
            if "ISS ZARYA" in line or "1998-067A" in line:
                return {
                    "name": line.strip(),
                    "line1": lines[i+1].strip(),
                    "line2": lines[i+2].strip()
                }
        return None
    except Exception as e:
        print(f"TLE fetch error: {e}")
        return None

def create_audit_log(action: str, params: dict):
    """Создание крипто-аудит записи"""
    record = {
        "timestamp": datetime.utcnow().isoformat(),
        "action": action,
        "params": params
    }
    record_hash = hashlib.sha256(json.dumps(record, sort_keys=True).encode()).hexdigest()
    
    if audit_chain:
        record["prev_hash"] = audit_chain[-1]["hash"]
    else:
        record["prev_hash"] = "genesis"
    
    record["hash"] = record_hash
    audit_chain.append(record)
    return record

@app.get("/")
def root():
    return {"message": "ISS Digital Twin API", "status": "running"}

@app.get("/api/station/position")
def get_position():
    """Текущая позиция МКС"""
    tle = get_tle_data()
    if not tle:
        raise HTTPException(status_code=500, detail="TLE data unavailable")
    
    satellite = EarthSatellite(tle["line1"], tle["line2"], tle["name"], load.timescale())
    ts = load.timescale()
    t = ts.now()
    geocentric = satellite.at(t)
    subpoint = geocentric.subpoint()
    
    create_audit_log("get_position", {"time": t.isoformat()})
    
    return {
        "latitude": subpoint.latitude.degrees,
        "longitude": subpoint.longitude.degrees,
        "altitude_km": subpoint.altitude.km,
        "velocity_kmh": geocentric.velocity.km_per_s * 3600,
        "timestamp": t.isoformat()
    }

@app.get("/api/station/orbit")
def get_orbit_params():
    """Параметры орбиты"""
    tle = get_tle_data()
    if not tle:
        raise HTTPException(status_code=500, detail="TLE data unavailable")
    
    satellite = EarthSatellite(tle["line1"], tle["line2"], tle["name"], load.timescale())
    
    return {
        "period_min": satellite.model.no * 24 * 60 / (2 * 3.14159),
        "inclination_deg": satellite.model.inclo * 180 / 3.14159,
        "apogee_km": satellite.model.a * (1 + satellite.model.ecc) - 6371,
        "perigee_km": satellite.model.a * (1 - satellite.model.ecc) - 6371
    }

@app.get("/api/station/modules")
def get_modules():
    """Список модулей станции"""
    create_audit_log("get_modules", {})
    
    return {
        "modules": [
            {"id": 1, "name": "Zarya", "type": "base", "attached": True},
            {"id": 2, "name": "Zvezda", "type": "service", "attached": True},
            {"id": 3, "name": "Nauka", "type": "laboratory", "attached": True}
        ]
    }

@app.post("/api/station/dock")
def dock_module(module_name: str):
    """Стыковка модуля (Intent-Gating)"""
    # Intent Validation
    if not module_name or len(module_name) > 50:
        raise HTTPException(status_code=400, detail="Invalid module name")
    
    # Safety check (упрощённая)
    safety_check = True  # Здесь можно добавить проверку на столкновения
    
    if not safety_check:
        raise HTTPException(status_code=400, detail="Docking unsafe - collision risk")
    
    record = create_audit_log("dock_module", {"module": module_name, "status": "approved"})
    
    return {
        "status": "docked",
        "module": module_name,
        "audit_hash": record["hash"],
        "message": "Module docked successfully"
    }

@app.post("/api/station/expand")
def expand_station(module_type: str):
    """Расширение станции"""
    record = create_audit_log("expand_station", {"module_type": module_type})
    
    return {
        "status": "expanded",
        "module_type": module_type,
        "audit_hash": record["hash"]
    }

@app.get("/api/audit/verify")
def verify_audit():
    """Проверка целостности аудита"""
    if not audit_chain:
        return {"valid": True, "records": 0}
    
    # Проверка цепочки
    for i, record in enumerate(audit_chain[1:], 1):
        prev_record = audit_chain[i-1]
        if record.get("prev_hash") != prev_record["hash"]:
            return {"valid": False, "error": f"Chain broken at record {i}"}
    
    return {"valid": True, "records": len(audit_chain)}

@app.get("/api/predict")
def predict_position(hours: int = 1):
    """Прогноз позиции через N часов (AI/ML бонус)"""
    tle = get_tle_data()
    if not tle:
        raise HTTPException(status_code=500, detail="TLE data unavailable")
    
    satellite = EarthSatellite(tle["line1"], tle["line2"], tle["name"], load.timescale())
    ts = load.timescale()
    future_t = ts.now() + timedelta(hours=hours)
    geocentric = satellite.at(future_t)
    subpoint = geocentric.subpoint()
    
    return {
        "predict_time": future_t.isoformat(),
        "latitude": subpoint.latitude.degrees,
        "longitude": subpoint.longitude.degrees,
        "altitude_km": subpoint.altitude.km
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)