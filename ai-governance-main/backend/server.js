// server.js
import express from "express";
import cors from "cors";

import googleAuthRoutes from './middleware/googleauth.js';
import connectDB from "./config.js";
import { requestLogger } from "./middleware/logger.js";

import authRouter from "./routes/auth.js";
import templatesRouter from "./routes/templates.js";
import templateResponsesRouter from "./routes/templateResponses.js";

import requirementsRouter from "./routes/requirements.js";   // ✅ NEW (Task‑4)
import assetsRouter from "./routes/assets.js";   // ✅ Asset Inventory (3.1.3)
import riskMatrixRisksRouter from "./routes/riskMatrixRisks.js";
import questionnaireRouter from "./routes/questionnaire.js";
import projectRouter from './routes/projects.js';
import elementRouter from './routes/dataElements.js';
import thirdPartyRouter from './routes/thirdparty.js';
import controlRouter from './routes/controlAssessment.js';
import commentRouter from './routes/comments.js';
import documentsRouter from './routes/trust_center_documents.js';
import governanceAssessmentRouter from './routes/governanceAssessment.js';

import { userQuotaLimiter } from "./middleware/rateLimit.js";
import { authenticateToken } from "./middleware/auth.js";

import emailRouter from './routes/email.js';
import videoRouter from './routes/video.js';

const app = express();

// Connect DB
connectDB();

// CORS configuration
// In development, Vite may pick any local port (5173, 5174, ...), so allow any
// localhost/127.0.0.1 origin. In production, restrict to FRONTEND_URL.
const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser clients (curl, server-to-server) with no Origin header
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }
    if (!process.env.FRONTEND_URL) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(requestLogger);

// ------------------------------
// PUBLIC ROUTES
// ------------------------------
app.use('/', googleAuthRoutes);
app.use('/auth', authRouter);

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Governance AI Backend API', status: 'running' });
});

// ------------------------------
// REQUIREMENTS ROUTE (Task‑4) - PUBLIC FOR TESTING
// ------------------------------
app.use('/requirements', requirementsRouter);
app.use('/assets', assetsRouter);
// ------------------------------
// PROTECTED ROUTES (AUTH + RATE LIMIT)
// ------------------------------
app.use(authenticateToken);
app.use(userQuotaLimiter);

// ------------------------------
// PROTECTED ROUTES
// ------------------------------
app.use('/templates', templatesRouter);
app.use('/template-responses', templateResponsesRouter);

app.use('/risks', riskMatrixRisksRouter);
app.use('/questionnaire', questionnaireRouter);
app.use('/projects', projectRouter);


app.use('/contact', emailRouter);
app.use('/elements', elementRouter);
app.use('/thirdparty', thirdPartyRouter);
app.use('/controls', controlRouter);
app.use('/comments', commentRouter);
app.use('/', documentsRouter);
app.use('/governance', governanceAssessmentRouter);
app.use('/video', videoRouter);

// ------------------------------
// SERVER START
// ------------------------------
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (Reloaded with Atlassian Config)`);
});
