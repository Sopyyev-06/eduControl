# Howpsuzlyk — OWASP Top 10 (2021) kartasy

Her bölüm: **näme edildi** + **haýsy faýl**.

## A01 — Broken Access Control
- Her marşrutda `requirePermission(...)` — rolar **serwerde** barlanýar, UI-da däl
  (`src/core/permissions.ts`, `src/middleware/auth.ts`).
- Fakultet çägi: `scopedFacultyId()` — dekan/orunbasar dekan diňe öz fakultetini görýär.
- IDOR goragy: her `:id` soragynda eýeçilik/fakultet barlagy (`students`, `reports`, `changeRequests`).
- Iş akymy geçişleri diňe `canPerform(status, action, role)` arkaly (`src/core/workflow.ts`);
  optimistik gulplama (`WHERE id = ? AND status = ?`) goşa tassyklamagy blokirleýär.
- `vice_dean` diňe öz haýyşlaryny görýär; rektorat hemmesini.

## A02 — Cryptographic Failures
- Parollar: **scrypt** (N=16384, r=8, p=1, 64 bayt, 16-baýt random duz), `timingSafeEqual` bilen deňeşdirme
  (`src/core/password.ts`). Argon2/bcrypt ýerine scrypt — goşmaça binar gerek däl.
- Şahsy maglumat: **AES-256-GCM**, her ýazgy üçin random IV (12 b), auth tag saklanýar (`src/core/crypto.ts`).
  Pozulan şifrteksti `null` dolanýar (synagda barlanýar).
- Sessiýa: HMAC-SHA256 JWT, `alg` **diňe HS256** kabul edilýär (alg=none/RS confusion ret), `iss`/`aud` barlanýar.
- Refresh token: 48-baýt random, DB-de **diňe SHA-256 hash**; rotasiýa + **reuse detection**
  (gaýtadan ulanylsa, tutuş `family_id` revoke edilýär).
- Parol/telefon/PINFL loglara düşmeýär (`audit.ts` → `REDACTED_META_KEYS`).

## A03 — Injection
- **Ähli** SQL `?` parametrleri bilen (`mysql2` prepared statements) — `src/db/pool.ts`.
- Dinamiki sütun atlary diňe **allow-list** arkaly (`change_request_items.field` → `ALLOWED` seti).
- Kirşi walidasiýasy: `zod` shemalary her endpoint-de (`src/middleware/validate.ts`).
- `x-powered-by` öçürilen; CSP `script-src 'self'` — inline JS ýok.

## A04 — Insecure Design
- Iş akymy aýratyn «saf funksiýa» moduly (`workflow.ts`) — unit-test bilen goraglanan.
- Tassyklanan hasabat **immutable**; üýtgetme diňe bitewi haýyş arkaly.
- Tassyklawjy basgançaga görä kesgitlenýär, haýyş iberene görä däl (spec 4.2).
- Ätiýaçlyk nusga üçin ähli maglumat bir bazada däl (PII aýratyn tablisa).

## A05 — Security Misconfiguration
- Gorag header-lary: CSP, HSTS (prod), X-Frame-Options DENY, nosniff, Referrer-Policy,
  Permissions-Policy, COOP/CORP, `Cache-Control: no-store` (`src/middleware/security.ts`).
- CORS: diňe `APP_ORIGIN` sanawy, `credentials` bilen; beýleki origin-ler ret.
- Docker: backend `read_only`, `cap_drop: ALL`, `no-new-privileges`, tmpfs `/tmp`,
  MySQL porty **daşyna açylmaýar** (`internal: true` network), nginx-de `server_tokens off`.
- `.env.example` — syr ýok; prod-da boş/syz syr bilen serwer **başlanmaýar** (`config/env.ts`).
- Ýalňyşlyk jogaby stack/SQL ýaýratmaýar — diňe `requestId` (`middleware/error.ts`).

## A06 — Vulnerable Components
- Baglylyklar az sanly we iň soňky: express 4.21, mysql2 3.11, zod 3.23, vue 3.5, vite 5.4.
- `npm audit` barlagy: `cd backend && npm audit` / `cd frontend && npm audit`.
- Docker obrazlary: `node:22-alpine`, `nginx:1.27-alpine`, `mysql:8.4` (pinlenen).

## A07 — Identification & Authentication Failures
- Brute-force: 5 nädogry synanyşyk → 15 minut gulplama (`users.failed_attempts`, `locked_until`).
- Ulanyjy enumerasiýasy ýok: ýok ulanyjy üçin hem hash hasaplanýar (birmeňzeş wagt).
- Wagtlaýyn parol → `must_change_password = 1`, başga ähli endpoint-ler 403.
- Parol çalyşanda ähli beýleki sessiýalar revoke edilýär.
- Rate limit: login 10/min, refresh 40/min (`middleware/rateLimit.ts`) + nginx `limit_req` (login 6/min).

## A08 — Software & Data Integrity
- Audit žurnaly (`audit_logs`) — diňe goşmaça ýazgy, üýtgedilmeýär; ähli ýazgy/görkeziş/karar şol ýerde.
- `report_transitions` — hasabatyň doly taryhy (kim, haçan, haýsy statusdan haýsy statusa).
- `change_request_items` — köne we täze baha saklanýar (näme üýtgedildi anyk).
- JSON göwresi 256 kb bilen çäklenen — resource exhaustion goragy.

## A09 — Logging & Monitoring Failures
- `AUTH_LOGIN`, `AUTH_LOGIN_FAILED`, `AUTH_LOGIN_BLOCKED`, `AUTH_REFRESH_REUSE`,
  `PII_VIEW_MASKED`, `PII_REVEAL`, `PII_UPDATE`, `REPORT_*`, `CHANGE_REQUEST_*`, `USER_*`.
- Her ýazgyda: aktýor, rol, IP, User-Agent, `request_id`.
- `X-Request-Id` nginx → backend → ýalňyşlyk jogaby; loglar boýunça yzarlamak aňsat.

## A10 — SSRF
- Ulgam daşarky HTTP sorag etmeýär (faýl ýüklemesi/URL import ýok) → SSRF ýaryşy ýok.
- Faýl ýüklemesi (goşmaça görnüşde) goşulsa: MIME+ölçeg barlagy, `Content-Disposition: attachment`, ýerine ýetirilmeýän saklaýyş ýoly.

---

## Goşmaça: CSRF, XSS, clickjacking
- **CSRF**: double-submit — `csrft` cookie (httpOnly däl) + `X-CSRF-Token` header, `timingSafeEqual`.
  Login/refresh diňe sessiýa ýok wagty; loginden soň hemmesi goragly.
- **XSS**: Vue şablonlary awtomatik escape edýär; `v-html` ulanylmaýar; CSP `script-src 'self'`.
- **Clickjacking**: `X-Frame-Options: DENY` + `frame-ancestors 'none'`.

## Önümçilikde goşmaça etmeli
1. HTTPS + `COOKIE_SECURE=true` + HSTS.
2. Rate limit-i Redis-e geçirmek (köp instans).
3. `PII_KEY`-y KMS/HSM-de saklamak, her ýyl rotasiýa (`PII_KEY_VERSION`).
4. Loglary daşarky ýygnaguja (Loki/ELK) ibermek, 1 ýyl saklamak.
5. `npm audit` + Dependabot-ny hereketde goýmak.
6. Penetrasiýa barlagy: OWASP ZAP baseline scan.
