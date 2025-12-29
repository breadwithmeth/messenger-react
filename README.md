# SaaS Messenger

Production-ready React приложение для омниканальных чатов с TypeScript и feature-based архитектурой.

## Технологический стек

- React 18
- TypeScript
- Vite
- React Router v6
- CSS Modules
- Fetch API

## Архитектура

Проект построен на feature-based архитектуре с четким разделением слоев:

```
src/
├── app/              # Конфигурация приложения
├── pages/            # Страницы приложения
├── features/         # Бизнес-функции
├── shared/           # Переиспользуемый код
│   ├── ui/          # UI компоненты
│   ├── api/         # API клиент
│   ├── hooks/       # Хуки
│   └── utils/       # Утилиты
```

## Установка

```bash
npm install
```

## Запуск

```bash
npm run dev
```

Приложение откроется на `http://localhost:3000`

## Сборка

```bash
npm run build
```

## Проверка типов

```bash
npm run lint
```

## API

Backend: `https://bm.drawbridge.kz/api`

### Эндпоинты

**POST** `/auth/login`
- Body: `{ "email": "user@example.com", "password": "secret" }`
- Response: `{ "token": "...", "user": { "id": 1, "email": "..." } }`

**GET** `/chats`
- Headers: `Authorization: Bearer {token}`
- Response: `Chat[]`

## Функционал

- Строгая типизация TypeScript
- Авторизация с JWT
- Защищенные роуты
- Feature-based архитектура
- Валидация форм
- Обработка ошибок API
- Loading/Error состояния
- CSS Modules для изоляции стилей
- Переиспользуемые UI компоненты

## Страницы

- `/login` - Авторизация
- `/` - Dashboard
- `/chats` - Список чатов (CRUD)
- `/404` - Not Found
