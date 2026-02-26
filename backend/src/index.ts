import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { connectDb } from './config/db';
import healthRouter from './routes/health';
import './models'; // Register Mongoose models

const app = express();
const PORT = process.env.PORT ?? 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan('combined'));

// Routes
app.use('/', healthRouter);

connectDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
