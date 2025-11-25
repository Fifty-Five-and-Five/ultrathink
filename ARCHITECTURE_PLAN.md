# UltraThink Cloud Architecture Plan

## Overview

Transform UltraThink from a local-only Chrome extension to a hybrid local/cloud system with:
- **Frontend**: React/Vue SPA served from Docker (replaces kb-viewer.html)
- **Backend**: FastAPI for API, processing, AI tasks
- **Storage**: kb.md stored in cloud (SQLite/PostgreSQL)
- **Deployment**: Render.com for simplicity

---

## Current Architecture (Local Only)

```
┌─────────────────────────────────────────────────────────────┐
│                    CHROME EXTENSION                          │
│  popup.js → background.js → Native Messaging → host.py      │
│                                    ↓                         │
│                              kb.md (local file)              │
└─────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────┐
│                    KB VIEWER (localhost:8080)                │
│  kb-server.py → kb-viewer.html → Tabulator.js               │
└─────────────────────────────────────────────────────────────┘
```

---

## Proposed Architecture (Cloud + Local Hybrid)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CHROME EXTENSION (Updated)                            │
│                                                                               │
│  ┌────────────┐    ┌─────────────┐    ┌──────────────────────────────────┐  │
│  │ popup.js   │───►│background.js│───►│ Storage Mode Router              │  │
│  └────────────┘    └─────────────┘    │                                  │  │
│                                        │  if (mode === 'cloud')           │  │
│                                        │    → POST to Cloud API           │  │
│                                        │  else                            │  │
│                                        │    → Native Messaging (local)    │  │
│                                        └──────────────────────────────────┘  │
│                                                     │                         │
│  ┌──────────────────────────────────────────────────┴─────────────────────┐  │
│  │                         OPTIONS PAGE (Updated)                          │  │
│  │  • Storage Mode: [Local] / [Cloud]                                      │  │
│  │  • Cloud URL: https://ultrathink-api.onrender.com                       │  │
│  │  • API Key: (for cloud auth)                                            │  │
│  │  • Project Folder: (for local mode only)                                │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │ LOCAL MODE               │ CLOUD MODE                │
          ▼                          │                          ▼
┌─────────────────────┐              │     ┌─────────────────────────────────────┐
│  Native Host        │              │     │        RENDER.COM DEPLOYMENT         │
│  (host.py)          │              │     │                                      │
│       ↓             │              │     │  ┌────────────────────────────────┐  │
│  kb.md (local)      │              │     │  │      DOCKER CONTAINER          │  │
└─────────────────────┘              │     │  │                                │  │
                                     │     │  │  ┌───────────────────────────┐│  │
                                     │     │  │  │    FASTAPI BACKEND        ││  │
                                     │     │  │  │                           ││  │
                                     │     │  │  │  /api/entries     (CRUD)  ││  │
                                     │     │  │  │  /api/auth        (JWT)   ││  │
                                     │     │  │  │  /api/process     (AI)    ││  │
                                     │     │  │  │  /api/export      (sync)  ││  │
                                     │     │  │  │                           ││  │
                                     │     │  │  │  Background Workers:      ││  │
                                     │     │  │  │  • Deep Research (OpenAI) ││  │
                                     │     │  │  │  • Clustering/Sorting     ││  │
                                     │     │  │  │  • Grammar Fix            ││  │
                                     │     │  │  └───────────────────────────┘│  │
                                     │     │  │                                │  │
                                     │     │  │  ┌───────────────────────────┐│  │
                                     │     │  │  │    STATIC FRONTEND        ││  │
                                     │     │  │  │    (React/Vue SPA)        ││  │
                                     │     │  │  │                           ││  │
                                     │     │  │  │  • Entry list view        ││  │
                                     │     │  │  │  • Search & filter        ││  │
                                     │     │  │  │  • Research notes panel   ││  │
                                     │     │  │  │  • Cluster visualization  ││  │
                                     │     │  │  └───────────────────────────┘│  │
                                     │     │  │                                │  │
                                     │     │  │  ┌───────────────────────────┐│  │
                                     │     │  │  │    STORAGE                ││  │
                                     │     │  │  │                           ││  │
                                     │     │  │  │  SQLite (Render disk)     ││  │
                                     │     │  │  │  or PostgreSQL (prod)     ││  │
                                     │     │  │  │                           ││  │
                                     │     │  │  │  + /screenshots (files)   ││  │
                                     │     │  │  │  + /files (attachments)   ││  │
                                     │     │  │  └───────────────────────────┘│  │
                                     │     │  └────────────────────────────────┘  │
                                     │     └─────────────────────────────────────┘
                                     │
                                     └─────── User accesses web UI directly
                                              https://ultrathink.onrender.com
```

---

## Project Structure

```
ultrathink/
├── ultrathink-extension/          # Existing (with updates)
│   ├── manifest.json
│   ├── popup.js
│   ├── background.js              # ADD: Cloud API integration
│   ├── options.html               # ADD: Cloud settings UI
│   ├── options.js                 # ADD: Storage mode toggle
│   └── ...
│
├── ultrathink-cloud/              # NEW: Cloud deployment
│   ├── Dockerfile
│   ├── docker-compose.yml         # Local dev
│   ├── render.yaml                # Render.com config
│   ├── requirements.txt
│   │
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                # FastAPI app entry
│   │   ├── config.py              # Settings & env vars
│   │   │
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── entries.py         # CRUD for KB entries
│   │   │   ├── auth.py            # JWT authentication
│   │   │   ├── process.py         # AI processing endpoints
│   │   │   └── export.py          # Import/export kb.md
│   │   │
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── entry.py           # SQLAlchemy Entry model
│   │   │   └── user.py            # User model
│   │   │
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── openai_service.py  # OpenAI API calls
│   │   │   ├── research.py        # Deep research logic
│   │   │   ├── clustering.py      # Topic clustering
│   │   │   └── markdown.py        # kb.md parsing/export
│   │   │
│   │   ├── workers/
│   │   │   ├── __init__.py
│   │   │   └── background.py      # Background task queue
│   │   │
│   │   └── db/
│   │       ├── __init__.py
│   │       ├── database.py        # DB connection
│   │       └── migrations/        # Alembic migrations
│   │
│   ├── frontend/                  # Static SPA
│   │   ├── index.html
│   │   ├── src/
│   │   │   ├── main.js
│   │   │   ├── App.vue            # Or React
│   │   │   ├── components/
│   │   │   │   ├── EntryTable.vue
│   │   │   │   ├── SearchBar.vue
│   │   │   │   ├── ResearchPanel.vue
│   │   │   │   └── ClusterView.vue
│   │   │   └── api/
│   │   │       └── client.js      # API client
│   │   ├── package.json
│   │   └── vite.config.js
│   │
│   ├── data/                      # Persistent storage
│   │   ├── ultrathink.db          # SQLite database
│   │   ├── screenshots/
│   │   └── files/
│   │
│   └── tests/
│       ├── test_api.py
│       └── test_services.py
│
├── native-host/                   # Existing (unchanged)
├── kb-viewer.html                 # Keep for local fallback
├── kb-viewer.js
└── kb-server.py
```

---

## Backend API Design (FastAPI)

### Authentication

```python
# Simple API key auth for single-user
POST /api/auth/login
  Body: { "api_key": "user-secret-key" }
  Response: { "token": "jwt-token", "expires": "..." }

# All other endpoints require:
  Header: Authorization: Bearer <jwt-token>
```

### Entry Endpoints

```python
# List entries with filtering
GET /api/entries
  Query params:
    - search: string (full-text search)
    - type: string (filter by type)
    - group: string (filter by group)
    - from_date: datetime
    - to_date: datetime
    - has_research: bool (filter by research status)
    - cluster_id: int (filter by cluster)
    - limit: int (default 100)
    - offset: int (pagination)
  Response: {
    "entries": [...],
    "total": 150,
    "clusters": [...]  # If clustering enabled
  }

# Create entry (from extension)
POST /api/entries
  Body: {
    "type": "link",
    "source": "browser",
    "title": "Article Title",
    "url": "https://...",
    "selected_text": "...",
    "notes": "...",
    "tab_group": { "name": "Research", "color": "blue" },
    "screenshot": "base64...",  # Optional
    "file": { "name": "...", "data": "base64...", "mime": "..." }  # Optional
  }
  Response: {
    "id": 123,
    "timestamp": "2025-11-25 10:30:00",
    "status": "saved",
    "processing": true  # Background tasks queued
  }

# Get single entry with research
GET /api/entries/{id}
  Response: {
    "entry": {...},
    "research": {
      "summary": "...",
      "key_points": [...],
      "related_entries": [...],
      "generated_at": "..."
    }
  }

# Update entry
PATCH /api/entries/{id}
  Body: { "notes": "updated notes", "type": "..." }

# Delete entry
DELETE /api/entries/{id}

# Bulk operations
POST /api/entries/bulk
  Body: {
    "action": "delete" | "move_group" | "tag",
    "entry_ids": [1, 2, 3],
    "params": {...}
  }
```

### Processing Endpoints

```python
# Trigger deep research on entry
POST /api/process/research/{entry_id}
  Body: {
    "depth": "quick" | "deep" | "comprehensive",
    "include_related": true
  }
  Response: {
    "job_id": "abc123",
    "status": "queued",
    "estimated_time": 30  # seconds
  }

# Check job status
GET /api/process/jobs/{job_id}
  Response: {
    "status": "processing" | "completed" | "failed",
    "progress": 0.6,
    "result": {...}  # If completed
  }

# Trigger clustering analysis
POST /api/process/cluster
  Body: {
    "method": "semantic" | "topic" | "temporal",
    "num_clusters": 5  # Optional, auto if not set
  }
  Response: {
    "job_id": "def456",
    "status": "queued"
  }

# Get clustering results
GET /api/process/clusters
  Response: {
    "clusters": [
      {
        "id": 1,
        "label": "AI Research",
        "entries": [1, 5, 12, 34],
        "keywords": ["machine learning", "neural network"]
      },
      ...
    ]
  }

# Grammar fix (sync, fast)
POST /api/process/grammar
  Body: { "text": "...", "context": {...} }
  Response: { "fixed": "..." }
```

### Export/Import Endpoints

```python
# Export to kb.md format
GET /api/export/markdown
  Query: format=md|json
  Response: File download

# Import from kb.md
POST /api/export/import
  Body: multipart/form-data with kb.md file
  Response: { "imported": 45, "skipped": 2, "errors": [...] }

# Sync with local (bidirectional)
POST /api/export/sync
  Body: {
    "local_entries": [...],  # Entries from local kb.md
    "last_sync": "2025-11-24 00:00:00"
  }
  Response: {
    "to_upload": [...],   # New local entries to save
    "to_download": [...], # New cloud entries to pull
    "conflicts": [...]    # Entries modified in both
  }
```

---

## Database Schema

```sql
-- Users table (simple single-user auth)
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    api_key_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Main entries table
CREATE TABLE entries (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),

    -- Core fields (from kb.md format)
    type TEXT NOT NULL,
    source TEXT DEFAULT 'browser',
    timestamp TIMESTAMP NOT NULL,
    title TEXT,
    url TEXT,

    -- Content
    selected_text TEXT,
    notes TEXT,

    -- Tab group
    group_name TEXT,
    group_color TEXT,

    -- Files
    screenshot_path TEXT,
    file_path TEXT,

    -- Processing status
    grammar_fixed BOOLEAN DEFAULT FALSE,
    research_status TEXT DEFAULT 'none',  -- none, queued, processing, done
    cluster_id INTEGER,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Full-text search
    search_vector TEXT  -- For FTS
);

-- Research results
CREATE TABLE research (
    id INTEGER PRIMARY KEY,
    entry_id INTEGER REFERENCES entries(id) ON DELETE CASCADE,

    depth TEXT,  -- quick, deep, comprehensive
    summary TEXT,
    key_points JSON,
    related_topics JSON,
    sources JSON,

    model_used TEXT,
    tokens_used INTEGER,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clusters
CREATE TABLE clusters (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),

    label TEXT,
    keywords JSON,
    method TEXT,  -- semantic, topic, temporal

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Background jobs
CREATE TABLE jobs (
    id TEXT PRIMARY KEY,  -- UUID
    user_id INTEGER REFERENCES users(id),
    entry_id INTEGER REFERENCES entries(id),

    job_type TEXT,  -- research, cluster, grammar
    status TEXT,    -- queued, processing, completed, failed
    progress REAL DEFAULT 0,
    result JSON,
    error TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_entries_user ON entries(user_id);
CREATE INDEX idx_entries_type ON entries(type);
CREATE INDEX idx_entries_timestamp ON entries(timestamp DESC);
CREATE INDEX idx_entries_cluster ON entries(cluster_id);
CREATE INDEX idx_research_entry ON research(entry_id);
```

---

## AI Processing Services

### 1. Deep Research Service

```python
# services/research.py

async def generate_research(entry: Entry, depth: str = "quick") -> Research:
    """
    Generate research notes using OpenAI.

    Depths:
    - quick: 1 API call, basic summary (gpt-4o-mini)
    - deep: 2-3 calls, detailed analysis (gpt-4o)
    - comprehensive: Web search + multiple calls (gpt-4o + web)
    """

    prompts = {
        "quick": f"""
            Summarize this saved note in 2-3 sentences:
            Title: {entry.title}
            URL: {entry.url}
            Notes: {entry.notes}
            Selected text: {entry.selected_text}
        """,

        "deep": f"""
            Provide a detailed research note for this saved item:

            Title: {entry.title}
            URL: {entry.url}
            Type: {entry.type}
            Notes: {entry.notes}
            Selected text: {entry.selected_text}

            Include:
            1. Summary (2-3 sentences)
            2. Key points (bullet list)
            3. Related topics to explore
            4. Questions this raises
        """,

        "comprehensive": ...  # Uses web search + multiple calls
    }

    # Call OpenAI
    response = await openai_client.chat.completions.create(
        model="gpt-4o" if depth != "quick" else "gpt-4o-mini",
        messages=[{"role": "user", "content": prompts[depth]}]
    )

    return Research(
        entry_id=entry.id,
        depth=depth,
        summary=response.choices[0].message.content,
        ...
    )
```

### 2. Clustering Service

```python
# services/clustering.py

async def cluster_entries(
    entries: List[Entry],
    method: str = "semantic",
    num_clusters: int = None
) -> List[Cluster]:
    """
    Cluster entries by similarity.

    Methods:
    - semantic: Embed text, cluster by cosine similarity
    - topic: LDA/BERTopic for topic modeling
    - temporal: Group by time periods
    """

    if method == "semantic":
        # Get embeddings from OpenAI
        texts = [f"{e.title} {e.notes} {e.selected_text}" for e in entries]
        embeddings = await get_embeddings(texts)

        # K-means clustering
        from sklearn.cluster import KMeans

        k = num_clusters or estimate_optimal_k(embeddings)
        kmeans = KMeans(n_clusters=k)
        labels = kmeans.fit_predict(embeddings)

        # Generate cluster labels using LLM
        clusters = []
        for i in range(k):
            cluster_entries = [e for e, l in zip(entries, labels) if l == i]
            label = await generate_cluster_label(cluster_entries)
            clusters.append(Cluster(
                id=i,
                label=label,
                entries=[e.id for e in cluster_entries]
            ))

        return clusters
```

### 3. Grammar Service (existing, moved to backend)

```python
# services/openai_service.py

async def fix_grammar(text: str, context: dict = None) -> str:
    """Fix grammar using OpenAI (moved from extension)."""

    prompt = f"""
        Fix spelling and grammar errors in this note.
        Context: {context}
        Preserve technical terms. Return only corrected text.

        Text: {text}
    """

    response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",  # Fast and cheap
        messages=[{"role": "user", "content": prompt}]
    )

    return response.choices[0].message.content
```

---

## Extension Updates

### New Settings (options.js)

```javascript
// Storage mode: 'local' or 'cloud'
const DEFAULT_SETTINGS = {
  storageMode: 'local',           // NEW
  cloudUrl: '',                   // NEW: https://ultrathink.onrender.com
  cloudApiKey: '',                // NEW: User's API key for cloud
  projectFolder: '',              // Existing (for local mode)
  openaiKey: '',                  // Keep for local grammar fix
  debugMode: false
};
```

### Updated Background.js

```javascript
// background.js - Add cloud support

async function handleSaveSingle(request) {
  const settings = await getSettings();

  if (settings.storageMode === 'cloud') {
    return saveToCloud(request, settings);
  } else {
    return saveToLocal(request, settings);  // Existing native messaging
  }
}

async function saveToCloud(request, settings) {
  const entry = {
    type: request.type,
    source: 'browser',
    title: request.tab.title,
    url: request.tab.url,
    selected_text: request.selectedText || '',
    notes: request.notes || '',
    tab_group: await getTabGroupInfo(request.tab),
    screenshot: request.screenshotData?.dataUrl
  };

  try {
    const response = await fetch(`${settings.cloudUrl}/api/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.cloudToken}`  // JWT from login
      },
      body: JSON.stringify(entry)
    });

    if (!response.ok) throw new Error('Cloud save failed');

    const result = await response.json();
    return { success: true, id: result.id };

  } catch (error) {
    // Fallback to local if cloud fails?
    throw error;
  }
}
```

---

## Render.com Deployment

### render.yaml

```yaml
services:
  - type: web
    name: ultrathink-api
    env: docker
    dockerfilePath: ./ultrathink-cloud/Dockerfile
    envVars:
      - key: OPENAI_API_KEY
        sync: false  # Set in Render dashboard
      - key: SECRET_KEY
        generateValue: true
      - key: DATABASE_URL
        fromDatabase:
          name: ultrathink-db
          property: connectionString
    disk:
      name: ultrathink-data
      mountPath: /app/data
      sizeGB: 1

databases:
  - name: ultrathink-db
    databaseName: ultrathink
    plan: free  # Or starter for production
```

### Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY ultrathink-cloud/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY ultrathink-cloud/app ./app

# Copy and build frontend
COPY ultrathink-cloud/frontend ./frontend
RUN cd frontend && npm install && npm run build

# Copy built frontend to static folder
RUN cp -r frontend/dist app/static

# Create data directories
RUN mkdir -p /app/data/screenshots /app/data/files

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Frontend (Vue.js SPA)

### Key Components

```
frontend/src/
├── App.vue                 # Main layout
├── views/
│   ├── Dashboard.vue       # Entry list + filters
│   ├── EntryDetail.vue     # Single entry + research
│   └── Clusters.vue        # Cluster visualization
├── components/
│   ├── EntryTable.vue      # Tabulator-like grid
│   ├── SearchBar.vue       # Search + filters
│   ├── TypeBadge.vue       # Colored type badges
│   ├── ResearchPanel.vue   # AI research display
│   └── ClusterGraph.vue    # D3 cluster visualization
└── api/
    └── client.js           # Axios API client
```

### EntryTable.vue (simplified)

```vue
<template>
  <div class="entry-table">
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Type</th>
          <th>Date</th>
          <th>Notes</th>
          <th>Research</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.id">
          <td>
            <a :href="entry.url" target="_blank">{{ entry.title }}</a>
          </td>
          <td><TypeBadge :type="entry.type" /></td>
          <td>{{ formatDate(entry.timestamp) }}</td>
          <td>{{ truncate(entry.notes, 100) }}</td>
          <td>
            <span v-if="entry.research_status === 'done'" class="has-research">
              ✓ Research
            </span>
            <button v-else @click="triggerResearch(entry.id)">
              Generate
            </button>
          </td>
          <td>
            <button @click="deleteEntry(entry.id)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

---

## Implementation Phases

### Phase 1: Backend Foundation
1. Set up FastAPI project structure
2. Implement Entry CRUD endpoints
3. Set up SQLite database with SQLAlchemy
4. Port kb.md parsing logic to Python
5. Add basic JWT auth

### Phase 2: Cloud Storage
1. Add screenshot/file upload handling
2. Implement import/export endpoints
3. Test with Postman/curl

### Phase 3: Extension Updates
1. Add storage mode toggle to options
2. Implement cloud API client in background.js
3. Handle auth flow (API key → JWT)
4. Add fallback to local on cloud failure

### Phase 4: Frontend SPA
1. Set up Vue/React project
2. Build entry table component
3. Add search and filtering
4. Style to match existing kb-viewer.html

### Phase 5: AI Processing
1. Implement grammar fix service
2. Add deep research generation
3. Build clustering service
4. Add background job queue

### Phase 6: Deployment
1. Create Dockerfile
2. Set up render.yaml
3. Deploy to Render.com
4. Configure custom domain (optional)

---

## Cost Estimates (Render.com)

| Resource | Plan | Cost/month |
|----------|------|------------|
| Web Service | Free | $0 |
| PostgreSQL | Free (90 days) | $0 |
| Disk (1GB) | Free tier | $0 |
| **Total (hobby)** | | **$0** |

| Resource | Plan | Cost/month |
|----------|------|------------|
| Web Service | Starter | $7 |
| PostgreSQL | Starter | $7 |
| Disk (10GB) | $0.25/GB | $2.50 |
| **Total (production)** | | **~$17** |

---

## Security Considerations

1. **API Key Auth**: Simple but secure for single-user
2. **HTTPS Only**: Render provides free SSL
3. **Input Validation**: Pydantic models for all inputs
4. **File Upload Limits**: Max 10MB per file
5. **Rate Limiting**: 100 requests/minute
6. **CORS**: Restrict to extension origin + web domain

---

## Summary

This architecture gives you:

1. **Hybrid Mode**: Works offline (local) or online (cloud)
2. **Modern Stack**: FastAPI + Vue/React + SQLite/PostgreSQL
3. **AI-Powered**: Deep research, clustering, grammar fix
4. **Simple Deployment**: One-click Render.com
5. **Backward Compatible**: Existing local mode still works
6. **Scalable**: Can upgrade to PostgreSQL, add more features
