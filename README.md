# RAG PDF

A small document question-answering app built with Node.js, Express, OpenAI embeddings, ChromaDB, and a Vite frontend.

Upload a PDF or TXT file, index its contents, and ask questions using natural-language search.

## Features

- Upload PDF and TXT documents
- Split documents into searchable chunks
- Generate embeddings for semantic search
- Query documents with AI-generated answers
- Optional ChromaDB vector storage
- Local fallback vector storage for development
- Simple Vite frontend

## Requirements

- Node.js 18+
- Python 3.9+ for ChromaDB
- OpenAI API key

## Setup

### Backend

```bash
cd backend
npm install
```

Create a `.env` file:

```env
OPENAI_API_KEY=your_api_key_here
PORT=5000
CHROMA_URL=http://localhost:8000
```

Start ChromaDB:

```bash
npm run chroma
```

Start the backend:

```bash
npm run dev
```

### Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the frontend URL shown by Vite, usually:

```text
http://localhost:3000
```

## API Endpoints

- `GET /health` - Health check
- `GET /api/status` - System status
- `POST /api/documents/upload` - Upload a document
- `GET /api/documents` - List documents
- `DELETE /api/documents/:id` - Delete a document
- `POST /api/query` - Ask a question
- `POST /api/query/stream` - Ask a question with streaming output

## Testing

```bash
cd backend
npm test
```

## License

MIT
