# Pensieve

A local PDF reader with AI-powered chat and insights. Upload PDFs, read them in a built-in viewer, and ask questions about their content using a local Ollama model.

## Features

- **PDF Upload & Management** — Upload multiple PDFs, view them in a sidebar list, delete when no longer needed
- **In-App PDF Viewer** — Page-by-page rendering with page navigation, zoom controls, and text selection
- **AI Chat** — Ask questions about any uploaded PDF; responses stream in real-time from a local Ollama model
- **Insights Panel** — Auto-generated document summary and conversation summary, both persisted across restarts
- **Tabbed Interface** — Open multiple PDFs in tabs, each with its own chat history and insights
- **Resizable Split View** — Drag the divider to resize the PDF viewer and chat/insights panels
- **Layout Modes** — Minimize, maximize, or split the PDF viewer with toolbar icons
- **Suggested Questions** — Clickable tag-cloud prompts to get started quickly
- **Markdown Rendering** — Chat responses and insights render formatted markdown
- **Persistent Storage** — Uploaded files, summaries, and metadata survive Docker restarts via a named volume

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- [Ollama](https://ollama.com/) running locally with the `llama3.2` model

## Getting Started

1. **Start Ollama and pull the model:**

   ```bash
   ollama serve
   ollama pull llama3.2
   ```

2. **Start Pensieve:**

   ```bash
   docker compose up --build -d
   ```

3. **Open** [http://localhost:3000](http://localhost:3000)

## Architecture

```
docker-compose.yml
├── backend/          Python (FastAPI)
│   ├── main.py       API endpoints: upload, list, delete, serve PDF, chat, insights
│   ├── Dockerfile
│   └── requirements.txt
└── frontend/         React (Vite) → built and served by nginx
    ├── src/
    │   ├── App.jsx           Shell: sidebar, tabs, split view, layout modes
    │   ├── PdfViewer.jsx     PDF rendering with react-pdf, toolbar controls
    │   ├── RightPanel.jsx    Collapsible Insights + Chat sections
    │   ├── InsightsPanel.jsx Document & conversation summaries (markdown)
    │   └── ChatPanel.jsx     Chat interface with streaming, suggestions
    ├── nginx.conf            Proxies /api/ to backend
    └── Dockerfile            Multi-stage: npm build → nginx
```

**Backend** — FastAPI serves the REST API. PDFs are stored on a Docker volume (`pdf_storage`). Text is extracted with PyMuPDF and sent to Ollama for chat and summarization. Responses stream back as plain text.

**Frontend** — React app built with Vite, served as static files by nginx. nginx proxies `/api/` requests to the backend container. PDFs render client-side via `react-pdf` (PDF.js). Markdown in chat and insights uses `react-markdown`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/files` | List uploaded files |
| `POST` | `/api/upload` | Upload a PDF |
| `DELETE` | `/api/files/:id` | Delete a PDF and its insights |
| `GET` | `/api/files/:id/pdf` | Serve the PDF file |
| `POST` | `/api/chat` | Chat about a PDF (streaming) |
| `GET` | `/api/files/:id/insights` | Get stored summaries |
| `POST` | `/api/files/:id/summarize-document` | Generate/get document summary |
| `POST` | `/api/files/:id/summarize-conversation` | Generate conversation summary |

## Stopping

```bash
docker compose down
```

Uploaded files and insights are preserved in the `pdf_storage` volume. To remove everything:

```bash
docker compose down -v
```
