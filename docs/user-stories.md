# User Stories

This section documents usage scenarios required by the technical specification.

## 1) Engineering analysis

As an engineer, I want to change orbital height and station orientation so that I can visually validate how the configuration behaves under different parameters.

- UI: Orbit height slider, orientation slider.
- Output: 3D scene reacts (distance/orientation), telemetry shows current lat/lon/alt from open data.

## 2) Educational scenario (docking)

As a student, I want to initiate a docking sequence and watch the approach + attachment so that I can understand the docking process.

- UI: Docking button.
- Output: A free module animates towards the docking target and becomes part of the station.

## 3) Presentation scenario (expansion)

As a presenter, I want to expand the station by adding modules so that I can demonstrate modular growth of the station.

- UI: Add module / Docking.
- Output: New module becomes attached and visible in the modules list and in 3D.

## Extra (Hackathon differentiators)

### A) Training mode (guided docking)

As a learner, I want step-by-step guidance and clear docking target visualization so that I can understand the docking sequence without confusion.

### B) Audit timeline / replay

As a judge or reviewer, I want to see a timeline of actions (parameter changes, docking, expansion) so that I can validate system behavior and reproducibility.

