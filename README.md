# Dynamic Multi-Tenant Admin Panel

A production-ready, scalable admin panel built with **Next.js + Django + MongoDB**, featuring:

- 🏢 **Multi-tenant architecture** — separate database per company
- 🔧 **Dynamic form builder** — create forms & list pages visually
- 🔐 **JWT authentication** with role-based access control
- 💳 **Stripe** payment gateway integration
- 📧 **SendGrid** email service
- 📱 **Twilio** SMS integration
- 🐳 **Docker Compose** for local and production deployment

---

## Quick Start

### 1. Clone & Configure

```bash
# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

Edit both `.env` files with your credentials.

### 2. Run with Docker Compose

```bash
docker-compose up -d
```

Services will be available at:
- **Frontend** → http://localhost:3000
- **Backend API** → http://localhost:8000/api/v1/
- **Django Admin** → http://localhost:8000/django-admin/
- **MongoDB** → localhost:27017
- **Redis** → localhost:6379

### 3. Create Super Admin

```bash
docker exec -it dynamic_admin_backend python manage.py createsuperuser
```

---

## Development (without Docker)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # Configure your .env
python manage.py migrate
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # Configure your .env.local
npm run dev
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Nginx (Reverse Proxy)                     │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
        ┌──────▼──────┐           ┌───────▼──────┐
        │  Next.js    │           │    Django     │
        │  Frontend   │           │    Backend    │
        └─────────────┘           └───────┬──────┘
                                          │ Tenant Middleware
                                   ┌──────▼──────────────┐
                                   │  MongoDB             │
                                   │  ├── main_db         │
                                   │  ├── tenant_acme     │
                                   │  ├── tenant_corp     │
                                   │  └── tenant_xyz      │
                                   └──────────────────────┘
```

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login/` | User login |
| POST | `/api/v1/auth/register/` | User registration |
| POST | `/api/v1/auth/logout/` | Logout (blacklist token) |
| POST | `/api/v1/auth/refresh/` | Refresh JWT token |
| GET/PUT | `/api/v1/auth/profile/` | Get/update profile |

### Company Management (Super Admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/core/companies/` | List all companies |
| POST | `/api/v1/core/companies/` | Create company |
| GET/PUT/DELETE | `/api/v1/core/companies/{id}/` | Manage company |

### Dynamic Forms (Developer)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/v1/forms/configs/` | List/create form configs |
| GET | `/api/v1/forms/configs/{form_name}/` | Get form config |
| GET/POST | `/api/v1/forms/records/{form_name}/` | List/create records |
| GET/PUT/DELETE | `/api/v1/forms/records/{form_name}/{id}/` | Manage record |
| GET | `/api/v1/forms/list-page/{page_name}/` | Get list page data |

### Integrations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/integrations/payment/create-intent/` | Create Stripe payment |
| POST | `/api/v1/integrations/payment/webhook/` | Stripe webhook |
| POST | `/api/v1/integrations/email/send/` | Send email |
| POST | `/api/v1/integrations/sms/send/` | Send SMS |

## User Roles

| Role | Access |
|------|--------|
| `super_admin` | Full platform control, manage companies & users |
| `company_admin` | Manage their company, create developers |
| `developer` | Build forms and list pages |
| `end_user` | Use runtime forms, view data |

## Form Field Types

`text` `number` `email` `phone` `date` `datetime` `select` `multi_select`
`checkbox` `radio` `textarea` `file` `image` `currency` `percentage`
`url` `color` `rating` `switch` `hidden` `formula` `relation`

## Production Deployment

### Vercel (Frontend)
```bash
cd frontend
vercel --prod
```

### AWS / DigitalOcean (Backend + MongoDB)
1. Set up a server with Docker
2. Configure DNS wildcard `*.infinitroot.com → server IP`
3. Add SSL certificates to `nginx/ssl/`
4. Run `docker-compose -f docker-compose.prod.yml up -d`

### MongoDB Atlas
Replace `MONGO_URI` with your Atlas connection string.

---

## License
MIT


Credentials: admin@dynamicadmin.com / Admin@123 
Super-admin layout — frontend/src/app/super-admin/layout.tsx                                                                               
  - Wraps all /super-admin/* pages with the Sidebar                                                                                             
  - Guards: redirects to /auth/login if unauthenticated or non-super-admin                                                                      
                                     