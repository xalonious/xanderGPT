# xanderGPT

xanderGPT is a lightweight ChatGPT-style web application powered by a local LLM through Ollama.

It provides real-time streaming conversations, persistent chat history, authentication, optional web search, and direct webpage summarization — all running on your own machine with your own model.

Built with React, Node.js, Express, Prisma, and MySQL.

## Core Features

- Real-time streaming chat using NDJSON  
- Per-conversation system prompts  
- Persistent conversations with Prisma and MySQL  
- JWT-based authentication with protected routes  
- Optional web search integration with Brave Search API  
- Direct URL fetching and summarization (paste a link and ask about it)  
- Smart tool routing (automatically decides when to search or fetch)  
- Fully self-hosted AI using Ollama  

## Tech Stack

- Frontend: React, Vite, TypeScript  
- Backend: Node.js, Express, TypeScript  
- Database: MySQL with Prisma ORM  
- LLM: Ollama `/api/chat`  

## License

This project is licensed under the MIT License.