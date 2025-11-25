# UltraThink Cloud Deployment Research

> Deep research conducted: November 25, 2025

## Executive Summary

**Recommended Stack: Supabase + Vercel** - Zero cost for personal use, PostgreSQL for structured data, built-in auth and storage.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   CURRENT (LOCAL)                            │
├─────────────────────────────────────────────────────────────┤
│  Chrome Extension ──► Native Host (Python) ──► kb.md (local)│
│                                              ──► /screenshots/│
│                                              ──► /files/      │
│  Desktop Widget ───────────────────────────► /audio/         │
│                                                              │
│  KB Viewer (localhost:8080) ◄── kb-server.py                │
└─────────────────────────────────────────────────────────────┘
```

### Components to Migrate

| Component | Current | Cloud Requirement |
|-----------|---------|-------------------|
| `kb.md` entries | Local file | Database or cloud storage |
| Screenshots/Images | `/screenshots/` folder | Object storage (S3-compatible) |
| Audio/Video | `/audio/`, `/videos/` | Object storage |
| File attachments | `/files/` | Object storage |
| Backend (host.py) | Native messaging | REST API server |
| KB Viewer | Local HTTP server | Static hosting + API |

---

## Option 1: Supabase + Vercel ⭐ RECOMMENDED

```
┌──────────────────────────────────────────────────────────────┐
│  Chrome Extension ───► Vercel (FastAPI/Flask)                │
│        │                    │                                 │
│        │               ┌────┴────┐                            │
│        │               ▼         ▼                            │
│        │         Supabase    Supabase                         │
│        │         Postgres    Storage                          │
│        │         (entries)   (media files)                    │
│        │                                                      │
│  KB Viewer ◄─── Vercel Static / Supabase Auth                │
└──────────────────────────────────────────────────────────────┘
```

### Why This Stack

- **Supabase Free Tier**: 500MB Postgres + 1GB storage
- **Vercel Free Tier**: 100GB bandwidth, zero-config Python (FastAPI)
- **PostgreSQL** stores entries as JSON/JSONB
- **Supabase Storage** for screenshots/media with signed URLs
- **Built-in Auth** for multi-device sync
- **Open source** - can self-host later

### Cost: $0/month for personal use

---

## Option 2: Neon + Cloudflare R2 + Railway

```
┌──────────────────────────────────────────────────────────────┐
│  Chrome Extension ───► Railway (FastAPI)                     │
│                             │                                 │
│                        ┌────┴────┐                            │
│                        ▼         ▼                            │
│                   Neon DB    Cloudflare R2                    │
│                 (serverless  (S3-compatible,                  │
│                  Postgres)    zero egress)                    │
│                                                               │
│  KB Viewer ◄─── Cloudflare Pages                             │
└──────────────────────────────────────────────────────────────┘
```

### Why This Stack

- **Neon**: Scale-to-zero Postgres (3GB free), database branching
- **Cloudflare R2**: 10GB free storage, **zero egress fees**
- **Railway**: Simple Python deployment ($5/month minimum after trial)
- **Cloudflare Pages**: Free frontend hosting with global CDN

### Cost: ~$5-7/month

---

## Option 3: Firebase All-in-One

```
┌──────────────────────────────────────────────────────────────┐
│  Chrome Extension ───► Firebase Functions (Python)           │
│        │                    │                                 │
│        │               ┌────┴────┐                            │
│        │               ▼         ▼                            │
│        │          Firestore   Cloud                           │
│        │          (NoSQL)     Storage                         │
│        │                                                      │
│  KB Viewer ◄─── Firebase Hosting (real-time updates!)        │
└──────────────────────────────────────────────────────────────┘
```

### Why This Stack

- Real-time sync across devices (Firestore listener)
- Offline support built-in
- Google auth integration
- Generous free tier (1GB Firestore, 5GB storage)

### Downside: NoSQL requires data restructuring, vendor lock-in

---

## Comparison Matrix

| Criteria | Supabase+Vercel | Neon+R2+Railway | Firebase |
|----------|-----------------|-----------------|----------|
| **Free Tier** | ✅ Excellent | ⚠️ Limited | ✅ Good |
| **Python Support** | ✅ Full | ✅ Full | ⚠️ Limited |
| **SQL/Postgres** | ✅ Yes | ✅ Yes | ❌ NoSQL |
| **Media Storage** | ✅ 1GB free | ✅ 10GB free | ✅ 5GB free |
| **Real-time Sync** | ⚠️ Extra setup | ❌ No | ✅ Built-in |
| **Complexity** | Low | Medium | Low |
| **Vendor Lock-in** | Low | Low | High |
| **Egress Cost** | Metered | **Free (R2!)** | Metered |

---

## Database Schema

Replace `kb.md` with PostgreSQL:

```sql
CREATE TABLE entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    type VARCHAR(50) NOT NULL,  -- 'link', 'screenshot', 'audio', etc.
    source VARCHAR(50),          -- 'browser', 'widget'
    title TEXT,
    url TEXT,
    notes TEXT,
    selected_text TEXT,
    tab_group JSONB,            -- {name: "Research", color: "blue"}
    media_urls TEXT[],          -- Array of cloud storage URLs
    metadata JSONB              -- Flexible field for future data
);

CREATE INDEX idx_entries_created ON entries(created_at DESC);
CREATE INDEX idx_entries_type ON entries(type);
```

---

## Migration Strategy

### Phase 1: Backend API
1. Create FastAPI backend with same endpoints as `kb-server.py`
2. Deploy to Vercel/Railway
3. Test with local extension

### Phase 2: Storage Migration
1. Set up cloud storage (Supabase Storage or R2)
2. Update screenshot/file upload to use signed URLs
3. Migrate existing media files

### Phase 3: Extension Update
1. Replace native messaging with `fetch()` API calls
2. Remove native host dependency
3. Add authentication (optional)

### Phase 4: Desktop Widget (Optional)
1. Convert to Electron/web app OR
2. Keep as local with cloud sync

---

## Free Tier Limits Reference

### Supabase
- 500MB database
- 1GB storage
- 2GB bandwidth
- 50,000 monthly active users

### Vercel
- 100GB bandwidth
- Serverless functions (hobby limits)
- Edge functions

### Neon
- 3GB storage per branch
- 10 branches
- Shared compute (1GB RAM)
- 100M row writes/month

### Cloudflare R2
- 10GB storage
- 1M Class A operations/month
- 10M Class B operations/month
- **Zero egress fees**

### Railway
- No free tier (removed Aug 2023)
- $5/month minimum
- Usage-based pricing

### Fly.io
- 3 shared VMs
- 3GB persistent storage
- 160GB outbound transfer

---

## Sources

### Platform Comparisons
- [Railway vs Fly.io vs Render ROI](https://medium.com/ai-disruption/railway-vs-fly-io-vs-render-which-cloud-gives-you-the-best-roi-2e3305399e5b)
- [Python Hosting Options 2025](https://www.nandann.com/blog/python-hosting-options-comparison)
- [Supabase vs Firebase vs PlanetScale](https://www.getmonetizely.com/articles/supabase-vs-firebase-vs-planetscale-which-backend-as-a-service-is-right-for-your-budget)

### Database
- [Neon Free Tier](https://www.freetiers.com/directory/neon)
- [Supabase vs PlanetScale](https://www.leanware.co/insights/supabase-vs-planetscale)
- [PostgreSQL Free Tiers 2025](https://www.koyeb.com/blog/top-postgresql-database-free-tiers-in-2025)

### Storage & Hosting
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Vercel Python SDK](https://vercel.com/changelog/vercel-python-sdk-in-beta)
- [FastAPI File Uploads](https://betterstack.com/community/guides/scaling-python/uploading-files-using-fastapi/)

### Architecture
- [Chrome Extension Cloud Storage](https://saturncloud.io/blog/how-to-build-a-chrome-extension-with-cloud-storage/)
- [FastAPI S3 Integration](https://mahdijafaridev.medium.com/handling-file-uploads-in-fastapi-from-basics-to-s3-integration-fc7e64f87d65)
