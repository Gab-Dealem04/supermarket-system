import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { checkManager } from '../lib/checkManager.js';

const router = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;

// Recalcula totalAmount e finalAmount a partir dos itens da venda
async function recalcSale(saleId: string) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) return null;

  const sum = await prisma.saleItem.aggregate({
    _sum: { totalPrice: true },
    where: { saleId },
  });
  const totalAmount = round2(sum._sum.totalPrice?.toNumber() ?? 0);
  const finalAmount = round2(Math.max(totalAmount - sale.discount.toNumber(), 0));

  return prisma.sale.update({
    where: { id: saleId },
    data: { totalAmount, finalAmount },
  });
}

// Abrir venda 
router.post('/', async (req, res) => {
  try {
    const { shiftId } = req.body ?? {};
    if (!shiftId)
      return res.status(400).json({ error: 'shiftId é obrigatório' });

    const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift)
      return res.status(404).json({ error: 'Turno não encontrado' });
    if (shift.status !== 'OPEN')
      return res.status(409).json({ error: 'Turno está fechado' });

    const sale = await prisma.sale.create({
      data: { shiftId: shift.id, operatorId: shift.operatorId },
    });
    res.status(201).json(sale);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao abrir venda' });
  }
});

// Listar vendas
router.get('/', async (req, res) => {
  try {
    const { status, shiftId } = req.query;
    const sales = await prisma.sale.findMany({
      where: {
        ...(typeof status === 'string' && { status: status as any }),
        ...(typeof shiftId === 'string' && { shiftId }),
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar vendas' });
  }
});

// Buscar venda por ID, com itens e pagamentos
router.get('/:id', async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true } }, payments: true },
    });
    if (!sale)
      return res.status(404).json({ error: 'Venda não encontrada' });
    res.json(sale);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar venda' });
  }
});

// Adicionar item 
router.post('/:id/items', async (req, res) => {
  try {
    const { productId, quantity, discount } = req.body ?? {};
    const qty = Number(quantity);
    const disc = Number(discount ?? 0);
    if (!productId || !Number.isInteger(qty) || qty <= 0 || isNaN(disc) || disc < 0)
      return res.status(400).json({ error: 'productId e quantity (inteiro > 0) são obrigatórios' });

    const sale = await prisma.sale.findUnique({ where: { id: req.params.id } });
    if (!sale)
      return res.status(404).json({ error: 'Venda não encontrada' });
    if (sale.status !== 'OPEN')
      return res.status(409).json({ error: 'Venda não está aberta' });

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product)
      return res.status(404).json({ error: 'Produto não encontrado' });
    if (product.stock < qty)
      return res.status(409).json({ error: 'Estoque insuficiente' });

    const unitPrice = product.price.toNumber(); // price é Decimal
    const totalPrice = round2(qty * unitPrice - disc);
    if (totalPrice < 0)
      return res.status(400).json({ error: 'Desconto maior que o valor do item' });

    const item = await prisma.saleItem.create({
      data: {
        saleId: sale.id,
        productId: product.id,
        quantity: qty,
        unitPrice,
        discount: disc,
        totalPrice,
      },
    });
    const updatedSale = await recalcSale(sale.id);
    res.status(201).json({ item, sale: updatedSale });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao adicionar item' });
  }
});

// Alterar quantidade ou desconto do item 
router.patch('/:id/items/:itemId', async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({ where: { id: req.params.id } });
    if (!sale)
      return res.status(404).json({ error: 'Venda não encontrada' });
    if (sale.status !== 'OPEN')
      return res.status(409).json({ error: 'Venda não está aberta' });

    const item = await prisma.saleItem.findUnique({
      where: { id: req.params.itemId },
      include: { product: true },
    });
    if (!item || item.saleId !== sale.id)
      return res.status(404).json({ error: 'Item não encontrado nesta venda' });

    const body = req.body ?? {};
    const qty = body.quantity !== undefined ? Number(body.quantity) : item.quantity;
    const disc = body.discount !== undefined ? Number(body.discount) : item.discount.toNumber();

    if (!Number.isInteger(qty) || qty <= 0 || isNaN(disc) || disc < 0)
      return res.status(400).json({ error: 'quantity (inteiro > 0) ou discount inválidos' });
    if (item.product.stock < qty)
      return res.status(409).json({ error: 'Estoque insuficiente' });

    const unitPrice = item.unitPrice.toNumber();
    const totalPrice = round2(qty * unitPrice - disc);
    if (totalPrice < 0)
      return res.status(400).json({ error: 'Desconto maior que o valor do item' });

    const updatedItem = await prisma.saleItem.update({
      where: { id: item.id },
      data: { quantity: qty, discount: disc, totalPrice },
    });
    const updatedSale = await recalcSale(sale.id);
    res.json({ item: updatedItem, sale: updatedSale });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao atualizar item' });
  }
});

// Cancelar item
router.delete('/:id/items/:itemId', async (req, res) => {
  try {
    const { managerId, managerPassword, reason } = req.body ?? {};
    const manager = await checkManager(managerId, managerPassword);
    if (!manager)
      return res.status(403).json({ error: 'Autorização de gerente inválida' });

    const sale = await prisma.sale.findUnique({ where: { id: req.params.id } });
    if (!sale)
      return res.status(404).json({ error: 'Venda não encontrada' });
    if (sale.status !== 'OPEN')
      return res.status(409).json({ error: 'Venda não está aberta' });

    const item = await prisma.saleItem.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.saleId !== sale.id)
      return res.status(404).json({ error: 'Item não encontrado nesta venda' });

    await prisma.$transaction([
      prisma.saleItem.delete({ where: { id: item.id } }),
      prisma.auditLog.create({
        data: {
          action: 'CANCELAMENTO_ITEM',
          details: `Item da venda ${sale.id}. Motivo: ${reason ?? 'não informado'}`,
          managerId: manager.id,
          referenceId: item.id,
        },
      }),
    ]);

    const updatedSale = await recalcSale(sale.id);
    res.json({ message: 'Item cancelado com sucesso', sale: updatedSale });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao cancelar item' });
  }
});

// Aplicar desconto total na venda
router.patch('/:id/discount', async (req, res) => {
  try {
    const disc = Number(req.body?.discount);
    if (isNaN(disc) || disc < 0)
      return res.status(400).json({ error: 'discount deve ser um número >= 0' });

    const sale = await prisma.sale.findUnique({ where: { id: req.params.id } });
    if (!sale)
      return res.status(404).json({ error: 'Venda não encontrada' });
    if (sale.status !== 'OPEN')
      return res.status(409).json({ error: 'Venda não está aberta' });
    if (disc > sale.totalAmount.toNumber())
      return res.status(400).json({ error: 'Desconto maior que o total da venda' });

    await prisma.sale.update({ where: { id: sale.id }, data: { discount: disc } });
    const updatedSale = await recalcSale(sale.id);
    res.json(updatedSale);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao aplicar desconto' });
  }
});

// Registrar pagamento 
router.post('/:id/payments', async (req, res) => {
  try {
    const { method, amount } = req.body ?? {};
    const value = Number(amount);
    if (!['CASH', 'CARD', 'PIX'].includes(method) || !(value > 0))
      return res.status(400).json({ error: 'method (CASH, CARD ou PIX) e amount > 0 são obrigatórios' });

    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: { payments: true },
    });
    if (!sale)
      return res.status(404).json({ error: 'Venda não encontrada' });
    if (sale.status !== 'OPEN')
      return res.status(409).json({ error: 'Venda não está aberta' });

    const payment = await prisma.payment.create({
      data: { saleId: sale.id, method, amount: value },
    });

    const paid = round2(sale.payments.reduce((sum: number, p: any) => sum + p.amount.toNumber(), 0) + value);
    res.status(201).json({
      payment,
      paid,
      remaining: round2(sale.finalAmount.toNumber() - paid), // quanto ainda falta pagar
    });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao registrar pagamento' });
  }
});

// Finalizar venda 
router.post('/:id/complete', async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: { items: true, payments: true },
    });
    if (!sale)
      return res.status(404).json({ error: 'Venda não encontrada' });
    if (sale.status !== 'OPEN')
      return res.status(409).json({ error: 'Venda não está aberta' });
    if (sale.items.length === 0)
      return res.status(400).json({ error: 'A venda não tem itens' });

    const paid = round2(sale.payments.reduce((sum: number, p: any) => sum + p.amount.toNumber(), 0));
    if (Math.abs(paid - sale.finalAmount.toNumber()) > 0.009)
      return res.status(400).json({
        error: 'O total pago é diferente do valor final',
        paid,
        finalAmount: sale.finalAmount.toNumber(),
      });

//soma o que cada produto precisa e confere o estoque ANTES de mexer em qualquer coisa
    const needed = new Map<string, number>();
    for (const item of sale.items) {
      needed.set(item.productId, (needed.get(item.productId) ?? 0) + item.quantity);
    }

    const products = await prisma.product.findMany({
      where: { id: { in: [...needed.keys()] } },
    });
    const stockById = new Map<string, number>();
    for (const product of products) {
      stockById.set(product.id, product.stock);
    }

    for (const [productId, qty] of needed) {
      if ((stockById.get(productId) ?? 0) < qty)
        return res.status(409).json({ error: 'Estoque insuficiente para finalizar a venda' });
    }

//transação em lista: ou tudo acontece, ou nada acontece
    const operations: any[] = [];
    for (const item of sale.items) {
      operations.push(
        prisma.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        })
      );
    }
    operations.push(
      prisma.sale.update({
        where: { id: sale.id },
        data: { status: 'COMPLETED' },
      })
    );
    await prisma.$transaction(operations);

    res.json({ message: 'Venda finalizada com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao finalizar venda' });
  }
});

// Cancelar venda 
router.post('/:id/cancel', async (req, res) => {
  try {
    const { managerId, managerPassword, reason } = req.body ?? {};
    const manager = await checkManager(managerId, managerPassword);
    if (!manager)
      return res.status(403).json({ error: 'Autorização de gerente inválida' });

    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!sale)
      return res.status(404).json({ error: 'Venda não encontrada' });
    if (sale.status === 'CANCELED')
      return res.status(409).json({ error: 'Venda já está cancelada' });

    const operations: any[] = [];

    if (sale.status === 'COMPLETED') {
      for (const item of sale.items) {
        operations.push(
          prisma.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          })
        );
      }
    }

    operations.push(
      prisma.sale.update({
        where: { id: sale.id },
        data: { status: 'CANCELED' },
      })
    );
    operations.push(
      prisma.auditLog.create({
        data: {
          action: 'CANCELAMENTO_VENDA',
          details: `Motivo: ${reason ?? 'não informado'}`,
          managerId: manager.id,
          referenceId: sale.id,
        },
      })
    );

    await prisma.$transaction(operations);

    res.json({ message: 'Venda cancelada com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao cancelar venda' });
  }
});

export default router;