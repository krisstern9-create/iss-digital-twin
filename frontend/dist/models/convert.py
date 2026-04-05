import trimesh
import os
from pathlib import Path

# Папка с моделями (текущая директория)
models_dir = Path(__file__).parent

# Файлы для конвертации
files_to_convert = {
    'Solar_panel1.STL': 'solar_panel.glb',
    's0-body.STL': 'core.glb',
    'Cupola-body.STL': 'cupola.glb',
    'Airlock-body1.STL': 'airlock.glb',
    'Solar panel2.stl': 'solar_panel2.glb',
}

print("🚀 Начинаю конвертацию STL → GLB...\n")

converted = 0
errors = 0

for stl_file, glb_file in files_to_convert.items():
    stl_path = models_dir / stl_file
    glb_path = models_dir / glb_file
    
    if not stl_path.exists():
        print(f"⚠️  Файл не найден: {stl_file}")
        errors += 1
        continue
    
    try:
        print(f"📦 Загрузка: {stl_file}")
        mesh = trimesh.load(stl_path)
        
        print(f"   ↳ Вершин: {len(mesh.vertices)}")
        print(f"   ↳ Граней: {len(mesh.faces)}")
        
        print(f"💾 Экспорт: {glb_file}")
        mesh.export(glb_path, file_type='glb')
        
        print(f"✅ Успешно!\n")
        converted += 1
        
    except Exception as e:
        print(f"❌ Ошибка: {e}\n")
        errors += 1

print("=" * 50)
print(f"🎉 Конвертация завершена!")
print(f"   ✅ Конвертировано: {converted}")
print(f"   ❌ Ошибок: {errors}")