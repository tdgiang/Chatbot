import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ChunksService } from './chunks.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-04-08T00:00:00.000Z');

function makeDoc(overrides: Partial<{
  id: string; status: string; chunkCount: number;
}> = {}) {
  return {
    id: 'doc-1',
    knowledgeBaseId: 'kb-1',
    filename: 'test.txt',
    originalName: 'test.txt',
    mimeType: 'text/plain',
    fileSize: 1024,
    status: 'DONE',
    chunkCount: 3,
    errorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRawChunk(overrides: Partial<{
  id: string; chunkIndex: number; isEnabled: boolean; hasEmbedding: boolean; content: string;
}> = {}) {
  return {
    id: 'chunk-1',
    documentId: 'doc-1',
    content: 'This is chunk content for testing.',
    chunkIndex: 0,
    isEnabled: true,
    sourceSection: null,
    chunkType: 'raw',
    createdAt: NOW,
    updatedAt: NOW,
    hasEmbedding: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChunksService', () => {
  let service: ChunksService;
  let prisma: {
    document: { findUnique: jest.Mock; update: jest.Mock };
    chunk: { count: jest.Mock; aggregate: jest.Mock; create: jest.Mock; delete: jest.Mock };
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
  };
  let ai: { embed: jest.Mock };

  beforeEach(async () => {
    prisma = {
      document: { findUnique: jest.fn(), update: jest.fn() },
      chunk: { count: jest.fn(), aggregate: jest.fn(), create: jest.fn(), delete: jest.fn() },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };
    ai = { embed: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ChunksService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
      ],
    }).compile();

    service = module.get(ChunksService);
  });

  // -------------------------------------------------------------------------
  // list()
  // -------------------------------------------------------------------------

  describe('list()', () => {
    it('returns paginated chunks with ISO date strings', async () => {
      const rawChunk = makeRawChunk();
      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.$queryRaw.mockResolvedValue([rawChunk]);
      prisma.chunk.count.mockResolvedValue(1);

      const result = await service.list('doc-1', { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(typeof result.data[0].createdAt).toBe('string');
      expect(result.data[0].isEnabled).toBe(true);
      expect(result.data[0].hasEmbedding).toBe(true);
    });

    it('returns correct totalPages for pagination', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.chunk.count.mockResolvedValue(45);

      const result = await service.list('doc-1', { page: 1, limit: 20 });

      expect(result.totalPages).toBe(3); // ceil(45/20)
    });

    it('throws NotFoundException when document does not exist', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.list('ghost-doc', {}))
        .rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------------

  describe('findOne()', () => {
    it('returns chunk with ISO date strings when found', async () => {
      const rawChunk = makeRawChunk();
      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.$queryRaw.mockResolvedValue([rawChunk]);

      const result = await service.findOne('doc-1', 'chunk-1');

      expect(result.id).toBe('chunk-1');
      expect(typeof result.createdAt).toBe('string');
    });

    it('throws NotFoundException when chunk not found', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.findOne('doc-1', 'missing-chunk'))
        .rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when document not found', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.findOne('ghost-doc', 'chunk-1'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------------

  describe('create()', () => {
    const dto = { content: 'New chunk content that is long enough to pass validation.' };

    it('creates chunk with embedding via raw SQL when embed succeeds', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.chunk.aggregate.mockResolvedValue({ _max: { chunkIndex: 2 } });
      ai.embed.mockResolvedValue(Array(768).fill(0.1));
      prisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'new-chunk-id' }])  // INSERT returning id
        .mockResolvedValueOnce([makeRawChunk({ id: 'new-chunk-id', chunkIndex: 3 })]);  // findOne
      prisma.document.update.mockResolvedValue({});

      const result = await service.create('doc-1', dto);

      expect(ai.embed).toHaveBeenCalledWith(dto.content);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2); // INSERT + SELECT in findOne
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { chunkCount: { increment: 1 } } })
      );
      expect(result.id).toBe('new-chunk-id');
    });

    it('creates chunk without embedding via ORM when embed fails', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.chunk.aggregate.mockResolvedValue({ _max: { chunkIndex: 0 } });
      ai.embed.mockResolvedValue([]); // embed failure → empty array
      prisma.chunk.create.mockResolvedValue({ id: 'fallback-chunk' });
      prisma.$queryRaw.mockResolvedValue([makeRawChunk({ id: 'fallback-chunk', hasEmbedding: false })]);
      prisma.document.update.mockResolvedValue({});

      const result = await service.create('doc-1', dto);

      expect(prisma.chunk.create).toHaveBeenCalled();
      expect(result.hasEmbedding).toBe(false);
    });

    it('assigns next chunkIndex (max + 1)', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.chunk.aggregate.mockResolvedValue({ _max: { chunkIndex: 4 } });
      ai.embed.mockResolvedValue([]);
      const createdChunk = { id: 'c-5', chunkIndex: 5 };
      prisma.chunk.create.mockResolvedValue(createdChunk);
      prisma.$queryRaw.mockResolvedValue([makeRawChunk({ id: 'c-5', chunkIndex: 5 })]);
      prisma.document.update.mockResolvedValue({});

      await service.create('doc-1', dto);

      expect(prisma.chunk.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ chunkIndex: 5 }) })
      );
    });

    it('starts from index 0 when document has no chunks', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc({ chunkCount: 0 }));
      prisma.chunk.aggregate.mockResolvedValue({ _max: { chunkIndex: null } });
      ai.embed.mockResolvedValue([]);
      prisma.chunk.create.mockResolvedValue({ id: 'c-0' });
      prisma.$queryRaw.mockResolvedValue([makeRawChunk({ id: 'c-0', chunkIndex: 0 })]);
      prisma.document.update.mockResolvedValue({});

      await service.create('doc-1', dto);

      expect(prisma.chunk.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ chunkIndex: 0 }) })
      );
    });

    it('throws ConflictException when document is PROCESSING', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc({ status: 'PROCESSING' }));

      await expect(service.create('doc-1', dto))
        .rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when document does not exist', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.create('ghost-doc', dto))
        .rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------------

  describe('update()', () => {
    const dto = { content: 'Updated chunk content that meets minimum length requirements.' };

    it('updates content and embedding via raw SQL when embed succeeds', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.$queryRaw
        .mockResolvedValueOnce([makeRawChunk()]) // verifyChunk
        .mockResolvedValueOnce([makeRawChunk({ content: dto.content })]); // findOne after update
      ai.embed.mockResolvedValue(Array(768).fill(0.2));
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.update('doc-1', 'chunk-1', dto);

      expect(ai.embed).toHaveBeenCalledWith(dto.content);
      expect(prisma.$executeRaw).toHaveBeenCalled(); // UPDATE with vector
      expect(result).toBeDefined();
    });

    it('updates content only (no vector) when embed fails', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.$queryRaw
        .mockResolvedValueOnce([makeRawChunk()])
        .mockResolvedValueOnce([makeRawChunk({ hasEmbedding: false })]);
      ai.embed.mockResolvedValue([]); // embed failure
      prisma.$executeRaw.mockResolvedValue(1);

      await service.update('doc-1', 'chunk-1', dto);

      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('throws ConflictException when document is PROCESSING', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc({ status: 'PROCESSING' }));

      await expect(service.update('doc-1', 'chunk-1', dto))
        .rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when chunk does not belong to document', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.$queryRaw.mockResolvedValue([]); // chunk not found

      await expect(service.update('doc-1', 'wrong-chunk', dto))
        .rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // toggle()
  // -------------------------------------------------------------------------

  describe('toggle()', () => {
    it('flips isEnabled from true to false', async () => {
      const enabledChunk = makeRawChunk({ isEnabled: true });
      const disabledChunk = makeRawChunk({ isEnabled: false });

      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.$queryRaw
        .mockResolvedValueOnce([enabledChunk]) // verifyChunk — currently enabled
        .mockResolvedValueOnce([disabledChunk]); // findOne after toggle
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.toggle('doc-1', 'chunk-1');

      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(result.isEnabled).toBe(false);
    });

    it('flips isEnabled from false to true', async () => {
      const disabledChunk = makeRawChunk({ isEnabled: false });
      const enabledChunk = makeRawChunk({ isEnabled: true });

      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.$queryRaw
        .mockResolvedValueOnce([disabledChunk]) // verifyChunk — currently disabled
        .mockResolvedValueOnce([enabledChunk]); // findOne after toggle
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.toggle('doc-1', 'chunk-1');

      expect(result.isEnabled).toBe(true);
    });

    it('throws NotFoundException when document not found', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.toggle('ghost-doc', 'chunk-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when chunk not found', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.$queryRaw.mockResolvedValue([]); // chunk not found

      await expect(service.toggle('doc-1', 'missing-chunk'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------------

  describe('remove()', () => {
    it('deletes chunk and decrements document chunkCount', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.$queryRaw.mockResolvedValue([makeRawChunk()]);
      prisma.chunk.delete.mockResolvedValue({});
      prisma.document.update.mockResolvedValue({});

      const result = await service.remove('doc-1', 'chunk-1');

      expect(prisma.chunk.delete).toHaveBeenCalledWith({ where: { id: 'chunk-1' } });
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { chunkCount: { decrement: 1 } } })
      );
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when document not found', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.remove('ghost-doc', 'chunk-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when chunk not found', async () => {
      prisma.document.findUnique.mockResolvedValue(makeDoc());
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.remove('doc-1', 'missing-chunk'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
