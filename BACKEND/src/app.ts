import express from 'express';
import cors from 'cors';
import routes from './routes/Index.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', routes);

app.get('/health', (req, res) => {
  res.send('API operando normalmente.');
});

export default app; 