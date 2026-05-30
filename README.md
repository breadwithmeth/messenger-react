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

## Рассылки и массовые операции

### Рассылка по шаблону через API (WABA)

Эндпоинт для массовой отправки WhatsApp шаблона:

`POST /api/waba/broadcast-template`

- Требует авторизацию (`authMiddleware`)
- Заголовок: `Authorization: Bearer <JWT_TOKEN>`
- Контент: `application/json`

Назначение: отправляет один шаблон сразу в список номеров (`recipients`) и сохраняет исходящие сообщения в БД.

#### Тело запроса

```json
{
  "organizationPhoneId": 1,
  "recipients": ["+7 (701) 111-22-33", "77021234567"],
  "templateName": "promo_offer_v1",
  "language": "ru",
  "components": [
    {
      "type": "body",
      "parameters": [
        { "type": "text", "text": "Иван" },
        { "type": "text", "text": "20%" }
      ]
    }
  ],
  "delayMs": 250,
  "dryRun": false
}
```

#### Поля

- `organizationPhoneId` (number, обязательно): ID WhatsApp-номера организации с `connectionType = "waba"`.
- `recipients` (array, обязательно): массив телефонов получателей.
- `templateName` (string, обязательно): имя одобренного шаблона в Meta.
- `language` (string, опционально, default: `"ru"`): язык шаблона.
- `components` (array, опционально): параметры шаблона. По умолчанию отправляется `[{"type":"body","parameters":[]}]`.
- `delayMs` (number, опционально, default: `250`): задержка между отправками в миллисекундах.
- `dryRun` (boolean, опционально, default: `false`): если `true`, реальная отправка в WABA не выполняется (проверка списка и формата).

#### Нормализация номеров

Перед отправкой каждый номер нормализуется: из строки удаляются все символы кроме цифр.

Примеры:

- `"+7 (701) 111-22-33"` → `"77011112233"`
- `"7-702-123-45-67"` → `"77021234567"`

Если после нормализации не осталось валидных номеров, вернется ошибка `400`.

#### Пример: dry run

```bash
curl -X POST "http://localhost:3000/api/waba/broadcast-template" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationPhoneId": 1,
    "recipients": ["+77011112233", "+77021234567"],
    "templateName": "promo_offer_v1",
    "language": "ru",
    "components": [{"type":"body","parameters":[]}],
    "delayMs": 100,
    "dryRun": true
  }'
```

#### Пример: реальная отправка

```bash
curl -X POST "http://localhost:3000/api/waba/broadcast-template" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationPhoneId": 1,
    "recipients": ["77011112233", "77021234567"],
    "templateName": "promo_offer_v1",
    "language": "ru",
    "components": [
      {
        "type": "body",
        "parameters": [
          {"type":"text","text":"Иван"},
          {"type":"text","text":"20%"}
        ]
      }
    ],
    "delayMs": 250,
    "dryRun": false
  }'
```

#### Успешный ответ

```json
{
  "success": true,
  "dryRun": false,
  "organizationPhoneId": 1,
  "templateName": "promo_offer_v1",
  "language": "ru",
  "totals": {
    "requested": 2,
    "normalized": 2,
    "success": 2,
    "fail": 0
  },
  "results": [
    { "to": "77011112233", "success": true, "messageId": "wamid.HBg..." },
    { "to": "77021234567", "success": true, "messageId": "wamid.HBg..." }
  ]
}
```

#### Частые ошибки

- `400`: `organizationPhoneId, recipients[] and templateName are required`
- `400`: `No valid recipients after phone normalization`
- `404`: `Organization phone not found or not configured for WABA`
- `500`: `WABA service not configured` (обычно не задан `wabaAccessToken` у номера)

#### Рекомендации перед рассылкой

1. Проверить доступные шаблоны: `GET /api/waba/templates`.
2. Сначала запускать с `dryRun: true`.
3. После dry-run отправлять с реальными `components`.
4. Для больших списков увеличивать `delayMs`, чтобы снизить риск лимитов у Meta.

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
