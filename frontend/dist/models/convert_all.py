import trimesh
import os
from pathlib import Path

# Корневая папка с моделями
models_dir = Path(__file__).parent

# Карта конвертации: (папка, входной файл, выходной файл)
conversion_map = [
    # 🔴 Высокий приоритет (обязательно для ТЗ)
    ('Z1', 'z1-body.STL', 'z1_base.glb'),
    ('USLAB', 'uslab_body.STL', 'uslab_laboratory.glb'),
    ('Solar panel', 'Solar_panel1.STL', 'solar_panel_power.glb'),
    ('Airlock', 'Airlock-body1.STL', 'airlock_hub.glb'),
    
    # 🟡 Средний приоритет
    ('Columbus', 'Columbus_body.STL', 'columbus_laboratory.glb'),
    ('FGB', 'FGB-body.STL', 'fgb_base.glb'),
    ('TCS', 'TCS_body.stl', 'tcs_service.glb'),
    
    # 🟢 Дополнительный (для расширения)
    ('BEAM', 'Beam.STL', 'beam_expansion.glb'),
    ('Node2', 'node2_body.STL', 'node2_hub.glb'),
    ('PMA 1', 'PMA1-body.stl', 'pma1_docking.glb'),
]

print("=" * 60)
print("🚀 МАССОВАЯ КОНВЕРТАЦИЯ STL → GLB")
print("=" * 60)

converted = 0
errors = 0
skipped = 0

for folder, input_file, output_file in conversion_map:
    folder_path = models_dir / folder
    input_path = folder_path / input_file
    output_path = models_dir / output_file
    
    print(f"\n📦 [{folder}] {input_file} → {output_file}")
    
    # Проверка существования файла
    if not input_path.exists():
        print(f"   ⚠️  Файл не найден!")
        skipped += 1
        continue
    
    try:
        # Загрузка STL
        print(f"   ↳ Загрузка...")
        mesh = trimesh.load(input_path)
        
        # Статистика
        vertices = len(mesh.vertices) if hasattr(mesh, 'vertices') else 0
        faces = len(mesh.faces) if hasattr(mesh, 'faces') else 0
        print(f"   ↳ Вершин: {vertices:,} | Граней: {faces:,}")
        
        # Экспорт в GLB
        print(f"   ↳ Экспорт GLB...")
        mesh.export(output_path, file_type='glb')
        
        # Проверка результата
        if output_path.exists():
            size_kb = output_path.stat().st_size / 1024
            print(f"   ✅ Успешно! ({size_kb:.1f} KB)")
            converted += 1
        else:
            print(f"   ❌ Файл не создан!")
            errors += 1
            
    except Exception as e:
        print(f"   ❌ Ошибка: {str(e)[:100]}")
        errors += 1

print("\n" + "=" * 60)
print("📊 ИТОГИ КОНВЕРТАЦИИ")
print("=" * 60)
print(f"   ✅ Конвертировано: {converted}")
print(f"   ❌ Ошибок: {errors}")
print(f"   ⚠️  Пропущено: {skipped}")
print(f"   📁 Всего: {len(conversion_map)}")
print("=" * 60)

if converted >= 6:
    print("\n🎉 МИНИМУМ ДЛЯ ТЗ ВЫПОЛНЕН (6+ модулей)!")
else:
    print(f"\n⚠️  Нужно ещё {6 - converted} модулей для ТЗ!")