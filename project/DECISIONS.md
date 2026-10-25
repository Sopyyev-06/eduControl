# Kabul edilen çözgütler (dokumentde anyk ýok ýerler)

Dokument (eduControl.docx) 4.2-nji bölümiň "Görünüş" bölüminde gutarýar — hasabatlar,
howpsuzlyk we mugallym hukuklary barada anyk ýazylmady. Şol ýerlerde şu default-lar saýlandy.

| # | Mesele | Çözgüt | Sebäp |
|---|---|---|---|
| 1 | Hasabat görnüşleri | Aýratyn `report_types`: `morning_attendance`, `evening_dorm`, `event_attendance` | Dokumentde 3 sany el bilen edilýän amal agzalýar, iş akymy birmeňzeş |
| 2 | Hasabatyň ölçegi | Bir topar + bir gün + bir görnüş = bir hasabat (unikal indeks) | Duplicate hasabatlaryň öňüni alýar |
| 3 | Auth usuly | Ulanyjy ady + parol; admin döredýär, wagtlaýyn parol bir gezek görkezilýär | SMS/Telegram 1-nji wersiýada ýok (çykdajy/Integrasiýa) |
| 4 | Mugallym roli | Diňe okamak (`STUDENT_READ`, `REPORT_READ`) | Dokumentde hukugy ýazylmady; iň az hukuk berildi (least privilege) |
| 5 | Orunbasar dekanyň çägi | Diňe öz fakulteti; dekan hem öz fakulteti | "Dekan öz fakultetiniň hasabatlaryny görýär" |
| 6 | Rektorat = 3 rol | `rector`, `prorector`, `rectorate_staff` — üçüsi hem final tassyklaýar | Organizasiýa shemasynda 2 prorektor + 10–15 işgär |
| 7 | Hasabat statuslary | `draft → submitted_to_dean → submitted_to_rectorate → approved / rejected` | 3 basgançakly zynjyr |
| 8 | Ret edilen hasabat | Ýaňydan "garalama" däl — `rejected` terminal; düzediş täze hasabat ýa-da üýtgetme haýyşy bilen | Taryh pozulmasyn |
| 9 | Şahsy maglumat meýdanlary | `birth_date, gender, phone, parent_name, parent_phone, address, passport_no, pinfl, photo` | Dokumentda sanaw ýok; institut üçin adaty toplum |
| 10 | Şahsy maglumat goragy | AES-256-GCM (meýdan derejesi) + maskalama + audit + fakultet çägi | Talap: "şahsy maglumatlar paýlanmaly däl" |
| 11 | Şahsy maglumat kim görýär | Rektor, rektorat işgäri, dekan (öz fakulteti) | Iň az zadyň ýörelgesi |
| 12 | Topar ýolbaşçysy | `students.is_group_leader` (bool), auth ýok, hukuk ýok | Dokument anyk aýdýar |
| 13 | Sebäbi öçürmek | Diňe `is_active = false` (soft delete) | Dokument anyk aýdýar |
| 14 | Goşmaça komment | `requires_comment = true` bolan sebäpde hökmany ("Başga") | Dokument: "Другое с обязательным комментарием" |
| 15 | Kepilnama | Diňe `document_provided` belgisi, faýl ýüklemesi ýok | Dokument: "В версии 1 загрузка файлов невозможна" |
| 16 | Üýtgetme haýyşy bitewi | `change_requests` + `change_request_items`; ähli setir birden | Dokument: "Утверждается или отклоняется как единое целое" |
| 17 | Ýatlatmalar | Cron-hereket: 3 gün → 1-nji, 7 gün → 2-nji; awtomatik ret ýok | Dokument: "без жесткого крайнего срока" |
| 18 | Tassyklanandan soň | `approved` hasabat immutable; üýtgetme diňe täze haýyş bilen | Dokument: "Неизменяемость после утверждения" |
| 19 | Orunbasar dekanyň göni haýyşy | Rektoratdaky hasabat üçin göni iberip bilýär; dekan görýär, ýöne karar bermeýär | Dokument anyk aýdýar |
| 20 | Excel eksport | 1-nji wersiýada ýok (CSV import bar) | Wagt tygşytlamak; goşmak aňsat |
| 21 | Dil | UI Türkmen (dokument rus dilinde, ulanyjylar türkmen) | Ýerli ulanyjylar üçin |
| 22 | Parol syýasaty | min 10, uly+kiçi harf, sifr; scrypt (N=16384) | OWASP maslahaty |
| 23 | Sessiýa | access 15 min (httpOnly cookie) + refresh 12 sagat, rotasiýa + reuse detection | Howpsuzlyk |
| 24 | Rate limit | login 10/min, refresh 40/min, API 30/s (nginx) | Brute-force gorag |
