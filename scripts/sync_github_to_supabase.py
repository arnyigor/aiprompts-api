import os
import json
import sys
from dotenv import load_dotenv
from github import Github, Auth, ContentFile, UnknownObjectException
from supabase import create_client, Client
from typing import List, Dict, Any

# ... функция get_prompts_from_github остается без изменений ...
def get_prompts_from_github(repo) -> List[Dict[str, Any]]:
    """
    Рекурсивно получает все .json файлы из директории 'prompts' в репозитории.
    """
    print("[DEBUG] Вход в функцию get_prompts_from_github...")
    all_prompts = []

    PROMPTS_ROOT_PATH = "prompts"

    try:
        print(f"[DEBUG] Пытаемся получить содержимое из '{PROMPTS_ROOT_PATH}'...")
        contents = repo.get_contents(PROMPTS_ROOT_PATH)
        print(f"[DEBUG] API-ответ получен. Найдено {len(contents)} элементов в директории.")

        if not contents:
            print("[INFO] Директория пуста. Нечего обрабатывать.")
            return []

        while contents:
            file_content: ContentFile = contents.pop(0)
            print(f"[DEBUG] Обработка элемента: {file_content.path} (тип: {file_content.type})")

            if file_content.type == "dir":
                contents.extend(repo.get_contents(file_content.path))
            elif file_content.type == "file" and file_content.name.endswith(".json"):
                try:
                    decoded_content = file_content.decoded_content.decode('utf-8')
                    prompt_data = json.loads(decoded_content)

                    if 'status' not in prompt_data:
                        prompt_data['status'] = 'draft'
                        print(f"     [INFO] Статус не найден для {file_content.path}, установлен 'draft'")

                    allowed_statuses = ['public', 'draft', 'private', 'archived', 'pending_review']
                    if prompt_data.get('status') not in allowed_statuses:
                        print(f"     [ПРЕДУПРЕЖДЕНИЕ] Недопустимый статус '{prompt_data.get('status')}' в файле {file_content.path}. Промпт будет пропущен.")
                        continue

                    all_prompts.append(prompt_data)
                    print(f" -> Загружен промпт: {file_content.path} со статусом '{prompt_data['status']}'")
                except json.JSONDecodeError:
                    print(f"     [ПРЕДУПРЕЖДЕНИЕ] Не удалось распарсить JSON: {file_content.path}")
                except Exception as e:
                    print(f"     [ОШИБКА] При обработке файла {file_content.path}: {e}")

    except UnknownObjectException:
        print(f"\n[КРИТИЧЕСКАЯ ОШИБКА] Директория '{PROMPTS_ROOT_PATH}' не найдена в репозитории!")
        sys.exit(1)
    except Exception as e:
        print(f"Неожиданная ошибка при получении данных с GitHub: {e}")
        sys.exit(1)

    if not all_prompts:
        print("[INFO] Цикл завершился, но ни одного корректного .json файла для синхронизации не найдено.")

    return all_prompts


def sync_github_to_supabase() -> None:
    print("\nЗапуск синхронизации GitHub -> Supabase...")
    load_dotenv()

    try:
        print("[DEBUG] Инициализация клиентов...")
        auth = Auth.Token(os.environ.get("GITHUB_TOKEN"))

        # КОММЕНТАРИЙ: Ключевое изменение! Устанавливаем таймаут в 10 секунд.
        g = Github(auth=auth, timeout=10)

        repo_full_name = f"{os.environ.get('GITHUB_REPO_OWNER')}/{os.environ.get('GITHUB_REPO_NAME')}"
        repo = g.get_repo(repo_full_name)

        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        supabase: Client = create_client(supabase_url, supabase_key)

        print(f"[SUCCESS] Успешное подключение к GitHub репозиторию: {repo.full_name}")
        print("[SUCCESS] Успешное подключение к Supabase.")

    except Exception as e:
        # Теперь, если будет таймаут, мы увидим ошибку здесь
        print(f"\n[КРИТИЧЕСКАЯ ОШИБКА] Ошибка инициализации клиентов. Проверьте сетевое подключение. Детали: {e}")
        sys.exit(1)

    # ... остальная часть кода без изменений ...
    prompts_to_sync = get_prompts_from_github(repo)

    if not prompts_to_sync:
        print("\nВ GitHub не найдено промптов для синхронизации. Завершение работы.")
        return

    print(f"\nВсего найдено {len(prompts_to_sync)} промптов. Начинаем операцию UPSERT в Supabase...")
    try:
        response = supabase.table('prompts').upsert(prompts_to_sync).execute()
        if response.data:
            print(f"[SUCCESS] Успешно обработано {len(response.data)} записей.")
        else:
            print(f"[WARNING] Операция UPSERT завершена, но не вернула данных. Ответ API: {response}")
        print("\nСинхронизация успешно завершена.")
    except Exception as e:
        print(f"\nПроизошла ошибка во время операции UPSERT: {e}")
        sys.exit(1)


if __name__ == "__main__":
    sync_github_to_supabase()