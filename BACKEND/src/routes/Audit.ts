import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { action, managerId } = req.query;
    const logs = await prisma.auditLog.findMany({
      where: {
        ...(typeof action === 'string' && { action }),
        ...(typeof managerId === 'string' && { managerId }),
      },
      include: { manager: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

export default router;