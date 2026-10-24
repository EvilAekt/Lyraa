import test from 'node:test';
import assert from 'node:assert/strict';
import { BudgetManager } from '../src/security/budget-manager.js';

test('TC-16 / FR-A3: BudgetManager transitions across normal, degraded, and exhausted states', () => {
  const manager = new BudgetManager({
    dailyRequestBudget: 10,
    dailyTokenBudget: 1000,
    degradeThresholdRatio: 0.8,
    normalMaxTokens: 300,
    degradedMaxTokens: 70,
  });

  // 1. Initial State: Normal
  assert.equal(manager.getLevel(), 'normal');
  const checkInitial = manager.canProceed();
  assert.equal(checkInitial.allowed, true);
  assert.equal(checkInitial.level, 'normal');
  assert.equal(manager.getAllowedMaxOutputTokens(), 300);

  // 2. Consume 5 requests, 500 tokens (50% usage) -> Still Normal
  manager.recordUsage(500, 5);
  assert.equal(manager.getLevel(), 'normal');
  assert.equal(manager.getAllowedMaxOutputTokens(), 300);

  // 3. Consume 3 more requests (total 8 requests = 80%) -> Degraded state
  manager.recordUsage(200, 3);
  assert.equal(manager.getLevel(), 'degraded');
  const checkDegraded = manager.canProceed();
  assert.equal(checkDegraded.allowed, true);
  assert.equal(checkDegraded.level, 'degraded');
  // Degraded level downsizes output tokens to 70 (FR-A3)
  assert.equal(manager.getAllowedMaxOutputTokens(), 70);

  // 4. Consume 2 more requests (total 10 requests = 100%) -> Exhausted state
  manager.recordUsage(100, 2);
  assert.equal(manager.getLevel(), 'exhausted');
  const checkExhausted = manager.canProceed();
  assert.equal(checkExhausted.allowed, false);
  assert.equal(checkExhausted.level, 'exhausted');
  assert.ok(checkExhausted.reason?.includes('Batas kuota harian'));

  // 5. Test stats formatting for /status
  const stats = manager.getStats();
  assert.equal(stats.level, 'exhausted');
  assert.equal(stats.dailyRequests, 10);
  assert.equal(stats.maxRequests, 10);
  assert.equal(stats.requestPercentage, 100);
  assert.equal(stats.dailyTokens, 800);
  assert.equal(stats.maxTokens, 1000);
  assert.equal(stats.tokenPercentage, 80);

  // 6. Manual reset resets counters back to normal
  manager.resetCounters();
  assert.equal(manager.getLevel(), 'normal');
  assert.equal(manager.canProceed().allowed, true);
});

test('BudgetManager: Token budget exhaustion triggers exhausted state independently of request count', () => {
  const manager = new BudgetManager({
    dailyRequestBudget: 100,
    dailyTokenBudget: 5000,
    degradeThresholdRatio: 0.8,
  });

  // Consume 1 request but with 4200 tokens (84% of 5000) -> Degraded
  manager.recordUsage(4200, 1);
  assert.equal(manager.getLevel(), 'degraded');
  assert.equal(manager.getAllowedMaxOutputTokens(), 70);

  // Consume 1000 more tokens (total 5200 tokens > 5000) -> Exhausted
  manager.recordUsage(1000, 1);
  assert.equal(manager.getLevel(), 'exhausted');
  assert.equal(manager.canProceed().allowed, false);
});
