# The Thesis Archive

A search site for university students: theses, papers and datasets from ten open sources plus your own archive, a thesis-topic check, a personal library, and bKash membership.

- `frontend/` — the website (React + Vite + Tailwind)
- `backend/` — the server (Node + Express + MongoDB)

## 1. What you need

| Thing | Why | Notes |
|---|---|---|
| Node.js 22.13 or newer | runs both parts | older Node 22 works, but the PDF reader (section 4) needs 22.13+ |
| MongoDB (Atlas or local) | all data | payment approval needs a replica set; Atlas is one already |
| Google OAuth client ID | sign-in | the same ID goes in both `.env` files |
| Cloudinary account | student ID photos and uploaded thesis PDFs | free plan is enough to start |
| SMTP mailbox | email notices | optional; the site works without it |

## 2. First run

```bash
# server
cd backend
npm install
cp .env.example .env        # then fill it in (section 3)
npm run create-admin        # once
npm start                   # http://localhost:5000

# website (second terminal)
cd frontend
npm install
# create frontend/.env with the two lines from section 3
npm run dev                 # http://localhost:5173
```

Check the server: open `http://localhost:5000/api/health`.

Run the server tests (no database or internet needed): `cd backend && npm test`. The last line should read `ALL 27 DETERMINISTIC TEST SUITES PASSED`.

## 3. Settings

### `frontend/.env`

| Setting | Meaning |
|---|---|
| `VITE_API_URL` | address of the server, for example `https://api.example.com` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |

### `backend/.env` — required

| Setting | Meaning |
|---|---|
| `MONGODB_URI` | database address |
| `JWT_SECRET` | long random text (`openssl rand -base64 48`) |
| `GOOGLE_CLIENT_ID` | same ID as the website |
| `PRIMARY_ADMIN_GOOGLE_EMAIL` | the Google account that is always the main admin |
| `FRONTEND_URL` / `CLIENT_ORIGIN` | address of the website; only this address may call the server |
| `NODE_ENV` | `production` on the live server |

### `backend/.env` — optional

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | 5000 | server port |
| `TRUST_PROXY` | 1 in production | number of proxies in front of the server (2 if Cloudflare sits in front of Render) |
| `API_RATE_LIMIT_PER_MINUTE` | 180 | general request limit, counted per signed-in member |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | – | file storage; without them uploads are switched off |
| `THESIS_PDF_MAX_MB` | 20 | largest thesis PDF a student may upload |
| `UNPAYWALL_EMAIL` | – | your contact address; switches on the "Find a free PDF" button |
| `CORE_API_KEY` | – | optional key from core.ac.uk for a higher limit |
| `SEMANTIC_SCHOLAR_API_KEY`, `OPENALEX_API_KEY`, `OPENALEX_MAILTO` | – | optional, higher limits |
| `FULLTEXT_MAX_MB` / `FULLTEXT_TIMEOUT_MS` / `FULLTEXT_MAX_PAGES` | 15 / 20000 / 75 | limits for reading a paper's PDF |
| `FULLTEXT_MAX_MEMORY_MB` | 400 | reading one PDF is stopped when memory grows by more than this; a long thesis needs about 170; use about 250 on a server with 512 MB |
| `FULLTEXT_USER_AGENT` | built in | how the server names itself when it downloads a PDF |
| `PAPER_SUMMARIZER_ENABLED`, `INSTITUTION_ANALYTICS_ENABLED` | true | feature switches |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL` | – | email notices |
| `BKASH_MERCHANT_NUMBER`, `BKASH_MERCHANT_NAME`, `BKASH_MERCHANT_QR` | – | shown on the payment screen |
| `HARVEST_CONTACT_EMAIL`, `HARVEST_SITE_URL` | – | only for the repository copy script (section 6) |
| `OFFLINE_MODE` | false | `true` answers searches from built-in sample data; for testing only |

## 4. Reading the full paper (limitations, future work, conclusion)

The "From the full paper" block reads a paper's free PDF and copies out the authors' own sections. It needs one extra package:

```bash
cd backend
npm install pdfjs-dist@6.2.108
```

Without it the site still runs; that block says reading PDFs is not switched on yet. Scanned PDFs (pictures of pages) cannot be read and the site says so.

This command also adds the package to `backend/package.json` and `package-lock.json`. Keep those two changed files, otherwise your hosting service will not install it.

Each PDF is read in a separate thread with a time limit and a memory limit, so a damaged or hostile file cannot freeze the site.

## 5. Thesis PDF upload

Students can upload their thesis PDF in "Deposit a thesis". Files go to your Cloudinary account under `thesis_vault/theses/`.

A file belongs to the member who uploaded it and to one thesis. When the student removes it, or an admin deletes the thesis, the file is deleted from Cloudinary too. A file left behind by closing the browser tab mid-way stays in the folder. It harms nothing but uses storage space; before deleting one by hand, check that no thesis record has its name in `pdfStorageRef`.

One Cloudinary setting matters: **Settings → Security → "Allow delivery of PDF and ZIP files"** must be on. New free accounts have it off, and then uploaded PDFs cannot be opened.

## 6. Copying thesis records from a university repository

`backend/scripts/harvestRepository.js` copies thesis records (title, authors, abstract, year, and a link back) from repositories that publish them for this purpose. BRAC University is set up.

```bash
cd backend
node scripts/harvestRepository.js --list
node scripts/harvestRepository.js --repo bracu --from 2024-01-01 --max 500 --dry-run   # shows, stores nothing
node scripts/harvestRepository.js --repo bracu --from 2024-01-01                       # stores
```

Before a full copy, write to the library (for BRAC University: dspace@bracu.ac.bd) and say what you are doing. Only the record and abstract are copied; the PDF stays on the university's site and every record links back to it.

## 7. Where results come from

Papers: your own archive, OpenAlex, arXiv, Crossref, Europe PMC, HAL, DOAJ, Semantic Scholar, OpenAIRE, CORE, DBLP.
Datasets: DataCite, Zenodo, Figshare, Dryad, Harvard Dataverse, Hugging Face, OpenAIRE.
Free PDFs: Unpaywall.

IEEE, ACM, Springer and Elsevier papers appear through these sources (title, abstract, DOI, and a free copy where one exists). Their own paid databases are not searched.

## 8. Going live

1. Website: `cd frontend && npm run build`, then publish `frontend/dist` (the included `vercel.json` suits Vercel).
2. Server: `npm start` with `NODE_ENV=production` and the settings above.
3. Set `FRONTEND_URL` to the real website address and add that address to the Google OAuth client.
4. Open `/api/health` on the live server.
5. Sign in as a student, search, open a paper, deposit a test thesis, approve it as admin.

## 9. Useful commands

| Command (in `backend/`) | Does |
|---|---|
| `npm test` | all server tests |
| `npm run create-admin` | create the first admin |
| `node scripts/setPrimaryAdmin.js` | change the main admin |
| `node scripts/testEmail.js` | send a test email |
| `node scripts/harvestRepository.js --list` | list repositories that can be copied |
