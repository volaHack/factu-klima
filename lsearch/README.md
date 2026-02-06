# LSearch - Linux & Cybersecurity Command Searcher

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript" />
  <img src="https://img.shields.io/badge/TailwindCSS-4-38B2AC?style=for-the-badge&logo=tailwind-css" />
  <img src="https://img.shields.io/badge/Supabase-Database-3ECF8E?style=for-the-badge&logo=supabase" />
</p>

A modern, beautiful search engine for Linux commands and cybersecurity tools. Powered by NotebookLM intelligence for continuously enriching the command database.

## ✨ Features

- 🔍 **Real-time Search** - Instant search with keyboard shortcuts (Ctrl/Cmd + K)
- 🏷️ **Category Filtering** - Filter by networking, security, files, system, and more
- 📋 **One-Click Copy** - Copy any command or example instantly
- 🌙 **Cybersecurity Theme** - Dark mode with green/cyan/purple accents
- ⚡ **Smooth Animations** - Powered by Framer Motion
- 🤖 **NotebookLM Integration** - Sync commands from your NotebookLM sources
- 💾 **Supabase Backend** - Fast, scalable database with full-text search

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and update with your values:

```bash
cp .env.example .env.local
```

#### Supabase Setup (Optional - works with sample data without it)

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to **Settings > API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Go to **SQL Editor** and run the contents of `src/lib/schema.sql`

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📦 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── commands/route.ts    # Commands CRUD API
│   │   └── notebooklm/route.ts  # NotebookLM sync API
│   ├── globals.css              # Global styles & animations
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Main search page
├── components/
│   ├── SearchBar.tsx            # Animated search input
│   ├── CommandCard.tsx          # Command display card
│   └── CategoryFilter.tsx       # Category filter buttons
└── lib/
    ├── supabase.ts              # Supabase client
    ├── types.ts                 # TypeScript types
    └── schema.sql               # Database schema
```

## 🎨 Customization

### Adding New Commands

You can add commands directly to Supabase or use the API:

```bash
curl -X POST http://localhost:3000/api/commands \
  -H "Content-Type: application/json" \
  -d '{
    "command": "htop",
    "description": "Interactive process viewer",
    "category": "process",
    "examples": [{"code": "htop", "description": "Launch interactive viewer"}],
    "tags": ["process", "monitoring", "interactive"]
  }'
```

### NotebookLM Sync

The app can sync commands from your NotebookLM notebook. Add sources to your notebook with Linux/cybersecurity content and use the sync API:

```bash
# Check connection
curl http://localhost:3000/api/notebooklm

# Query notebook
curl -X POST http://localhost:3000/api/notebooklm \
  -H "Content-Type: application/json" \
  -d '{"action": "query", "query": "List networking commands"}'
```

## 🚀 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy!

```bash
npm run build
vercel --prod
```

## 📝 Command Categories

| Category | Description | Color |
|----------|-------------|-------|
| networking | Network tools (ssh, curl, nmap) | Cyan |
| security | Security/pentesting tools | Purple |
| files | File operations (ls, cp, find) | Green |
| system | System administration | Yellow |
| process | Process management | Red |
| text | Text processing (grep, sed, awk) | Teal |
| permissions | File permissions | Orange |
| disk | Disk utilities | Gray |
| users | User management | Pink |
| scripting | Scripts and automation | Gold |

## 🛠️ Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript 5
- **Styling**: TailwindCSS 4
- **Animations**: Framer Motion
- **Database**: Supabase (PostgreSQL)
- **AI Integration**: NotebookLM MCP Server
- **Icons**: Lucide React

## 📄 License

MIT License - feel free to use this project for learning or building your own tools!

---

Built with ❤️ for the Linux and cybersecurity community
