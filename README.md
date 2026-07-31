[Live application](https://tasker-alpha-seven.vercel.app)

# Tasker

Tasker is a lightweight, browser-based productivity app for organizing projects, tasks, and notes in a flexible hierarchical workspace.

## Features

- Calendar-based task hierarchy with custom statuses
- Multiple notebooks, including a dedicated Projects workspace
- Search, to-do view, drag-and-drop organization, and undo/redo
- Custom themes and configurable workflows
- Offline access with automatic synchronization
- JSON backups and Markdown/CSV exports
- Google sign-in powered by Supabase Auth

## Tech stack

Built with plain HTML, CSS, and JavaScript, with Supabase for authentication and data persistence. The app is installable as a PWA and requires no build step.

## Run locally

```bash
git clone https://github.com/Kamranlapp/tasker.git
cd tasker
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.
