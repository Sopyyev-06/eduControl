# eduControl — Institut dolandyryş ulgamy

Institutyň okuw bölüminiň gatnaşyk (davomad) hasabatlaryny we tassyklama iş akymyny sanlaşdyrýan ulgam.
Vue 3 + TypeScript + Tailwind CSS (frontend), Node.js + Express + TypeScript (backend), MySQL 8, Docker Compose.

---

## 1. Çalt başlangyç (Docker bilen — maslahat berilýär)

```bash
# 1) faýllary açyň
cd project

# 2) syrlary taýýarlaň
cp .env.example .env
node -e "console.log('JWT_SECRET='+require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log('PII_KEY='+require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('DB_PASSWORD='+require('crypto').randomBytes(18).toString('base64'))"
node -e "console.log('MYSQL_ROOT_PASSWORD='+require('crypto').randomBytes(18).toString('base64'))"
# çykan bahalary .env faýlynda degişli ýerlere ýazyň

# 3) işlediň
docker compose up -d --build

# 4) barlag
curl http://localhost:8080/healthz          # ok
curl http://localhost:8080/api/health       # {"ok":true,"db":true}
```

Soňra brauzerde: **http://localhost:8080**

Ilkinji giriş: `.env`-däki `SEED_ADMIN_PASSWORD` bilen `rector` ulanyjysy.
Parol bir gezeklik — ulgam ilkinji girişde ony çalyşmagyňyzy talap eder.

> Diňe demo maglumatlar gerek bolsa: `.env`-de `SEED_DEMO=true` goýuň (1 fakultet, 3 topar, 24 talyp).

## 2. Yerli işlediş (Docker-syz, ösüş üçin)

```bash
# MySQL gerek (8.x). Soňra:
cd backend
cp .env.example .env      # NODE_ENV=development, DB_HOST=127.0.0.1 ediň
npm install
npm run migrate           # shema
SEED_DEMO=true npm run seed
npm run dev               # http://localhost:4000

# aýratyn terminalda:
cd frontend
npm install
npm run dev               # http://localhost:5173 (proxy /api -> 4000)
```

## 3. Synaglar

```bash
cd backend && npm test
```
`11` sany synag: iş akymy (workflow), AES-256-GCM şifrleme + pozma barlagy, parol hashlama,
JWT integriteti (alg=none we payload üýtgetme ret edilýär), RBAC matrisasy, refresh token entropiýasy.

## 4. Rollar

| Rol | Kody | Esasy hukuk |
|---|---|---|
| Rektor | `rector` | ähli zat, final tassyk, audit |
| Prorektor | `prorector` | gözegçilik, final tassyk, audit |
| Rektorat işgäri | `rectorate_staff` | final tassyk, ulanyjylar, sebäpler, şahsy maglumat |
| Dekan | `dean` | fakultetiniň hasabatlaryny tassyklaýar, üýtgetme haýyşlaryny çözýär |
| Orunbasar dekan | `vice_dean` | hasabat döredýär/tabşyrýar, üýtgetme haýyşy iberýär |
| Mugallym | `teacher` | diňe okamak |

**Topar ýolbaşçysy** (uly bir) — rol däl, ulgama girmeýär: `students.is_group_leader` belgisi.

## 5. Hasabat iş akymy

```
Garalama (draft)
   │ orunbasar dekan "Tabşyr"
   ▼
Dekanda (submitted_to_dean)
   │ dekan tassyklaýar        │ ret (komment hökmany)
   ▼                          ▼
Rektoratda                 Ret edildi
   │ rektorat tassyklaýar
   ▼
Tassyklandy  ← mundan soň üýtgedilmeýär; diňe üýtgetme haýyşy
```

## 6. Üýtgetme haýyşlary (spec 4.2)

- Tassyklawjy **hasabatyň häzirki basgançagyna** görä kesgitlenýär (haýyş iberene görä däl).
- Garalama → haýyş gerek däl, göni üýtgedilýär.
- Dekanda → dekanyň karary. Rektoratda/tassyklanan → rektoratyň karary.
- Bitewi (bulk) karar: ähli üýtgeşme birden kabul ýa-da ret. Ret → hasabat üýtgeýär, komment hökmany.
- Ýatlatma: 3 gün hereketsizlikde 1-nji, 7 günde 2-nji. Awtomatik ret **ýok**.
- Orunbasar dekan rektoratdaky hasabat üçin göni haýyş iberip bilýär (dekan geçmezden), dekan ýöne görýär.

## 7. Şahsy maglumatlar

`students` (okuw) bilen `student_personal_data` (şahsy) — **aýratyn tablisalar**.
- AES-256-GCM, her ýazgy üçin aýratyn IV + auth tag (`v1.iv.tag.ct`).
- API maskalanan görkezýär (`+993 ••• •• 45`); doly görkezmek `?reveal=1` + `PII_READ` hukugy + **audit ýazgysy**.
- Ýazmak `PII_WRITE` + fakultet çägi. Şahsy maglumat hiç haçan loglara düşmeýär.

## 8. Faýl gurluşy

```
project/
├── docker-compose.yml        # mysql + backend + frontend + nginx
├── .env.example              # ähli syrlar
├── DECISIONS.md              # kabul edilen çözgütler
├── SECURITY.md               # howpsuzlyk: OWASP Top 10 kartasy
├── backend/
│   ├── sql/001_schema.sql    # 17 tablisa
│   └── src/
│       ├── core/    crypto, jwt, password, permissions, workflow, audit
│       ├── middleware/ security, auth, validate, rateLimit, error
│       ├── modules/ auth, meta, structure, students, reports, changeRequests, admin, audit, dashboard
│       ├── jobs/    reminders (3/7 gün)
│       ├── db/      pool, migrate, seed
│       └── tests/   workflow.test.ts, security.test.ts
├── frontend/src/{pages,components,stores,services,router,types}
└── nginx/nginx.conf
```

## 9. Goşmaça buýruklar

| Iş | Buýruk |
|---|---|
| Loglar | `docker compose logs -f backend` |
| Baza ätiýaçlygy | `docker compose exec mysql mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" educontrol \| gzip > backup.sql.gz` |
| Täzeden gurmak | `docker compose down -v && docker compose up -d --build` |
| Migrasiýa | `docker compose exec backend node dist/db/migrate.js` |
| Sebäp goşmak | Admin panel → "Gatnaşyk sebäpleri" (öçürmek ýok, diňe arhiwleme) |

## 10. Önümçilikde etmeli zatlar

1. `COOKIE_SECURE=true` + HTTPS (nginx-de 443 bloguny açyň, `nginx/certs/`).
2. `APP_ORIGIN` — diňe hakyky domeniňiz.
3. `PII_KEY` — ätiýaçlyk nusgasyny howpsuz saklaň; ýitirilse, şahsy maglumat dikeldilmeýär.
4. MySQL porty daşyna açylmaly däl (compose-da eýýäm ýapyk).
5. Ätiýaçlyk: günde bir gezek `db_data` + `PII_KEY`, başga serwerde.
6. Köp instans goýsaňyz: `rateLimit` Map-yny Redis-e geçiriň (`SECURITY.md`).
