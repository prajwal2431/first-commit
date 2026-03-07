import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getTenantByTenantId, createTenant } from '../db/tenantRepo';
import { getUserByEmail, getUserById, createUser } from '../db/userRepo';
import { signToken, requireAuth } from '../middleware/auth';

const SALT_ROUNDS = 12;

const router = Router();

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyName, tenantId, email, password } = req.body;

    if (!companyName || !tenantId || !email || !password) {
      res.status(400).json({ message: 'All fields are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ message: 'Password must be at least 8 characters' });
      return;
    }

    const normTenantId = String(tenantId).toLowerCase().trim();
    const existingTenant = await getTenantByTenantId(normTenantId);
    if (existingTenant) {
      res.status(409).json({ message: 'Tenant ID is already taken' });
      return;
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      res.status(409).json({ message: 'Email is already registered' });
      return;
    }

    await createTenant({ tenantId: normTenantId, companyName: String(companyName).trim() });
    const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);
    const userId = uuidv4();
    await createUser({
      userId,
      email: String(email).toLowerCase().trim(),
      passwordHash,
      tenantId: normTenantId,
      role: 'admin',
    });

    const token = signToken({
      userId,
      tenantId: normTenantId,
      email: String(email).toLowerCase().trim(),
      role: 'admin',
    });

    res.status(201).json({
      token,
      user: {
        id: userId,
        email: String(email).toLowerCase().trim(),
        role: 'admin',
        tenant: {
          id: normTenantId,
          companyName: String(companyName).trim(),
        },
      },
    });
  } catch (err: unknown) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required' });
      return;
    }

    const user = await getUserByEmail(email);
    if (!user) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const valid = await bcrypt.compare(String(password), user.passwordHash);
    if (!valid) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const tenant = await getTenantByTenantId(user.tenantId);
    if (!tenant) {
      res.status(500).json({ message: 'Tenant not found' });
      return;
    }

    const token = signToken({
      userId: user.userId,
      tenantId: tenant.tenantId,
      email: user.email,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.userId,
        email: user.email,
        role: user.role,
        tenant: {
          id: tenant.tenantId,
          companyName: tenant.companyName,
        },
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const tenant = await getTenantByTenantId(user.tenantId);
    if (!tenant) {
      res.status(404).json({ message: 'Tenant not found' });
      return;
    }

    res.json({
      user: {
        id: user.userId,
        email: user.email,
        role: user.role,
        tenant: {
          id: tenant.tenantId,
          companyName: tenant.companyName,
        },
      },
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
