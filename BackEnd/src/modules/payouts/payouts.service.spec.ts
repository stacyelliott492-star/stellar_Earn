import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Payout, PayoutStatus, PayoutType } from './entities/payout.entity';
import { PayoutsService } from './payouts.service';

const mockRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const buildPayout = (overrides: Partial<Payout> = {}): Payout =>
  ({
    id: 'payout-1',
    stellarAddress: 'G'.padEnd(56, 'A'),
    amount: 10,
    asset: 'XLM',
    status: PayoutStatus.PROCESSING,
    type: PayoutType.QUEST_REWARD,
    questId: 'quest-1',
    submissionId: 'submission-1',
    idempotencyKey: null,
    transactionHash: null,
    stellarLedger: null,
    settlementConfirmations: 0,
    settlementConfirmedAt: null,
    failureReason: null,
    retryCount: 0,
    maxRetries: 3,
    nextRetryAt: null,
    processedAt: null,
    claimedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    canRetry: jest.fn().mockReturnValue(true),
    isClaimable: jest.fn().mockReturnValue(false),
    ...overrides,
  }) as Payout;

describe('PayoutsService settlement finality', () => {
  let service: PayoutsService;
  let repo: ReturnType<typeof mockRepo>;
  let config: { get: jest.Mock };
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    repo = mockRepo();
    repo.save.mockImplementation(async (payout) => payout);
    config = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const values: Record<string, unknown> = {
          NODE_ENV: 'test',
          STELLAR_FINALITY_CONFIRMATIONS: 3,
        };
        return values[key] ?? defaultValue;
      }),
    };
    emitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: getRepositoryToken(Payout), useValue: repo },
        { provide: ConfigService, useValue: config },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();

    service = module.get<PayoutsService>(PayoutsService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps a submitted payout processing until the finality depth is reached', async () => {
    const payout = buildPayout();
    repo.findOne.mockResolvedValue(payout);
    jest
      .spyOn(service as any, 'executeStellarPayment')
      .mockResolvedValue({ transactionHash: 'tx-123', ledger: 100 });
    jest.spyOn(service as any, 'getCurrentStellarLedger').mockResolvedValue(101);

    await service.processPayout(payout.id);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PayoutStatus.PROCESSING,
        transactionHash: 'tx-123',
        stellarLedger: 100,
        settlementConfirmations: 2,
        processedAt: null,
        settlementConfirmedAt: null,
      }),
    );
    expect(emitter.emit).not.toHaveBeenCalledWith(
      'payout.processed',
      expect.anything(),
    );
  });

  it('marks a payout completed only after settlement finality is confirmed', async () => {
    const payout = buildPayout();
    repo.findOne.mockResolvedValue(payout);
    jest
      .spyOn(service as any, 'executeStellarPayment')
      .mockResolvedValue({ transactionHash: 'tx-123', ledger: 100 });
    jest.spyOn(service as any, 'getCurrentStellarLedger').mockResolvedValue(102);

    await service.processPayout(payout.id);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PayoutStatus.COMPLETED,
        transactionHash: 'tx-123',
        stellarLedger: 100,
        settlementConfirmations: 3,
        nextRetryAt: null,
      }),
    );
    expect(payout.processedAt).toBeInstanceOf(Date);
    expect(payout.settlementConfirmedAt).toBeInstanceOf(Date);
    expect(emitter.emit).toHaveBeenCalledWith(
      'payout.processed',
      expect.objectContaining({ transactionHash: 'tx-123' }),
    );
  });

  it('confirms previously submitted processing payouts without resubmitting payment', async () => {
    const payout = buildPayout({
      transactionHash: 'tx-123',
      stellarLedger: 100,
      nextRetryAt: new Date(Date.now() - 1000),
    });
    repo.find.mockResolvedValue([payout]);
    const executeSpy = jest.spyOn(service as any, 'executeStellarPayment');
    jest.spyOn(service as any, 'getCurrentStellarLedger').mockResolvedValue(105);

    await service.confirmPendingSettlements();

    expect(executeSpy).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PayoutStatus.COMPLETED,
        settlementConfirmations: 6,
      }),
    );
    expect(emitter.emit).toHaveBeenCalledWith(
      'payout.processed',
      expect.objectContaining({ payoutId: payout.id }),
    );
  });
});

describe('PayoutsService idempotency', () => {
  let service: PayoutsService;
  let repo: ReturnType<typeof mockRepo>;
  const userAddress = 'G'.padEnd(56, 'A');

  beforeEach(async () => {
    repo = mockRepo();
    repo.save.mockImplementation(async (payout) => payout);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: getRepositoryToken(Payout), useValue: repo },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: unknown) =>
              key === 'NODE_ENV' ? 'test' : def,
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<PayoutsService>(PayoutsService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns the cached payout when the same idempotency key is reused', async () => {
    const existing = buildPayout({
      status: PayoutStatus.PROCESSING,
      idempotencyKey: 'key-abc',
      claimedAt: new Date(),
    });
    // First findOne call (idempotency lookup) returns the existing payout
    repo.findOne.mockResolvedValueOnce(existing);

    const result = await service.claimPayout(
      { submissionId: 'submission-1', stellarAddress: userAddress, idempotencyKey: 'key-abc' },
      userAddress,
    );

    // Should return the cached response without touching the DB again
    expect(repo.findOne).toHaveBeenCalledTimes(1);
    expect(repo.save).not.toHaveBeenCalled();
    expect(result.id).toBe(existing.id);
    expect(result.idempotencyKey).toBe('key-abc');
  });

  it('stores the idempotency key on first claim', async () => {
    const pendingPayout = buildPayout({
      status: PayoutStatus.PENDING,
      idempotencyKey: null,
      claimedAt: null,
      isClaimable: jest.fn().mockReturnValue(true),
    });
    // First findOne: idempotency lookup → not found
    repo.findOne.mockResolvedValueOnce(null);
    // Second findOne: submission lookup → found
    repo.findOne.mockResolvedValueOnce(pendingPayout);

    await service.claimPayout(
      { submissionId: 'submission-1', stellarAddress: userAddress, idempotencyKey: 'key-xyz' },
      userAddress,
    );

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'key-xyz' }),
    );
  });

  it('proceeds normally when no idempotency key is provided', async () => {
    const pendingPayout = buildPayout({
      status: PayoutStatus.PENDING,
      idempotencyKey: null,
      claimedAt: null,
      isClaimable: jest.fn().mockReturnValue(true),
    });
    // Submission lookup (no idempotency check when key is absent)
    repo.findOne.mockResolvedValue(pendingPayout);

    const result = await service.claimPayout(
      { submissionId: 'submission-1', stellarAddress: userAddress },
      userAddress,
    );

    expect(result.idempotencyKey).toBeNull();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: null }),
    );
  });

  it('throws NotFoundException when submission is not found (no idempotency key)', async () => {
    repo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.claimPayout(
        { submissionId: 'missing-sub', stellarAddress: userAddress },
        userAddress,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when payout is not claimable', async () => {
    const alreadyClaimed = buildPayout({
      status: PayoutStatus.COMPLETED,
      isClaimable: jest.fn().mockReturnValue(false),
    });
    repo.findOne.mockResolvedValueOnce(null); // idempotency miss
    repo.findOne.mockResolvedValueOnce(alreadyClaimed);

    await expect(
      service.claimPayout(
        { submissionId: 'submission-1', stellarAddress: userAddress, idempotencyKey: 'new-key' },
        userAddress,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('PayoutsService settlement finality', () => {
  let service: PayoutsService;
  let repo: ReturnType<typeof mockRepo>;
  let config: { get: jest.Mock };
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    repo = mockRepo();
    repo.save.mockImplementation(async (payout) => payout);
    config = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const values: Record<string, unknown> = {
          NODE_ENV: 'test',
          STELLAR_FINALITY_CONFIRMATIONS: 3,
        };
        return values[key] ?? defaultValue;
      }),
    };
    emitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: getRepositoryToken(Payout), useValue: repo },
        { provide: ConfigService, useValue: config },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();

    service = module.get<PayoutsService>(PayoutsService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps a submitted payout processing until the finality depth is reached', async () => {
    const payout = buildPayout();
    repo.findOne.mockResolvedValue(payout);
    jest
      .spyOn(service as any, 'executeStellarPayment')
      .mockResolvedValue({ transactionHash: 'tx-123', ledger: 100 });
    jest.spyOn(service as any, 'getCurrentStellarLedger').mockResolvedValue(101);

    await service.processPayout(payout.id);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PayoutStatus.PROCESSING,
        transactionHash: 'tx-123',
        stellarLedger: 100,
        settlementConfirmations: 2,
        processedAt: null,
        settlementConfirmedAt: null,
      }),
    );
    expect(emitter.emit).not.toHaveBeenCalledWith(
      'payout.processed',
      expect.anything(),
    );
  });

  it('marks a payout completed only after settlement finality is confirmed', async () => {
    const payout = buildPayout();
    repo.findOne.mockResolvedValue(payout);
    jest
      .spyOn(service as any, 'executeStellarPayment')
      .mockResolvedValue({ transactionHash: 'tx-123', ledger: 100 });
    jest.spyOn(service as any, 'getCurrentStellarLedger').mockResolvedValue(102);

    await service.processPayout(payout.id);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PayoutStatus.COMPLETED,
        transactionHash: 'tx-123',
        stellarLedger: 100,
        settlementConfirmations: 3,
        nextRetryAt: null,
      }),
    );
    expect(payout.processedAt).toBeInstanceOf(Date);
    expect(payout.settlementConfirmedAt).toBeInstanceOf(Date);
    expect(emitter.emit).toHaveBeenCalledWith(
      'payout.processed',
      expect.objectContaining({ transactionHash: 'tx-123' }),
    );
  });

  it('confirms previously submitted processing payouts without resubmitting payment', async () => {
    const payout = buildPayout({
      transactionHash: 'tx-123',
      stellarLedger: 100,
      nextRetryAt: new Date(Date.now() - 1000),
    });
    repo.find.mockResolvedValue([payout]);
    const executeSpy = jest.spyOn(service as any, 'executeStellarPayment');
    jest.spyOn(service as any, 'getCurrentStellarLedger').mockResolvedValue(105);

    await service.confirmPendingSettlements();

    expect(executeSpy).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PayoutStatus.COMPLETED,
        settlementConfirmations: 6,
      }),
    );
    expect(emitter.emit).toHaveBeenCalledWith(
      'payout.processed',
      expect.objectContaining({ payoutId: payout.id }),
    );
  });
});
