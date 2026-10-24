import app from './app.js';
import { connectDB } from './lib/prisma.js';

const port = process.env.PORT || 8080;

connectDB().then(() => {
  app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
  });
});