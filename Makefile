# Run backend and frontend together.
# Windows (no Make): use npm from repo root instead:
#   npm install && npm run dev
#   (or npm run dev:backend / npm run dev:frontend for one app)
.PHONY: dev dev-backend dev-frontend install

dev:
	npx concurrently --names "backend,frontend" -c "blue,green" "cd backend && npm run dev" "cd frontend && npm run dev"

# Run backend only (port 3000)
dev-backend:
	cd backend && npm run dev

# Run frontend only (Vite default port, usually 5173)
dev-frontend:
	cd frontend && npm run dev

# Install dependencies in both backend and frontend
install:
	cd backend && npm install
	cd frontend && npm install
