import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

const mockUser = {
  id: 'user-1',
  email: 'admin@chatbot.local',
  password: '',
  role: 'ADMIN' as const,
  name: 'Admin',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock } };
  let jwtService: { sign: jest.Mock };

  beforeAll(async () => {
    mockUser.password = await bcrypt.hash('Admin@123456', 10);
  });

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };
    jwtService = { sign: jest.fn().mockReturnValue('mocked-jwt') };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('returns token on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const result = await service.login({ email: 'admin@chatbot.local', password: 'Admin@123456' });
      expect(result.access_token).toBe('mocked-jwt');
      expect(result.user.email).toBe('admin@chatbot.local');
    });

    it('throws UnauthorizedException for unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'no@one.com', password: 'whatever' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      await expect(service.login({ email: 'admin@chatbot.local', password: 'WrongPass!' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser', () => {
    it('returns user when found', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const result = await service.validateUser('user-1');
      expect(result).toEqual(mockUser);
    });

    it('returns null when not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.validateUser('ghost-id');
      expect(result).toBeNull();
    });
  });
});
