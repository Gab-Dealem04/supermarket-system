import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { error } from 'node:console';

const router = Router();

//criar produto
router.post('/', async (req, res) => {
    try{
        const { name, price, barcode, internalCode, stock } = req.body ?? {};
        if(!name || price === undefined){
            return res.status(400).json({ error: 'Nome e preço são obrigatórios!'});
        }

        const product = await prisma.product.create({
            data: { name, price, barcode, internalCode, stock },
        });
        res.status(201).json(product);
    } catch(error:any){ 
        if(error === 'P2002'){
            return res.status(409).json({ error: 'Código de barras ou código interno já cadastrado'});
        }
        return res.status(400).json({ error: 'Erro ao criar produto'});
    }
});

router.get('/', async (req, res) => {
    try{
        const products = await prisma.product.findMany();
        res.json(products);
    } catch(error){
        res.status(500).json({ error: 'Erro ao buscar produtos'});
    }
});

//buscar produto pelo código de barras 
router.get('/barcode/:code', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { barcode: req.params.code },
    });
    if (!product)
      return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
});

//buscar produto por id
router.get('/:id', async(req, res) => {
    try{
        const product = await prisma.product.findUnique({
            where: { id: req.params.id },
        });
        if(!product){
            return res.status(404).json({ error: 'Produto não encontrado!'});
        }
        res.json(product);
    }catch(error){
        return res.status(500).json({ error: 'Erro ao buscar produto'});
    }
});

//atualizar produto
router.put('/:id', async(req, res) => {
    try{
        const existing = await prisma.product.findUnique({
            where: { id: req.params.id },
        });
        if(!existing){
            return res.status(404).json({ error: 'Produto não encontrado'});
        }
        const { name, price, barcode, internalCode, stock } = req.body ?? {};
        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: { name, price, barcode, internalCode, stock },
        });
        res.json(product);
    }catch(error: any){
        if (error.code === 'P2002'){
            return res.status(409).json({ error: 'Código de barras ou código interno já cadastrado' });
        }
        res.status(400).json({ error: 'Erro ao atualizar produto' });
    }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.product.findUnique({
      where: { id: req.params.id },
    });
    if (!existing)
      return res.status(404).json({ error: 'Produto não encontrado' });
 
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ message: 'Produto deletado com sucesso' });
  } catch (error: any) {
    if (error.code === 'P2003')
      return res.status(409).json({ error: 'Produto já usado em vendas e não pode ser apagado' });
    res.status(500).json({ error: 'Erro ao deletar produto' });
  }
});

