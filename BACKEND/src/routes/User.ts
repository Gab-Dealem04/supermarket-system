import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';


const router = Router();

//Login
router.post('/login', async (req, res) => {
    try{
        const { name, password } = req.body ?? {};
        if(!name || !password){
            return res.status(400).json({ error: 'Nome e senha são obrigatórios'});
        }

        const user = await prisma.user.findFirst({ where: { name }});

        const passwordOk = user ? await bcrypt.compare(password, user.password) : false;

        if(!user || !passwordOk){
            return res.status(401).json({ error: 'Usuário ou Senha Inválida'});
        }

        const { password: _senha, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    } catch(error){
        res.status(500).json({error: 'Erro ao fazer Login'});
    }
});

//Criar usuário

router.post('/', async (req, res) => {
    try{
        const { name, password, role } = req.body ?? {};
        if(!name || !password){
            return res.status(400).json({ error: 'Nome e senha são obrigatórios'});
        }

        const exists = await prisma.user.findFirst({ where: {name} });

        if(exists){
            return res.status(409).json({ error: 'Usuário já existe'});
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { name, password: hashedPassword, role},
        });

        const { password: _senha, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
    } catch(error){
        res.status(400).json({ error: 'Erro ao criar usuário'});
    }
});

//listar usuários
router.get('/', async (req, res) => {
    try{
        const user = await prisma.user.findMany({
            select: { id: true, name: true, role: true, createdAt: true},
        });

        if(!user){
            return res.status(404).json({ error: 'Usuário não encontrado!'});
        }
        res.json(user);
    } catch(error){
        res.status(500).json({ error: "Erro ao buscar usuário"});
    }
});

//Atualizar Usuário

router.put('/:id', async (req, res) => {
    try{
        const existing = await prisma.user.findUnique({
            where: { id: req.params.id},
        });

        if(!existing){
            return res.status(404).json({ error: 'Usuário não encontrado!'});
        }

        const { name, password, role } = req.body ?? {};
        const data: { name?: string; password?: string; role?: any } = {};

            if (name) data.name = name;
            if (role) data.role = role;
            if (password) data.password = await bcrypt.hash(password, 10);
 
        const user = await prisma.user.update({
        where: { id: req.params.id },
        data,
        select: { id: true, name: true, role: true, createdAt: true },
        });
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao atualizar usuário' });
    }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    await prisma.user.update({
      where: { id },
      data: { active: false },
    });

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao desativar usuário' });
  }
});
 
export default router;
