# Project Structure

Dynamic Admin Panel — multi-tenant SaaS platform with a Django REST API backend, Next.js 14 frontend, MongoDB (per-tenant), Redis, and Celery.

---

## Root

```
dynamic_admin/
├── docker-compose.yml      # Orchestrates all services (MongoDB, Redis, Backend, Celery, Frontend)
├── STRUCTURE.md            # This file
├── README.md               # Quick-start and credentials
├── backend/                # Django REST API
├── frontend/               # Next.js 14 App Router
└── nginx/                  # Nginx reverse-proxy config (production)
```

---

## Backend — `backend/`

```
backend/
├── Dockerfile              # python:3.11-slim, runs gunicorn in production
├── .env                    # Active env vars (SECRET_KEY, JWT lifetime, DB URIs …)
├── .env.example            # Template to copy from
├── requirements.txt        # All Python dependencies
├── manage.py               # Django CLI entry point
│
├── config/                 # Project-level Django config
│   ├── wsgi.py             # WSGI entry point for gunicorn
│   ├── urls.py             # Root URL router (mounts all app URLs under /api/v1/)
│   └── settings/
│       ├── base.py         # Shared settings: INSTALLED_APPS, JWT, CORS, Celery, logging
│       ├── development.py  # Extends base — DEBUG=True, CORS allow-all
│       └── production.py   # Extends base — security headers, SSL redirect disabled (nginx handles it)
│
└── apps/                   # All Django applications
    ├── auth_app/           # Authentication & user management
    ├── core/               # Company management, dashboard stats, tenant middleware
    ├── dynamic_forms/      # Form builder engine & runtime data API
    ├── integrations/       # Per-company Stripe, SendGrid, Twilio
    └── utils/              # Shared helpers: MongoDB client, encryption, exceptions
```

### `apps/auth_app/` — Authentication

| File | Purpose |
|------|---------|
| `models.py` | Custom `User` model (email login, roles: `super_admin / company_admin / developer / end_user`, `company_id` links to MongoDB company) |
| `serializers.py` | `UserSerializer`, `RegisterSerializer`, `LoginSerializer`, `ChangePasswordSerializer` |
| `views.py` | `login_view`, `register_view`, `logout_view` (blacklists JWT), `profile_view`, `change_password_view`, `users_list` (super admin only) |
| `urls.py` | Routes: `login/` `register/` `logout/` `refresh/` `profile/` `change-password/` `users/` |

### `apps/core/` — Companies & Dashboard

| File | Purpose |
|------|---------|
| `views.py` | `companies_list` (GET/POST), `company_detail` (GET/PUT/DELETE), `dashboard_stats` (platform-wide for super admin, tenant-specific for others) |
| `middleware.py` | `TenantMiddleware` — extracts subdomain from every request, looks up the company in MongoDB, attaches `request.tenant` and `request.tenant_db_name` |
| `urls.py` | Routes: `health/` `companies/` `companies/<id>/` `dashboard/` |
| `management/commands/create_superadmin.py` | One-off command — creates the initial super admin user; idempotent (skips if already exists). Auto-runs on Docker startup. |

### `apps/dynamic_forms/` — Form Engine

| File | Purpose |
|------|---------|
| `views.py` | **Config API:** `form_configs` (create/list form schemas in MongoDB), `form_config_detail` (fetch one schema for rendering). **Runtime API:** `form_records` (list/create records), `record_detail` (get/update/delete), `list_page_data` (fetches records with footer aggregations for list pages) |
| `urls.py` | Routes: `configs/` `configs/<form_name>/` `records/<form_name>/` `records/<form_name>/<id>/` `list-page/<page_name>/` |

**How forms work:**
1. Developer creates an *input form config* (POST `/api/v1/forms/configs/`) defining fields (label, type, validation).
2. Engine auto-creates a MongoDB collection `records_<form_name>` with indexes.
3. End users submit records via `/api/v1/forms/records/<form_name>/`.
4. Developer creates a *list page config* referencing the input form — configures visible columns, footer aggregations (sum/avg/min/max), sorting, filters.

### `apps/integrations/` — Per-Company External Services

| File | Purpose |
|------|---------|
| `company_credentials.py` | Fetches, encrypts, and decrypts per-company API keys stored in MongoDB |
| `payment.py` | Stripe & Razorpay — create payment intent, confirm, refund (uses company's own keys) |
| `email_service.py` | SendGrid / SMTP email sending |
| `sms_service.py` | Twilio SMS sending |
| `settings_views.py` | CRUD for a company's integration credentials (admin UI) |
| `views.py` | REST endpoints that proxy calls to the above services |
| `urls.py` | Routes: `payment/` `email/` `sms/` `status/` |

### `apps/utils/` — Shared Helpers

| File | Purpose |
|------|---------|
| `mongodb.py` | `MongoDBManager` singleton — `get_main_db()`, `get_tenant_db(db_name)`. Also: `MongoCollection` CRUD helper, `TransactionManager` for ACID billing transactions |
| `encryption.py` | Fernet symmetric encryption — used to store API keys in MongoDB securely |
| `exceptions.py` | DRF custom exception handler — normalises all errors to `{"error": "..."}` |

---

## Frontend — `frontend/`

```
frontend/
├── Dockerfile              # Node 18, builds Next.js and runs `next start`
├── next.config.js          # Next.js config
├── tailwind.config.ts      # Tailwind theme (extends default — no custom tokens)
├── tsconfig.json           # TypeScript config (@/ path alias → src/)
├── package.json            # All npm dependencies
│
└── src/
    ├── app/                # Next.js App Router — every folder = a URL route
    ├── components/         # Reusable UI components
    ├── hooks/              # Custom React hooks (empty — ready to add)
    ├── lib/                # API client and helpers
    ├── store/              # Zustand global state
    └── types/              # Shared TypeScript types
```

### `src/app/` — Screens (Pages)

```
app/
├── layout.tsx              # Root layout — wraps entire app with QueryProvider + ToastProvider
├── globals.css             # Global Tailwind base + component classes (.card, .btn-primary, .badge-*, etc.)
├── page.tsx                # Root route "/" — immediately redirects to /auth/login
│
├── auth/
│   └── login/
│       └── page.tsx        # SCREEN: Login page — split-screen (brand panel + form), JWT login, role-based redirect
│
├── super-admin/
│   ├── layout.tsx          # GUARD: checks JWT expiry via jwt-decode, redirects to login if invalid or wrong role
│   ├── dashboard/
│   │   └── page.tsx        # SCREEN: Platform dashboard — greeting, 4 stat cards, area/bar charts, recent companies table, quick actions
│   ├── companies/
│   │   └── page.tsx        # SCREEN: Companies list — grid cards, search, create modal, deactivate
│   ├── users/
│   │   └── page.tsx        # SCREEN: Users list — summary cards, search + role filter, full table with status/joined/last-login
│   └── settings/
│       └── page.tsx        # SCREEN: Super admin profile & security settings
│
└── settings/
    └── integrations/
        └── page.tsx        # SCREEN: Global integrations config (Stripe, SendGrid, Twilio keys per company)
```

> **Route groups:** The `(super-admin)` folder is a Next.js route group (no URL segment). The actual URL routes live under `super-admin/`.

### `src/components/` — Reusable Components

```
components/
├── layout/
│   └── Sidebar.tsx         # COMPONENT: Left nav — logo, nav links with active dot indicator,
│                           #   section labels, user avatar footer, sign-out on hover
│
├── providers/
│   ├── QueryProvider.tsx   # COMPONENT: Wraps app in TanStack Query client
│   └── ToastProvider.tsx   # COMPONENT: Wraps app in react-toastify ToastContainer
│
├── companies/
│   └── CreateCompanyModal.tsx  # COMPONENT: Modal form — create a new tenant company (name, subdomain, plan)
│
├── builder/
│   └── FormBuilder.tsx     # COMPONENT: Drag-and-drop form builder UI (developer panel — add/reorder/configure fields)
│
└── runtime/
    ├── DynamicForm.tsx     # COMPONENT: Renders any form config at runtime — generates inputs from field schema
    └── DynamicList.tsx     # COMPONENT: Renders a list page config — table with pagination, footer aggregations, row actions
```

### `src/lib/` — API Client

| File | Purpose |
|------|---------|
| `api.ts` | Axios instance (`baseURL = NEXT_PUBLIC_API_URL/api/v1`). **Interceptors:** attaches `Bearer` token from localStorage on every request; auto-refreshes on 401, redirects to login if refresh fails. Exports: `authAPI`, `companiesAPI`, `dashboardAPI`, `formsAPI`, `integrationsAPI` |
| `integrations-api.ts` | Additional typed helpers for the integrations endpoints |

### `src/store/` — Global State

| File | Purpose |
|------|---------|
| `auth.ts` | Zustand store persisted to localStorage (`auth-storage`). Holds: `user`, `accessToken`, `refreshToken`, `isAuthenticated`. Methods: `login()`, `logout()`, `updateUser()`. Also exports `useIsSessionValid()` — decodes JWT with `jwt-decode` and checks `exp` timestamp (considers it expired 60 s before actual expiry). |

### `src/types/` — TypeScript Types

| File | Exports |
|------|---------|
| `index.ts` | `User`, `UserRole`, `Company`, `FormField`, `FieldType`, `InputFormConfig`, `ListPageConfig`, `AuthTokens`, `AuthState`, `SuperAdminStats`, `TenantStats`, `AuditLog`, `PaymentIntent`, `PaginatedResponse`, `ApiError` |

---

## Key Data Flows

### Login & Session
```
User → POST /api/v1/auth/login/
     ← { access, refresh, user }
     → stored in Zustand (persisted to localStorage)
     → useIsSessionValid() decodes JWT exp on every protected page load
     → if expired → logout() + redirect /auth/login
```

### Multi-Tenancy
```
Request hits backend
  → TenantMiddleware extracts subdomain from Host header
  → looks up company in MongoDB main DB by subdomain
  → attaches request.tenant_db_name
  → views call get_tenant_db(request.tenant_db_name) for isolated data
```

### Dynamic Forms
```
Developer: POST /api/v1/forms/configs/   → saves schema to tenant MongoDB
                                          → auto-creates records_<form_name> collection
End User:  POST /api/v1/forms/records/<form_name>/  → validates against schema → inserts record
           GET  /api/v1/forms/records/<form_name>/  → paginated list with search/sort/filter
           GET  /api/v1/forms/list-page/<page_name>/ → pre-aggregated list with footer totals
```

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/login/` | None | Login, returns JWT pair |
| POST | `/api/v1/auth/register/` | None | Register user |
| POST | `/api/v1/auth/logout/` | JWT | Blacklist refresh token |
| POST | `/api/v1/auth/refresh/` | None | Refresh access token |
| GET/PUT | `/api/v1/auth/profile/` | JWT | Get/update own profile |
| POST | `/api/v1/auth/change-password/` | JWT | Change password |
| GET | `/api/v1/auth/users/` | Super admin | List all platform users |
| GET | `/api/v1/core/health/` | None | Health check |
| GET/POST | `/api/v1/core/companies/` | Super admin | List / create companies |
| GET/PUT/DELETE | `/api/v1/core/companies/<id>/` | Super admin | Company detail / deactivate |
| GET | `/api/v1/core/dashboard/` | JWT | Platform or tenant stats |
| GET/POST | `/api/v1/forms/configs/` | JWT | List / create form configs |
| GET | `/api/v1/forms/configs/<form_name>/` | JWT | Get one form config |
| GET/POST | `/api/v1/forms/records/<form_name>/` | JWT | List / create records |
| GET/PUT/DELETE | `/api/v1/forms/records/<form_name>/<id>/` | JWT | Record detail |
| GET | `/api/v1/forms/list-page/<page_name>/` | JWT | List page with aggregations |
| POST | `/api/v1/integrations/payment/create-intent/` | JWT | Create payment intent |
| POST | `/api/v1/integrations/email/send/` | JWT | Send email |
| POST | `/api/v1/integrations/sms/send/` | JWT | Send SMS |
| GET | `/api/v1/integrations/status/` | JWT | Integration health |

---

## Environment Variables (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Django secret key |
| `DEBUG` | `True` in dev, `False` in prod |
| `ALLOWED_HOSTS` | Comma-separated allowed hosts |
| `ENCRYPTION_KEY` | Fernet key for encrypting company API keys in MongoDB |
| `MONGO_URI` | MongoDB connection URI |
| `MONGO_MAIN_DB` | Main database name (companies, users) |
| `REDIS_URL` | Redis URL for Celery broker & result backend |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | Access token lifetime (default: 1440 = 24 h) |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS` | Refresh token lifetime (default: 30 days) |
| `BASE_DOMAIN` | Root domain (e.g. `yourapp.com`) — used for subdomain resolution |
| `FRONTEND_URL` | Frontend base URL for CORS and email links |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins allowed by CORS |
| `DEFAULT_FROM_EMAIL` | Platform fallback sender email |

---

## Docker Services (`docker-compose.yml`)

| Service | Image / Build | Port | Role |
|---------|--------------|------|------|
| `mongodb` | `mongo:7.0` | 27017 | Primary database — main DB + per-tenant DBs |
| `redis` | `redis:7.2-alpine` | 6379 | Celery broker + result backend |
| `backend` | `./backend/Dockerfile` | 8000 | Django + gunicorn (3 workers) |
| `celery_worker` | same Dockerfile | — | Async task worker (concurrency=2) |
| `frontend` | `./frontend/Dockerfile` | 3000 | Next.js production server |

**Backend startup sequence:**
```
makemigrations auth_app → migrate → create_superadmin → collectstatic → gunicorn
```

**Default super admin credentials:**
```
Email:    admin@dynamicadmin.com
Password: Admin@123
```
