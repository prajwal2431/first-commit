import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { signToken, requireAuth } from '../middleware/auth';

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

    const existingTenant = await Tenant.findOne({ tenantId });
    if (existingTenant) {
      res.status(409).json({ message: 'Tenant ID is already taken' });
      return;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(409).json({ message: 'Email is already registered' });
      return;
    }

    const tenant = await Tenant.create({ tenantId, companyName });

    const user = await User.create({
      email,
      passwordHash: password,
      tenant: tenant._id,
      role: 'admin',
    });

    const token = signToken({
      userId: String(user._id),
      tenantId: tenant.tenantId,
      email: user.email,
      role: user.role,
    });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        tenant: {
          id: tenant.tenantId,
          companyName: tenant.companyName,
        },
      },
    });
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(409).json({ message: 'Tenant ID or email already exists' });
      return;
    }
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

    const user = await User.findOne({ email }).populate('tenant');
    if (!user) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const tenant = user.tenant as any;

    const token = signToken({
      userId: String(user._id),
      tenantId: tenant.tenantId,
      email: user.email,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user._id,
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
    const user = await User.findById(req.user!.userId).populate('tenant');
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const tenant = user.tenant as any;

    res.json({
      user: {
        id: user._id,
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
