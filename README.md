# xanderGPT

xanderGPT is a self-hosted, ChatGPT-style web application powered by a local
language model through Ollama. It combines a responsive React interface with an
Express API, persistent MySQL storage, account authentication, streaming
responses, and optional web-aware tools.

## Overview

xanderGPT is designed for running a private AI assistant on your own hardware.
Users can create an account, organize persistent conversations, customize the
assistant for each chat, or start a temporary conversation that is not saved to
the database.

The backend sends prompts to Ollama and streams generated tokens to the browser
as NDJSON. Before answering, it can automatically decide whether to evaluate a
calculation, read a URL included in the prompt, or search the web through the
Brave Search API.

## Features

- Local inference through Ollama
- Real-time, cancellable response streaming with NDJSON
- Email and password authentication with HTTP-only JWT cookies
- Persistent conversations and messages stored with Prisma and MySQL
- Conversation search across chat titles and user/assistant message contents
- Per-conversation system prompts and automatic conversation titles
- Temporary chat mode that does not write messages to the database
- Automatic or user-forced Brave web search with query refinement and cited evidence
- Direct extraction and summarization of linked web pages
- Automatic calculator routing for mathematical expressions
- Unified request planning for calculator, web-search, and thinking decisions
- Optional streamed thinking traces with an automatic mode and a per-message force toggle
- Automatic rolling context compaction for long-running saved and temporary chats
- Markdown, GitHub-flavored tables, syntax-highlighted code, and links
- LaTeX rendering through KaTeX
- Responsive desktop and mobile chat interface
- Input validation, security headers, CORS controls, and protected API routes

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS |
| Content rendering | React Markdown, Remark GFM, KaTeX, Highlight.js |
| Backend | Node.js, Express 5, TypeScript |
| Database | MySQL, Prisma ORM |
| Authentication | Argon2, JWT, HTTP-only cookies |
| Local AI | Ollama using the included `Modelfile` |
| Tools | Brave Search API, Mozilla Readability, Math.js |

## Prerequisites

Before installing xanderGPT, make sure you have:

- [Node.js](https://nodejs.org/) 20.19 or newer
- [MySQL](https://www.mysql.com/) with an empty database for the application
- [Ollama](https://ollama.com/) installed and running
- A [Brave Search API](https://brave.com/search/api/) key if you want web search

The included model configuration is based on `qwen3:8b`. Running it locally
requires enough memory for the model and its context.

## Setup

Clone the repository:

```bash
git clone https://github.com/xalonious/xanderGPT.git
cd xanderGPT
```

### 1. Create the Ollama model

From the repository root, pull the base model and create the configured
`xandergpt` model:

```bash
ollama pull qwen3:8b
ollama create xandergpt -f Modelfile
```

The `Modelfile` selects the base model and its default generation settings.
Application prompts, including the assistant identity, are assembled by the
backend from `backend/src/prompts/`.
You can use a different Ollama model by changing `OLLAMA_MODEL`, but the named
model must already exist in Ollama.

### 2. Configure the backend

Install the backend dependencies:

```bash
cd backend
npm install
```

Copy `backend/.env.example` to `backend/.env`, then configure it. A typical
local setup looks like this:

```env
PORT=3000
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/xandergpt
BRAVE_API_KEY=YOUR_BRAVE_SEARCH_API_KEY
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=xandergpt
JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
JWT_ISSUER=localhost
JWT_AUDIENCE=localhost
```

Create the database in MySQL if it does not exist:

```sql
CREATE DATABASE xandergpt;
```

Generate the Prisma client and apply the existing migrations:

```bash
npx prisma generate
npx prisma migrate deploy
```

### 3. Configure the frontend

In a new terminal, install the frontend dependencies:

```bash
cd frontend
npm install
```

Copy `frontend/.env.example` to `frontend/.env` and point it at the backend API:

```env
VITE_API_URL=http://localhost:3000/api
```

The frontend URL must match the backend's `CORS_ORIGIN`. Authentication uses
cookies, so mismatched origins or ports can prevent login from working.

## Running the application

Make sure Ollama is running:

```bash
ollama serve
```

Start the backend from `backend/`:

```bash
npm run dev
```

Start the frontend from `frontend/` in a separate terminal:

```bash
npm run dev
```

Open `http://localhost:5173`, register an account, and start a conversation. The
health endpoint is available at `http://localhost:3000/api/health/ping` when the
example ports above are used.

## Environment variables

### Backend

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | Yes | Port used by the Express API |
| `CORS_ORIGIN` | Yes | Frontend origin allowed to make credentialed API requests |
| `DATABASE_URL` | Yes | MySQL connection URL used by Prisma |
| `OLLAMA_URL` | No | Ollama server URL; defaults to `http://localhost:11434` |
| `OLLAMA_MODEL` | No | Ollama model name; defaults to `xandergpt` |
| `BRAVE_API_KEY` | For search | Brave Search API key used by the web-search tool |
| `JWT_SECRET` | Yes | Secret used to sign authentication tokens |
| `JWT_EXPIRY` | No | JWT lifetime; defaults to `7d` |
| `JWT_ISSUER` | No | Optional expected JWT issuer |
| `JWT_AUDIENCE` | No | Optional expected JWT audience |
| `NODE_ENV` | No | Set to `production` to use secure, cross-site authentication cookies |

### Frontend

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_API_URL` | Yes | Full backend API base URL, including the `/api` prefix |

Web search is the only feature that requires `BRAVE_API_KEY`. Local chat, URL
extraction, and calculator routing still operate without it. If search is
requested but unavailable, the assistant reports that current information could
not be verified instead of treating the search as successful.

## How chat and tools work

For each message, the backend loads recent conversation history, combines the
application prompt with any conversation-specific instructions, and makes one
unified planning call to decide whether calculator, web-search, and extended
thinking capabilities are relevant. Forced controls in the tools menu override
the automatic web-search and thinking decisions for the next message. The
current server date is injected at request time so both the planner and final
answer can recognize time-sensitive questions without storing a stale date in
the conversation.

- **Web search:** The model can search automatically when a prompt needs current
  information, while the tools menu can force search for the next message. The
  model creates a focused query, can rewrite it when the first results are weak,
  selects promising pages, and fetches their readable contents. Relevant
  passages are added as untrusted evidence and the final response cites the
  sources it actually received. Search snippets are used as a clearly limited
  fallback when pages cannot be extracted.
- **URL reader:** When a message contains a public HTTP or HTTPS URL, xanderGPT
  extracts the page's readable text and adds it as context. Local and private
  network addresses are blocked.
- **Calculator:** Mathematical prompts can be routed through Math.js so the
  answer uses an evaluated result rather than model arithmetic.
- **Thinking:** Complex reasoning, planning, code, and comparison prompts can
  enable Qwen's thinking mode. Thinking tokens stream separately from the final
  answer and appear in a collapsible panel. Historical thinking traces are not
  sent back to the model as conversation context.
- **Context compaction:** When the next message would push conversation context
  near the configured model limit, older complete turns are merged into a
  structured rolling summary before planning and generation continue. Recent
  turns remain verbatim, original saved messages stay in MySQL, and the UI shows
  a compaction status while the summary is prepared. Temporary chats keep the
  same rolling state only in browser memory.
- **Temporary chat:** Messages and the temporary system prompt remain in the
  browser session and are sent as short-lived request context, without creating
  conversation or message records in MySQL.
- **Conversation search:** The sidebar search dialog shows recent chats before
  a query is entered, then searches both conversation titles and saved user or
  assistant messages. Opening a message match loads its conversation, scrolls
  directly to the matched message, and briefly highlights it.

Only the first URL in a message is extracted. URL reading currently accepts
HTML pages, limits page size and extracted context, and may fail on paywalls,
consent screens, or bot-protected sites.

## API overview

All routes are prefixed with `/api`. Conversation routes require a valid
`auth_token` cookie.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health/ping` | Check whether the API is available |
| `POST` | `/auth/register` | Create an account |
| `POST` | `/auth/login` | Log in and set the authentication cookie |
| `POST` | `/auth/logout` | Clear the authentication cookie |
| `GET` | `/auth/me` | Return the authenticated user |
| `GET` | `/conversations` | List the user's conversations |
| `GET` | `/conversations/search?q=...` | Search the user's conversation titles and message contents |
| `POST` | `/conversations` | Create a conversation |
| `PATCH` | `/conversations/:id` | Update a title or system prompt |
| `DELETE` | `/conversations/:id` | Delete a conversation and its messages |
| `GET` | `/conversations/:id/messages` | List messages in a conversation |
| `POST` | `/conversations/:id/messages` | Send a message without streaming |
| `POST` | `/conversations/:id/messages/stream` | Send a message as an NDJSON stream |
| `POST` | `/conversations/temp/stream` | Stream a temporary, non-persistent chat |

The streaming endpoints can emit `compaction`, `thinking`, `token`, `tool`,
`tool_result`, `title`, `done`, and `error` events. Closing or cancelling the
request aborts compaction, tool use, or generation on the server.

## Project structure

```text
xanderGPT/
|-- backend/
|   |-- prisma/             # Database schema and migrations
|   `-- src/
|       |-- core/           # Authentication, middleware, logging, and errors
|       |-- data/           # Prisma connection and optional seed script
|       |-- prompts/        # Assistant, routing, tool, and runtime prompt builders
|       |-- rest/           # Auth, health, and conversation routes
|       |-- service/        # Chat, Ollama, authentication, and tool logic
|       `-- validation/     # Joi request schemas
|-- frontend/
|   |-- public/             # Static images and icons
|   `-- src/
|       |-- api/            # REST and streaming API clients
|       |-- auth/           # Authentication context and route guard
|       |-- components/     # Reusable chat interface components
|       |-- hooks/          # Conversation, message, and stream state
|       `-- pages/          # Login, registration, layout, and chat pages
|-- Modelfile               # Ollama model configuration
`-- README.md
```

## Available scripts

Run these commands from the indicated directory.

| Directory | Command | Description |
| --- | --- | --- |
| `backend/` | `npm run dev` | Start the API with automatic TypeScript restarts |
| `backend/` | `npm run initdb` | Create a development Prisma migration named `init` |
| `backend/` | `npm run seed` | Create the development test user defined in the seed script |
| `frontend/` | `npm run dev` | Start the Vite development server |
| `frontend/` | `npm run build` | Type-check and create a production frontend build |
| `frontend/` | `npm run lint` | Run ESLint across the frontend |
| `frontend/` | `npm run preview` | Preview the production frontend build locally |

The seed script contains a fixed development credential and should not be used
to provision production accounts.

## Production notes

The repository currently provides development scripts but does not include a
complete production deployment configuration. Before exposing it publicly:

- Use a long, randomly generated `JWT_SECRET` and production database account.
- Serve both applications over HTTPS and set `NODE_ENV=production`.
- Restrict `CORS_ORIGIN` to the deployed frontend origin.
- Place the Express API and Ollama behind appropriate network controls.
- Do not expose Ollama or MySQL directly to the public internet.
- Add your preferred process manager, reverse proxy, monitoring, and backup
  strategy.

## License

This project is licensed under the [MIT License](LICENSE).
