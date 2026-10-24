import bcrypt from 'bcrypt';
import { prisma } from './prisma.js';

export async function checkManager(managerId?: string, managerPassword?: string) {
  if (!managerId || !managerPassword) return null;

  const manager = await prisma.user.findUnique({ where: { id: managerId } });
  if (!manager || !manager.active) return null;
  if (manager.role !== 'MANAGER' && manager.role !== 'ADMIN') return null;

  const ok = await bcrypt.compare(managerPassword, manager.password);
  return ok ? manager : null;
}