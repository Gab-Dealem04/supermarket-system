import { Router } from 'express';
import userRoutes from './User.js';
import productRoutes from './Product.js';
import shiftRoutes from './Shift.js';
import saleRoutes from './Sale.js';
import auditRoutes from './Audit.js';

const router = Router();

router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/shifts', shiftRoutes);
router.use('/sales', saleRoutes);
router.use('/audit-logs', auditRoutes);

export default router;