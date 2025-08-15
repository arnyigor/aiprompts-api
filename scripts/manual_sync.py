import os
import json
from dotenv import load_dotenv
from supabase import create_client, Client
from typing import List, Dict, Any

# Определяем директорию для сохранения промптов
OUTPUT_DIR = "synced-prompts"

def sync_public_prompts() -> None:
    """
    Подключается к Supabase, извлекает все публичные промпты
    и сохраняет каждый в отдельный JSON-файл.
    """
    print("Запуск синхронизации публичных промптов...")

    # Загружаем переменные окружения из .env файла
    load_dotenv()

    # Получаем URL и ключ из переменных окружения
    supabase_url: str = os.environ.get("SUPABASE_URL")
    supabase_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        print("Ошибка: Убедитесь, что SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY заданы в .env")
        return

    try:
        # Инициализируем клиент Supabase
        supabase: Client = create_client(supabase_url, supabase_key)
        print("Успешное подключение к Supabase.")

        # Выбираем все промпты со статусом 'public'
        response = supabase.table('prompts').select('*').eq('status', 'public').execute()
        
        # Данные находятся в response.data
        prompts: List[Dict[str, Any]] = response.data
        
        if not prompts:
            print("Не найдено публичных промптов для синхронизации.")
            return

        print(f"Найдено {len(prompts)} публичных промптов.")

        # Создаем директорию, если она не существует
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        print(f"Файлы будут сохранены в директорию: '{OUTPUT_DIR}'")

        # Сохраняем каждый промпт в отдельный файл
        for prompt in prompts:
            # Используем UUID как имя файла для уникальности
            file_path = os.path.join(OUTPUT_DIR, f"{prompt['id']}.json")
            with open(file_path, 'w', encoding='utf-8') as f:
                # json.dump для красивого форматирования и поддержки кириллицы
                json.dump(prompt, f, ensure_ascii=False, indent=2)
            print(f" -> Сохранен промпт: {file_path}")

        print("\nСинхронизация успешно завершена.")

    except Exception as e:
        print(f"\nПроизошла ошибка во время выполнения скрипта: {e}")


if __name__ == "__main__":
    sync_public_prompts()