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

## Звонки (WebRTC / SIP)

Мини-окно звонка на странице чатов использует SIP over WebSocket (JsSIP). URL-адреса по умолчанию зашиты в код (как в вашем примере), в интерфейсе нужно ввести только **логин** и **пароль** SIP.

Если нужно переопределить (необязательно), добавьте в `.env.local`:

```bash
VITE_SIP_WS_SERVER_URL=wss://your-host:8089/asterisk/ws
VITE_SIP_DOMAIN=your-host
VITE_SIP_URI_PREFIX=sip
```

После этого в виджете:
- `Логин SIP` (например `100`)
- `Пароль`
- и номер для звонка

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

## Почему на перезагрузке бывает 404

В приложении используется React Router `BrowserRouter`. При переходах внутри приложения роутинг работает на клиенте, но при **прямом открытии / перезагрузке** URL вроде `/chats` браузер делает запрос к серверу, и сервер должен вернуть `index.html`, чтобы роутер обработал путь.

В Docker-образе это решено конфигурацией Nginx с `try_files ... /index.html` (см. `nginx.conf`).
