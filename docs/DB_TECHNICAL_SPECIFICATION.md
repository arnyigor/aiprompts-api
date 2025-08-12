# Техническое задание: API для управления AI-промптами

**Версия:** 1.0
**Дата:** 12.08.2025
**Проект:** aiprompts-vercel

## 1. Введение

Настоящий документ описывает спецификацию API для взаимодействия клиентских приложений (веб и мобильных) с бэкендом, построенным на платформе Supabase. API предназначен для создания, чтения, обновления, удаления (CRUD) и поиска AI-промптов.

**Ключевые технологии:**

* **Бэкенд:** Supabase
* **База данных:** PostgreSQL
* **Аутентификация:** Supabase Auth (JWT)
* **Безопасность:** Row-Level Security (RLS)


## 2. Общие требования

### 2.1. Аутентификация

Все запросы к эндпоинтам, работающим с данными, должны быть аутентифицированы. Клиентское приложение обязано прикреплять валидный JWT-токен пользователя к каждому запросу. Supabase-клиенты (`supabase-js`, `supabase-kt`) делают это автоматически.

### 2.2. Формат данных

Все данные передаются и принимаются в формате `JSON`.

### 2.3. Базовый URL

Базовый URL для всех запросов предоставляется Supabase и имеет вид: `https://<project-ref>.supabase.co`. Клиентские библиотеки управляют им автоматически.

## 3. Модель данных: Таблица `prompts`

Основной сущностью системы является `prompt`. Структура таблицы в PostgreSQL определена следующим образом:

```sql
CREATE TABLE public.prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  content_ru TEXT,
  content_en TEXT,
  variables JSONB,
  prompt_variants JSONB,
  tags TEXT[],
  category TEXT,
  status TEXT,
  is_local BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false,
  rating REAL DEFAULT 0,
  rating_votes INT DEFAULT 0,
  author TEXT,
  source TEXT,
  notes TEXT,
  version TEXT,
  compatible_models TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  modified_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
```


## 4. Безопасность (RLS Policies)

Доступ к данным строго регламентирован политиками RLS. Ключевое правило: **пользователи могут выполнять операции (CRUD) только над теми строками, где `prompts.user_id` совпадает с их `auth.uid()`**.

## 5. Описание эндпоинтов (API Endpoints)

Взаимодействие с API происходит через клиентские библиотеки Supabase, которые абстрагируют прямые HTTP-вызовы. Ниже приведено описание логических операций и соответствующих им вызовов.

### 5.1. Создание промпта (CREATE)

* **Операция:** `insert()`
* **Описание:** Создает новую запись о промпте для текущего аутентифицированного пользователя.
* **Тело запроса (`promptData`):** Объект `JSON`, соответствующий структуре таблицы `prompts`.
    * **Обязательные поля:** `title`.
    * **Ключевое требование:** В объекте `promptData` должно присутствовать поле `user_id`, значение которого **должно** совпадать с ID текущего пользователя.
* **Успешный ответ:** Объект `JSON` с данными созданного промпта.
* **Пример вызова (`supabase-js`):**

```javascript
const { data, error } = await supabase
  .from('prompts')
  .insert([{ title: 'Новый промпт', user_id: user.id }])
  .select();
```


### 5.2. Получение списка своих промптов (READ - List)

* **Операция:** `select()`
* **Описание:** Возвращает массив всех промптов, принадлежащих текущему пользователю. Фильтрация по `user_id` происходит автоматически на уровне базы данных благодаря RLS.
* **Успешный ответ:** Массив объектов `JSON`.
* **Пример вызова (`supabase-js`):**

```javascript
const { data, error } = await supabase
  .from('prompts')
  .select('*')
  .order('created_at', { ascending: false });
```


### 5.3. Обновление промпта (UPDATE)

* **Операция:** `update()`
* **Описание:** Обновляет один или несколько полей существующего промпта. RLS разрешит операцию только если промпт принадлежит пользователю.
* **Параметры:** `id` промпта, который нужно обновить.
* **Тело запроса (`updateData`):** Объект `JSON` с полями для обновления.
* **Успешный ответ:** Массив с обновленным объектом.
* **Пример вызова (`supabase-js`):**

```javascript
const { data, error } = await supabase
  .from('prompts')
  .update({ title: 'Обновленный заголовок', is_favorite: true })
  .eq('id', promptId)
  .select();
```


### 5.4. Удаление промпта (DELETE)

* **Операция:** `delete()`
* **Описание:** Удаляет промпт. RLS разрешит операцию только если промпт принадлежит пользователю.
* **Параметры:** `id` промпта, который нужно удалить.
* **Успешный ответ:** `204 No Content` (клиент получит пустые `data` и `error`).
* **Пример вызова (`supabase-js`):**

```javascript
const { error } = await supabase
  .from('prompts')
  .delete()
  .eq('id', promptId);
```


### 5.5. Поиск по промптам (SEARCH)

* **Операция:** `rpc()` (вызов хранимой процедуры)
* **Описание:** Выполняет полнотекстовый поиск по ключевому слову в полях `title`, `description`, а также во вложенных `JSONB` полях `prompt_variants`.
* **Предварительное требование:** В базе данных должна быть создана следующая SQL-функция.

```sql
-- Этот код нужно один раз выполнить в SQL Editor в Supabase
CREATE OR REPLACE FUNCTION search_prompts(search_term TEXT)
RETURNS SETOF prompts AS $$
BEGIN
  RETURN QUERY
    SELECT DISTINCT ON (p.id) p.*
    FROM
      public.prompts p
    LEFT JOIN LATERAL jsonb_array_elements(p.prompt_variants) AS variant_element ON true
    WHERE
      -- Пользователь может искать только среди своих промптов
      p.user_id = auth.uid()
      AND (
        p.title ILIKE '%' || search_term || '%'
        OR p.description ILIKE '%' || search_term || '%'
        OR (variant_element -> 'content' ->> 'ru') ILIKE '%' || search_term || '%'
        OR (variant_element -> 'content' ->> 'en') ILIKE '%' || search_term || '%'
      );
END;
$$ LANGUAGE plpgsql;
```

* **Тело запроса:** Объект `JSON` с параметрами для функции.
* **Успешный ответ:** Массив `JSON` объектов найденных промптов.
* **Пример вызова (`supabase-js`):**

```javascript
const { data, error } = await supabase
  .rpc('search_prompts', { search_term: 'оптимизируй' });
```


## 6. Обработка ошибок

Клиентское приложение должно обрабатывать следующие коды ответов:

* `2xx` - Успех.
* `400 Bad Request` - Некорректные данные в запросе.
* `401 Unauthorized` - Пользователь не аутентифицирован или JWT-токен недействителен.
* `403 Forbidden` - Ошибка RLS. Пользователь пытается выполнить действие, на которое у него нет прав (например, удалить чужой промпт).
* `404 Not Found` - Запрашиваемый ресурс не найден.
* `5xx Server Error` - Ошибка на стороне сервера Supabase.
