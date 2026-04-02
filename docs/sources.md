# Sources (Open data & assets)

## Orbital data (TLE)

- **CelesTrak** (NORAD GP elements / stations group): `https://celestrak.org/NORAD/elements/`

The backend fetches TLE and caches it in SQLite (see `backend/main.py`).

## 3D models / assets

- Models used by the frontend are stored in `frontend/public/models/`.
- The project supports open formats such as **glTF/GLB**, **OBJ**, **STL** (conversion scripts are in `frontend/public/models/`).

If you replace models, please ensure license compatibility and keep attribution if required by the source.

## Safety, ethics, licensing

- Only use assets that you have the right to use (open license or your own).
- TLE/orbital data is retrieved from open public sources; the project stores only cached copies and does not contain restricted information.

