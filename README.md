# AIPrompts API

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Live API](https://img.shields.io/badge/Live%20API-aipromptsapi.vercel.app-blue)](https://aipromptsapi.vercel.app/)
[![Hosted on](https://img.shields.io/badge/Hosted%20on-Vercel-black.svg?logo=vercel)](https://vercel.com)

Бэкенд-сервис для проекта **AIPrompts KMP**. Реализован в виде набора бессерверных функций на платформе Vercel.

## 🚀 О Проекте

**AIPrompts API** — это независимый бэкенд-компонент, который выполняет роль безопасного API-шлюза. Он принимает запросы от клиентских приложений (Android, Desktop, Web) и выполняет привилегированные операции с API GitHub, такие как создание Issues для модерации новых промптов.

Этот сервис является частью более крупной экосистемы **AIPrompts KMP**:
*   **Клиентское приложение (KMP):** [github.com/arnyigor/aipromptskmp](https://github.com/arnyigor/aipromptskmp)
*   **Основной репозиторий с данными:** [github.com/arnyigor/aiprompts](https://github.com/arnyigor/aiprompts)

## 🛠️ Архитектура и Функциональность

Сервис построен на бессерверной архитектуре Vercel, где каждый файл в папке `/api` становится отдельным API-эндпоинтом.

**Базовый URL (Production):** `https://aipromptsapi.vercel.app`

### Доступные API Эндпоинты

Полные URL эндпоинтов формируются путем добавления пути к базовому URL. Например: `https://aipromptsapi.vercel.app/api/create-prompt-issue`.

#### 1. `POST /api/create-prompt-issue`
*   **Назначение:** Принимает структурированные данные о новом промпте и создает на их основе Issue в основном репозитории проекта.
*   **Запрос:** `Content-Type: application/json`. Тело запроса должно соответствовать полной структуре промпта.
*   **Ответ (успех):** `201 Created` с информацией о созданном Issue.
*   **Ответ (ошибка):** `400`, `405`, `500` с описанием ошибки.
*   **Подробная спецификация:** [docs/BACKEND_TECHNICAL_SPECIFICATION.md](./docs/BACKEND_TECHNICAL_SPECIFICATION.md)

#### 2. `POST /api/feedback`
*   **Назначение:** Принимает обратную связь от пользователей и отправляет уведомление в Telegram.
*   **Запрос:** `Content-Type: application/json`. Тело запроса содержит тип обратной связи и сообщение.
*   **Ответ (успех):** `200 OK`.

## ⚙️ Настройка и Запуск

### Предварительные требования
*   Node.js (версия 18.x или выше)
*   npm или yarn
*   Vercel CLI (для локального тестирования)

### Переменные Окружения
Для работы сервиса необходимо создать файл `.env` в корне проекта (или настроить переменные в UI Vercel) со следующими значениями:

```env
# Для работы с GitHub API
GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
GITHUB_REPO_OWNER="arnyigor"
GITHUB_REPO_NAME="aiprompts"

# Для уведомлений в Telegram (feedback)
TELEGRAM_BOT_TOKEN="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
TELEGRAM_CHAT_ID="-1001234567890"
```

### Локальный Запуск
1.  Клонируйте репозиторий:
    ```bash
    git clone https://github.com/arnyigor/aiprompts-api.git
    cd aiprompts-api
    ```
2.  Установите зависимости:
    ```bash
    npm install
    ```
3.  Запустите локальный сервер Vercel:
    ```bash
    vercel dev
    ```
    Сервис будет доступен по адресу `http://localhost:3000`.

## 🚀 Развертывание (Deployment)

Развертывание происходит **автоматически** при каждом коммите в ветку `main`. Проект на Vercel должен быть связан с этим GitHub-репозиторием. Актуальная развернутая версия доступна по адресу: [https://aipromptsapi.vercel.app](https://aipromptsapi.vercel.app).

## 📄 Документация

Вся детальная техническая информация, включая контракты API, структуры данных и логику работы, находится в Техническом Задании:
*   **[Техническое Задание на Бэкенд](./docs/BACKEND_TECHNICAL_SPECIFICATION.md)**

## 🤝 Вклад в Проект

Если вы хотите внести свой вклад, пожалуйста, создайте Issue для обсуждения ваших предложений перед началом работы.

## 📄 Лицензия

Этот проект распространяется под лицензией MIT.```