# xanderGPT

xanderGPT is a lightweight ChatGPT-style web application powered by a local LLM through Ollama.

It provides real-time streaming conversations, persistent chat history, authentication, optional web search, automatic tool usage, and rich content rendering — all running on your own machine with your own model.

Built with React, Node.js, Express, Prisma, and MySQL.

## Core Features

- Real-time streaming chat using NDJSON  
- Per-conversation system prompts  
- Persistent conversations with Prisma and MySQL  
- JWT-based authentication with protected routes  
- Optional web search integration with Brave Search API  
- Direct URL fetching and summarization (paste a link and ask about it)  
- Automatic calculator tool (LLM decides when to compute expressions)  
- Automatic Markdown rendering (code blocks, tables, links, lists, etc.)  
- LaTeX math rendering with KaTeX  
- Smart tool routing (automatically decides when to search, fetch, or calculate)  
- Fully self-hosted AI using Ollama  

## Tech Stack

- Frontend: React, Vite, TypeScript  
- Backend: Node.js, Express, TypeScript  
- Database: MySQL with Prisma ORM  
- LLM: Ollama `/api/chat`  

## License

This project is licensed under the MIT License.