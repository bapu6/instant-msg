# Local XMPP + PostgreSQL + Express Backend Setup

This directory contains the Docker and Node.js backend infrastructure for the Instant Messaging application:
1. **ejabberd XMPP Server** (Containerized): Real-time chat & WebSocket communication.
2. **PostgreSQL 16 Database** (Containerized): Persistent storage for users, chat message history, and file metadata.
3. **Express REST API & File Upload Server**: Authentication, contact sync, message retrieval, and multipart file/video upload.

---

## Quick Start

### 1. Start Docker Containers (XMPP + PostgreSQL)
From workspace root:
```bash
npm run server:up
```

### 2. Start the API & File Upload Server
```bash
npm run server:api
# Or: npm run api
```

### 3. Run XMPP Verification Test
```bash
npm run server:test
```

---

## Services & Ports

| Service | Port | Endpoint / Purpose |
|---|---|---|
| **ejabberd WebSocket** | `5280` | `ws://<host>:5280/ws` (Client WebSocket connection) |
| **ejabberd WebAdmin** | `5280` | `http://localhost:5280/admin` (Admin dashboard) |
| **ejabberd C2S TCP** | `5222` | Standard XMPP client TCP socket |
| **PostgreSQL 16** | `5432` | `postgresql://postgres:postgres@localhost:5432/instant_msg` |
| **Express API** | `5000` | `http://<host>:5000` (REST API & Uploads) |
| **Static Uploads** | `5000` | `http://<host>:5000/uploads/<filename>` (File/Video hosting) |

---

## Environment Variables (`.env`)

Configuration resides in [`server/.env`](file:///c:/Users/bapup/Documents/projects/instant-msg/server/.env):

```env
BACKEND_PORT=5000
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=instant_msg
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
MAX_FILE_SIZE_MB=50
UPLOAD_DIR=./uploads
XMPP_DOMAIN=localhost
XMPP_WS_URL=ws://localhost:5280/ws
```

---

## REST API Endpoints

### Authentication
- `POST /api/register`: Register user in PostgreSQL and sync with ejabberd XMPP.
  - Body: `{ "username": "...", "password": "...", "displayName": "..." }`
- `POST /api/login`: Verify credentials.
  - Body: `{ "username": "...", "password": "..." }`
- `GET /api/users`: List available contacts.

### Messages & History (PostgreSQL)
- `GET /api/messages?user1=alice&user2=bob`: Retrieve conversation history ordered by time.
- `POST /api/messages`: Persist a new message (text or attachment metadata).
  - Body: `{ "sender": "...", "recipient": "...", "body": "...", "message_type": "...", "media_url": "...", "media_name": "...", "media_size": ... }`
- `GET /api/conversations?username=alice`: Retrieve latest message for all active conversations.

### File & Video Uploads
- `POST /api/upload`: Multipart `file` upload.
  - **Supported formats**:
    - Documents: PDF (`.pdf`), Word (`.doc`, `.docx`), Excel (`.xls`, `.xlsx`), Text (`.txt`)
    - Archives: ZIP (`.zip`), RAR (`.rar`), 7z (`.7z`)
    - Media: Images (`.jpg`, `.png`, `.gif`, `.webp`) and Videos (`.mp4`, `.mov`, `.webm`, `.mkv`)
  - **Response**:
    ```json
    {
      "success": true,
      "file": {
        "url": "http://localhost:5000/uploads/file-123.pdf",
        "filename": "file-123.pdf",
        "originalName": "proposal.pdf",
        "size": 1048576,
        "mimeType": "application/pdf",
        "messageType": "document"
      }
    }
    ```

---

## Pre-configured Test Accounts

| Username | Password | JID | Role |
|---|---|---|---|
| `alice` | `secret123` | `alice@localhost` | User |
| `bob` | `secret123` | `bob@localhost` | User |
| `charlie` | `charlie123` | `charlie@localhost` | User |
| `admin` | `adminpass` | `admin@localhost` | Admin (WebAdmin access) |

*You can also register new users through the app UI or API!*
