import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { checkManager } from '../lib/checkManager.js';

const router = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;

// Abrir turno 
router.post('/open', async (req, res) => {
  try {
    const { operatorId, initialAmount } = req.body ?? {};
    const initial = Number(initialAmount);
    if (!operatorId || initialAmount === undefined || isNaN(initial) || initial < 0)
      return res.status(400).json({ error: 'operatorId e initialAmount são obrigatórios' });

    const operator = await prisma.user.findUnique({ where: { id: operatorId } });
    if (!operator)
      return res.status(404).json({ error: 'Operador não encontrado' });

    const open = await prisma.shift.findFirst({
      where: { operatorId, status: 'OPEN' },
    });
    if (open)
      return res.status(409).json({ error: 'Operador já possui um turno aberto' });

    const shift = await prisma.shift.create({
      data: { operatorId, initialAmount: initial },
    });
    res.status(201).json(shift);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao abrir turno' });
  }
});

// Turno aberto de um operador
router.get('/current/:operatorId', async (req, res) => {
  try {
    const shift = await prisma.shift.findFirst({
      where: { operatorId: req.params.operatorId, status: 'OPEN' },
    });
    if (!shift)
      return res.status(404).json({ error: 'Nenhum turno aberto para este operador' });
    res.json(shift);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar turno' });
  }
});

// Listar turnos 
router.get('/', async (req, res) => {
  try {
    const shifts = await prisma.shift.findMany({
      orderBy: { openedAt: 'desc' },
    });
    res.json(shifts);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar turnos' });
  }
});

// Buscar turno por ID 
router.get('/:id', async (req, res) => {
  try {
    const shift = await prisma.shift.findUnique({
      where: { id: req.params.id },
      include: { movements: true },
    });
    if (!shift)
      return res.status(404).json({ error: 'Turno não encontrado' });
    res.json(shift);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar turno' });
  }
});

// Fechar turno
router.post('/:id/close', async (req, res) => {
  try {
    const { declaredAmount } = req.body ?? {};
    const declared = Number(declaredAmount);
    if (declaredAmount === undefined || isNaN(declared) || declared < 0)
      return res.status(400).json({ error: 'declaredAmount é obrigatório' });

    const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
    if (!shift)
      return res.status(404).json({ error: 'Turno não encontrado' });
    if (shift.status === 'CLOSED')
      return res.status(409).json({ error: 'Turno já está fechado' });

    // valor esperado
    const cash = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: { method: 'CASH', sale: { shiftId: shift.id, status: 'COMPLETED' } },
    });
    const supplies = await prisma.cashMovement.aggregate({
      _sum: { amount: true },
      where: { shiftId: shift.id, type: 'SUPPLY' },
    });
    const bleeds = await prisma.cashMovement.aggregate({
      _sum: { amount: true },
      where: { shiftId: shift.id, type: 'BLEED' },
    });

    const expectedAmount = round2(
      shift.initialAmount.toNumber() +
        (cash._sum.amount?.toNumber() ?? 0) +
        (supplies._sum.amount?.toNumber() ?? 0) -
        (bleeds._sum.amount?.toNumber() ?? 0)
    );

    const closed = await prisma.shift.update({
      where: { id: shift.id },
      data: { status: 'CLOSED', declaredAmount: declared, closedAt: new Date() },
    });

    res.json({
      shift: closed,
      expectedAmount,
      difference: round2(declared - expectedAmount),
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fechar turno' });
  }
});

// Registrar suprimento ou sangria 
router.post('/:id/movements', async (req, res) => {
  try {
    const { userId, type, amount, reason, managerId, managerPassword } = req.body ?? {};
    const value = Number(amount);

    if (!userId || !['SUPPLY', 'BLEED'].includes(type) || !(value > 0))
      return res.status(400).json({ error: 'userId, type (SUPPLY ou BLEED) e amount > 0 são obrigatórios' });
    if (type === 'BLEED' && !reason)
      return res.status(400).json({ error: 'reason é obrigatório na sangria' });

    const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
    if (!shift)
      return res.status(404).json({ error: 'Turno não encontrado' });
    if (shift.status !== 'OPEN')
      return res.status(409).json({ error: 'Turno está fechado' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return res.status(404).json({ error: 'Usuário não encontrado' });

    // Suprimento
    if (type === 'SUPPLY') {
      const movement = await prisma.cashMovement.create({
        data: { shiftId: shift.id, userId, type, amount: value, reason },
      });
      return res.status(201).json(movement);
    }

    // Sangria
    const manager = await checkManager(managerId, managerPassword);
    if (!manager)
      return res.status(403).json({ error: 'Autorização de gerente inválida' });

    const movementId = randomUUID();

    const [movement] = await prisma.$transaction([
      prisma.cashMovement.create({
        data: { id: movementId, shiftId: shift.id, userId, type, amount: value, reason },
      }),
      prisma.auditLog.create({
        data: {
          action: 'SANGRIA',
          details: `Sangria de ${value}: ${reason}`,
          managerId: manager.id,
          referenceId: movementId,
        },
      }),
    ]);
    res.status(201).json(movement);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao registrar movimento' });
  }
});

// Listar movimentos do turno
router.get('/:id/movements', async (req, res) => {
  try {
    const movements = await prisma.cashMovement.findMany({
      where: { shiftId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(movements);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar movimentos' });
  }
});

export default router;