# CHANGELOG
**MUSEngage - Student Engagement Web Portal**

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] - 2025-10-22

### 🔒 **Security Hardening Release** (PR #151)
**Major security enhancements - Production-ready security posture**

#### Added
- **SlowAPI Rate Limiting System**
  - Redis-backed with in-memory fallback
  - OTP request endpoint: 3 requests / 5 minutes per IP
  - OTP verification: 5 attempts / 15 minutes per IP
  - Credential checking: 5 attempts / 15 minutes per IP  
  - User registration: 3 requests / hour per IP
  - File uploads: 10 uploads / hour per authenticated user
  - Global default: 100 requests / 15 minutes per IP
  - Comprehensive rate limit violation logging
  
- **Account Lockout Protection**
  - Automatic lockout after 5 consecutive failed login attempts
  - 30-minute lockout duration (configurable)
  - Email notifications for account lockouts
  - Admin unlock capability: `POST /api/admin/unlock-account/{user_id}`
  - Failed attempt tracking per email address
  - Automatic unlock after timeout period

- **Enhanced OTP System**
  - Increased OTP length: 6 → 8 characters
  - Character set: alphanumeric (A-Z, a-z, 0-9)
  - Excluded ambiguous characters: 0, O, 1, l, I
  - Single-use verification (OTP deleted after use)
  - Extended TTL: 2 → 5 minutes
  - Maximum 5 verification attempts per OTP
  - Automatic OTP locking after max attempts

- **Strong Password Policy**
  - Minimum length: 12 characters (enforced)
  - Complexity requirements:
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character `!@#$%^&*()_+-=[]{}|;:,.<>?`
  - Common password blacklist
  - Clear validation error messages
  - Bcrypt work factor increased: default → 14
  - Configurable via `BCRYPT_ROUNDS` environment variable
  - Automatic password rehashing on login if work factor updated

- **Email Verification System**
  - Restricted registration to Murdoch University student emails
  - Required pattern: `12345678@student.murdoch.edu.au`
  - Verification link with 24-hour expiration
  - Email verification required before first login
  - New endpoints:
    - `POST /api/auth/verify-email` - Verify email with token
    - `POST /api/auth/resend-verification` - Resend verification link
  - Frontend `/verify-email` page
  - Database schema additions:
    - `email_verified` boolean field
    - `verification_token` string field
    - `verification_token_expires` datetime field

- **Comprehensive File Upload Validation**
  - Maximum file size: 10MB (10,485,760 bytes) enforced server-side
  - Allowed MIME types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
  - Magic number validation using `filetype` library (not extension-based)
  - Image dimension validation: max 4096×4096 pixels using PIL/Pillow
  - Filename sanitization:
    - Path traversal prevention (`../` removal)
    - Special character stripping
    - UUID-based unique filename generation
    - Maximum filename length: 255 characters
  - Security logging for all upload failures
  - Guest user upload blocking
  - Frontend validation matches backend (10MB limit)

- **CSRF Protection (Cross-Site Request Forgery)**
  - Token generation endpoint: `GET /api/csrf-token`
  - Secure cookie storage (`HttpOnly=False` for JavaScript access)
  - Automatic validation on state-changing operations (POST, PUT, PATCH, DELETE)
  - Safe methods exempted: GET, HEAD, OPTIONS
  - Frontend axios integration with automatic `X-CSRF-Token` header
  - Configurable secret key via `CSRF_SECRET_KEY` environment variable
  - Custom error handler with security event logging
  - `fastapi-csrf-protect` library integration

- **Security Headers Middleware**
  - `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
  - `X-Frame-Options: DENY` - Clickjacking protection
  - `X-XSS-Protection: 1; mode=block` - XSS filter activation
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` - HTTPS enforcement (HTTPS only)
  - `Referrer-Policy: strict-origin-when-cross-origin` - Privacy protection
  - `Permissions-Policy: geolocation=(), microphone=(), camera=()` - Feature policy
  - Content Security Policy (CSP) with configurable directives
  - Applied globally via custom middleware

- **Production Security Configuration**
  - DEBUG mode properly disabled in production
  - Environment-based configuration: `ENVIRONMENT=production|development|staging`
  - Runtime validation prevents accidental debug mode in production
  - Custom generic error handler (prevents stack trace exposure)
  - Detailed error logging (server-side only, no client exposure)
  - Security event logging system with dedicated logger

#### Changed
- `.env` file now properly excluded via `.gitignore`
- All authentication endpoints include rate limiting
- File upload endpoint requires authentication and strict validation
- CORS settings: `allow_methods=["*"]` maintained (needs future review)
- Cookie settings: `SameSite=lax` for production (configurable)
- Password hashing: bcrypt rounds increased from ~10-12 to 14
- Registration endpoint requires student email format validation

#### Fixed
- **Critical**: Path traversal vulnerability in file upload
- **Critical**: Unrestricted file upload (size, type, dimensions)
- **High**: Missing CSRF protection on state-changing operations
- **High**: Weak OTP implementation vulnerable to brute force
- **High**: Insufficient password complexity requirements
- **High**: Missing account lockout mechanism
- **Medium**: Information disclosure via debug mode in production
- **Medium**: Missing security headers
- **Medium**: Filename sanitization in file uploads
- **Low**: Guest users able to upload files

#### Security Dependencies Added
```bash
slowapi==0.1.9              # Rate limiting
redis==5.0.1                # Distributed rate limit storage
fastapi-csrf-protect==0.3.4 # CSRF protection
python-magic==0.4.27        # File type validation
pillow==10.2.0              # Image validation
```

#### Security Notes
- ⚠️ **CRITICAL ISSUE REMAINING**: Old `.env` file with exposed secrets still exists in git history
  - Affects all commits prior to d437ab6125dcc258263da910998d11846d89b8f5
  - Exposed credentials:
    - MongoDB credentials (local + Atlas)
    - Stripe secret key
    - Google API key (Gemini)
    - Azure Blob Storage connection string
    - Azure Embedding API key
    - Email SMTP password
    - JWT secret
    - VAPID public/private keys
  - **Required Actions**:
    1. Clean git history using `git filter-repo` or BFG Repo-Cleaner
    2. Rotate ALL exposed credentials immediately
    3. Force push cleaned repository

---

## [2.0.0] - 2025-10-22

### 🎨 **UI/UX Enhancement Release** (PR #150)

#### Added
- **Dark Mode Theme Support**
  - System preference auto-detection
  - Manual theme toggle switch
  - Persistent theme selection using `localStorage`
  - Smooth CSS transitions between light/dark modes
  - Gradient backgrounds for hero sections replacing static images
  - Theme-aware component styling across all pages
  - `ThemeProvider` React context for global theme management
  - Custom MUI theme configuration for both modes

#### Changed
- Hero banner backgrounds now use CSS gradients by default
- Color palette optimized for:
  - WCAG 2.1 Level AA contrast ratios
  - Both light and dark mode readability
- Updated all Material-UI components for theme compatibility
- Improved visual hierarchy with theme-aware shadows

---

## [1.9.0] - 2025-10-22

### 📊 **Analytics Dashboard** (PR #143-149)

#### Added (PR #143)
- **Comprehensive Admin Analytics Dashboard** (`/analytics` route)
  - Privacy-first engagement metrics (no PII exposure)
  - Responsive Recharts-based SVG visualizations
  - Mobile and desktop optimized layouts
  - CSV/PDF export functionality
  - Time period selectors:
    - Current month
    - Past 3 months
    - Past 6 months
    - Past 12 months
    - Custom date range (month selector)
  
- **Analytics Metrics Tracked**:
  - Total events created
  - Total RSVPs
  - Active users count
  - Tag popularity distribution
  - Monthly time-series data
  - Category distribution
  - Event creation trends
  - User growth over time
  - Popular days of the week
  - Popular hours of the day

- **Analytics API**
  - New endpoint: `GET /api/analytics/dashboard`
  - Query parameters:
    - `range`: `current_month|past_3_months|past_6_months|past_year|custom`
    - `startMonth`: `YYYY-MM` (required when `range=custom`)
    - `endMonth`: `YYYY-MM` (required when `range=custom`)
  - Admin-only access control
  - 5-minute in-memory caching for performance
  - Aggregated counts only (privacy-preserving)
  - Backend: `backend/src/analytics.py` module

#### Changed (PR #148)
- Removed unused analytics chart components for cleaner UI
- Optimized tag popularity chart refresh mechanism
- Streamlined dashboard layout

#### Fixed (PR #145, #146)
- MUI Grid API compatibility for v7 (migrated to `size` prop)
- Analytics dashboard grid responsiveness
- Admin dependency injection on analytics endpoint

---

## [1.8.0] - 2025-10-22

### ✨ **Feature Additions**

#### Added (PR #147)
- **Poll Reward Points System**
  - Configurable reward points per poll
  - Automatic points award on poll completion
  - Admin control over poll reward amounts
  - Database field: `rewardPoints` in polls collection
  - Backend validation for reward point values
  - Competition formatting preserved during updates

#### Changed (PR #142)
- **Access Control Updates**
  - Students can now access QR Scanner page (`/qr-scanner`)
  - Students can now access PASS Scanner (`/pass-scanner`)
  - Students can now access RSVP Scanner for event check-ins
  - Updated route guards in `App.tsx`
  - Role-based component rendering updated

#### Added (PR #141)
- **Public Self-Service Registration**
  - New endpoint: `POST /api/auth/register`
  - Public-facing student registration
  - Automatic `student` role assignment
  - Updated signup form UI to use new endpoint
  - Removed admin requirement for student account creation

---

## [1.7.0] - 2025-10-21

### 🔐 **Authentication Consistency** (PR #140)

#### Changed
- Mirrored backend authentication restrictions to staging environment
- Synchronized auth logic across `backend/` and `backend_staging/`
- Consistent role-based access control (RBAC) enforcement
- Unified session management across environments

---

## [1.6.0] - 2025-10-20 (Estimated)

### **Push Notifications & Real-time Features**

#### Added
- **Web Push Notifications**
  - Service worker registration (`frontend/public/service-worker.js`)
  - VAPID key-based authentication
  - Push subscription management
  - Notification types:
    - `EVENT_CREATED` - New event announcements
    - `POLL_FINALIZED` - Poll results ready
    - `FEEDBACK_SUBMITTED` - Feedback acknowledgment
    - `POST_REJECTED` - Community post moderation result
    - `ADMIN_BROADCAST` - Admin announcements
  - Backend: `NotificationsDAL`, `PushSubscriptionDAL`
  - Frontend: `NotificationContext` provider

- **Offline Support**
  - Service worker caching strategies:
    - App shell caching
    - API response caching
    - Runtime caching for assets
  - Network-first strategy for API calls
  - Cache-first strategy for static assets
  - Fallback to cached content when offline
  - `useOnlineStatus` React hook

---

## [1.5.0] - 2025-10-18 (Estimated)

### **Engagement Features**

#### Added
- **Event Management System**
  - CRUD operations for events
  - Event RSVP functionality
  - QR code generation for event check-ins
  - RSVP reward points system
  - Event recommendations based on user interests
  - AI-powered content-based recommendations using Azure embeddings
  - Event tagging system (max 5 tags per event)
  - Event likes/favorites
  - Admin event creation and management UI

- **Reward System**
  - Reward points for various activities:
    - Event attendance (RSVP + check-in)
    - Poll participation
    - Feedback submission
    - Community engagement
  - Rewards catalog with redemption
  - Admin reward management
  - Point balance tracking

- **Community Posts**
  - User-generated content platform
  - AI-powered content moderation using Google Gemini
  - Post moderation queue for admins
  - Approve/reject workflow
  - Post flair system
  - Image attachments support
  - Comment system
  - Like/voting system

---

## [1.4.0] - 2025-10-15 (Estimated)

### **Interactive Features**

#### Added
- **Polls System**
  - Create polls with multiple options
  - Vote tracking per user
  - Poll finalization
  - Results visualization
  - Reward points for participation
  - Admin poll management
  - Anonymous voting support

- **Competitions System**
  - Competition creation and management
  - User submissions
  - Winner selection
  - Prize distribution
  - Image-based competitions
  - Submission gallery

- **Feedback System**
  - Anonymous feedback submission
  - Feedback categorization
  - Admin review interface
  - Status tracking: `pending|reviewed|resolved`
  - Response mechanism

---

## [1.3.0] - 2025-10-12 (Estimated)

### **Shop & Commerce**

#### Added
- **E-commerce Integration**
  - Stripe payment integration
  - Product catalog (shop items)
  - Shopping cart functionality
  - Checkout flow
  - Order history
  - Admin product management
  - Image uploads for products

- **PASS (Peer Assisted Study Sessions)**
  - PASS session scheduling
  - CSV import for bulk session creation
  - QR code-based attendance tracking
  - Session management for educators
  - Student session browsing
  - Attendance reporting

---

## [1.2.0] - 2025-10-08 (Estimated)

### **Dashboard & User Experience**

#### Added
- **Student Dashboard**
  - Personalized event recommendations
  - Upcoming events feed
  - Reward points display
  - Quick access to:
    - Liked events
    - Registered events (RSVPs)
    - Available polls
    - Active competitions
  - Activity feed

- **User Account Management**
  - Profile page (`/account`)
  - Profile image upload and management
  - Name update functionality
  - Avatar generation with initials
  - Account settings

---

## [1.1.0] - 2025-10-05 (Estimated)

### **Authentication & Authorization**

#### Added
- **Authentication System**
  - Email + OTP (One-Time Password) authentication
  - Session management with JWT tokens
  - Refresh token mechanism
  - HttpOnly cookies for token storage
  - Role-based access control (RBAC):
    - `student` role
    - `admin` role
    - `guest` role
  - Email OTP delivery via SMTP (Gmail)
  - OTP verification flow

- **User Management**
  - User registration
  - User login
  - User profile
  - Admin user management interface
  - User debugging tools (development)

---

## [1.0.0] - 2024-08-28

### 🎉 **Initial Release**
**Project creation and foundation setup**

#### Added
- **Project Infrastructure**
  - Docker Compose multi-container setup:
    - Frontend container (Node.js/Vite)
    - Backend container (FastAPI/Python)
    - Nginx reverse proxy
    - MongoDB database container
  - Git repository initialization
  - MIT License
  - README documentation

- **Backend Foundation**
  - FastAPI web framework setup
  - MongoDB Motor async driver
  - Database connection management
  - Environment variable configuration
  - Basic API structure

- **Frontend Foundation**
  - React 18 with TypeScript
  - Vite build tool and dev server
  - React Router for navigation
  - Material-UI component library
  - Axios HTTP client
  - Basic app structure and routing

- **Development Environment**
  - Docker containerization
  - Hot module replacement (HMR)
  - Development vs production configurations
  - Nginx reverse proxy configuration
  - MongoDB local development setup

- **Repository Structure**
```
├── backend/
│   ├── src/
│   ├── nginx/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── compose.yaml
├── LICENSE
└── README.md
```

---

## Project Metadata

### Repository Information
- **Created**: 2024-08-28 (55 days ago)
- **Owner**: [@Aithusa712](https://github.com/Aithusa712)
- **License**: MIT License
- **Primary Language**: TypeScript
- **Visibility**: Private
- **Default Branch**: `dev`

### Tech Stack

#### Backend
- **Framework**: FastAPI (Python)
- **Database**: MongoDB (Motor async driver)
- **Authentication**: JWT, bcrypt
- **File Storage**: Azure Blob Storage
- **Payments**: Stripe
- **AI/ML**: 
  - Google Gemini API (content moderation)
  - Azure OpenAI (text embeddings)
- **Email**: SMTP (Gmail)
- **Push**: WebPush (VAPID)
- **Rate Limiting**: SlowAPI + Redis
- **Security**: fastapi-csrf-protect

#### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Library**: Material-UI v7
- **Routing**: React Router v6
- **HTTP Client**: Axios
- **Charts**: Recharts
- **State Management**: React Context API
- **Service Worker**: Custom implementation

#### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: Nginx
- **Database**: MongoDB 7.0
- **Caching**: Redis (optional)

---

## Migration Guides

### Upgrading to 2.1.0 (Security Release)

#### Database Schema Migration
Run this MongoDB migration script:
```javascript
// Connect to your database
use webappdb;

// Update users collection
db.users.updateMany(
  {},
  {
    $set: {
      email_verified: false,
      verification_token: null,
      verification_token_expires: null,
      password_updated_at: new Date()
    }
  }
);

// Create login_attempts collection
db.createCollection("login_attempts");
db.login_attempts.createIndex({ email: 1 }, { unique: true });
db.login_attempts.createIndex({ locked_until: 1 }, { expireAfterSeconds: 0 });

// Verify indexes
db.login_attempts.getIndexes();
```

#### Environment Variables Required
Update your `.env` file:
```bash
# Security Configuration (NEW)
BCRYPT_ROUNDS=14
CSRF_SECRET_KEY=<generate-with-secrets.token_urlsafe(32)>
REDIS_URL=redis://localhost:6379  # Optional
ENVIRONMENT=production  # development|staging|production

# Existing Variables (VERIFY)
MONGODB_URI=<your-connection-string>
JWT_SECRET=<your-jwt-secret>
STRIPE_SECRET_KEY=<your-stripe-key>
GOOGLE_API_KEY=<your-gemini-api-key>
AZURE_EMBEDDING_KEY=<your-azure-key>
AZURE_EMBEDDING_ENDPOINT=<your-endpoint>
BLOB_CONNECTION_STRING=<your-blob-connection>
SENDER_EMAIL=<your-email>
SENDER_PASSWORD=<your-app-password>
VAPID_PUBLIC_KEY=<your-vapid-public>
VAPID_PRIVATE_KEY=<your-vapid-private>
FRONTEND_URL=https://your-domain.com

# Cookie Configuration
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
COOKIE_DOMAIN=your-domain.com  # Optional
```

#### Dependency Installation
```bash
# Backend
cd backend
pip install slowapi==0.1.9 redis==5.0.1 fastapi-csrf-protect==0.3.4 python-magic==0.4.27 pillow==10.2.0

# Frontend (no changes required)
```

#### Breaking Changes in 2.1.0
1. **Registration** now requires Murdoch University student email format: `12345678@student.murdoch.edu.au`
2. **Email verification** is mandatory before first login
3. **Password requirements**: minimum 12 characters with complexity rules
4. **File uploads**: restricted to images only, 10MB max
5. **Guest users**: cannot upload files

#### Testing Checklist
- [ ] User registration with student email works
- [ ] Email verification link received and works
- [ ] Login requires verified email
- [ ] Password policy enforced on registration
- [ ] Account lockout triggers after 5 failed attempts
- [ ] Rate limiting active on all auth endpoints
- [ ] File upload validates size and type
- [ ] CSRF token required for state-changing requests
- [ ] Security headers present in all responses

---

## Security Advisories

### Current Security Status
- **Security Grade**: A
- **Last Security Audit**: 2025-10-22
- **Known Vulnerabilities**: 1 CRITICAL (git history secrets)

### Known Issues

#### 🚨 CRITICAL: Exposed Secrets in Git History
- **Status**: UNRESOLVED
- **Severity**: CRITICAL
- **Affected Commits**: All commits before d437ab6125dcc258263da910998d11846d89b8f5
- **Exposed Data**:
  - MongoDB credentials (local + MongoDB Atlas)
  - Stripe secret key (payment processing)
  - Google Gemini API key
  - Azure Blob Storage connection string
  - Azure Embedding API key
  - Email SMTP credentials
  - JWT secret
  - VAPID public/private keys
  - CSRF secret
- **Required Actions**:
  1. ✅ Add `.env` to `.gitignore` (DONE)
  2. ⚠️ Clean git history using git-filter-repo or BFG Repo-Cleaner
  3. ⚠️ Rotate ALL exposed credentials
  4. ⚠️ Force push cleaned repository
  5. ⚠️ Notify all collaborators to re-clone repository
- **Remediation**: See [GitHub docs on removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

### Reporting Security Vulnerabilities
To report a security vulnerability:
1. **DO NOT** open a public issue
2. Email: [security contact - add your email]
3. Or use [GitHub Security Advisories](https://github.com/Aithusa712/MUSEngage/security/advisories)

---

## Development

### Setting Up Development Environment
```bash
# Clone repository
git clone https://github.com/Aithusa712/MUSEngage.git
cd MUSEngage

# Copy environment template
cp .env.example .env
# Edit .env with your credentials

# Start all services
docker-compose up --build

# Access application
# Frontend: http://localhost:3000
# Backend API: http://localhost:8001
# App (via Nginx): http://localhost:8000
```

### Running Tests
```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test

# E2E tests
npm run test:e2e
```

---

## Contributors

- [@Aithusa712](https://github.com/Aithusa712) - Project Lead & Primary Developer

---

## Links

- **Repository**: https://github.com/Aithusa712/MUSEngage
- **Commit History**: https://github.com/Aithusa712/MUSEngage/commits
- **Pull Requests**: https://github.com/Aithusa712/MUSEngage/pulls
- **Issues**: https://github.com/Aithusa712/MUSEngage/issues

---

**Note**: This changelog is based on available commit history (last 30 commits shown by API). For complete history, see [full commit list](https://github.com/Aithusa712/MUSEngage/commits).

**Last Updated**: 2025-10-22 13:18:33 UTC

---

