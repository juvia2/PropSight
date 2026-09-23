# PropSight architecture

PropSight separates application assembly, feature orchestration, presentation, and external integrations so each area can change without growing a single central file.

## Frontend

```text
src/
├── App.jsx                         # authentication boundary
├── Dashboard.jsx                   # dashboard state and feature composition
├── components/                     # dashboard presentation components
├── hooks/
│   ├── useRecords.js               # record API and editing state
│   └── useKakaoMap.js              # Kakao map and drawing lifecycle
├── features/public-data/           # public-data formatting and result UI
├── api.js                          # authenticated HTTP adapter
├── PublicData.jsx                  # public-data lookup workflow
├── Attachments.jsx                 # attachment workflow
├── MemoEditor.jsx                  # memo editing
└── MemoHistory.jsx                 # revision history
```

`App` owns the login boundary. `Dashboard` composes the page and passes event handlers to components. Components render the interface and do not call record APIs. Hooks own remote record state and the Kakao SDK lifecycle. Service-specific data conversion stays in the related feature directory.

## Backend

```text
backend/
├── main.py             # FastAPI assembly, middleware, health, static hosting
├── migrations.py       # startup schema initialization and compatibility migrations
├── schemas.py          # request validation
├── records.py          # property and commercial-block HTTP routes
├── auth.py             # login, sessions, users, teams
├── attachments.py      # attachment routes and storage rules
├── public_data.py      # VWorld and public-data integrations
├── visibility.py       # development-only team visibility rules
├── models.py           # SQLAlchemy persistence models
├── database.py         # engine and session lifecycle
└── deployment.py       # deployment configuration
```

`main.py` only assembles the application. Route modules own HTTP behavior, schemas own input validation, models own persistence shape, and integrations stay behind their feature routes. Startup database work is isolated from request handling.

`severcheckup` is a development/demo-only team. The default record collection
scope excludes that team’s properties and commercial blocks. A request that
explicitly supplies its `team_id` opts into the sandbox, and the dashboard
labels that option as `시현 전용` so it cannot be mistaken for shared data.

## Dependency rules

1. Presentation components receive data and callbacks through props.
2. Frontend network calls go through `api.js` or a feature hook.
3. Kakao SDK objects stay inside the map hook; consumers use its functions.
4. FastAPI route modules may depend on schemas, models, and services. Models never depend on routes.
5. Secrets are read from environment files or host environment variables and are never committed.
