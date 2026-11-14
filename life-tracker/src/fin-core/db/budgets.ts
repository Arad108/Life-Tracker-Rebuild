/**
 * I7 — Budget records in SQLite.
 *
 * A budget is stored once per category/period and never mutated across periods.
 * Setting next month's budget inserts (or updates) that month's record only, so
 * last month's figure is still there to compare against.
 *
 * Migration copies the shipped app's budget *goals* (`kind='limit'`,
 * `metric='spend'` or `'spend:cat:<id>'`) into records for the month the
 * migration runs. Goals are left untouched: deleting them would be a data loss
 * risk, and the new UI reads `fin_budgets` rather than `goals`. The legacy
 * `fin_categories.budget_minor` column is copied the same way when no record
 * already exists.
 */

import { MAX_ABS_AMOUNT_MINOR } from '../money';
import type { Budget, BudgetPeriod } from '../budgets';
import { budgetPeriodRange, isMonthKey, monthKeyOf } from '../budgets';
import type { SqliteDriver } from './driver';
import { withTransaction } from './driver';
import { hasColumn, tableExists } from './introspect';
import { BUDGET_INDEXES, FIN_BUDGETS_DDL, SETTING_KEYS } from './schema';
import { getSetting, setSetting } from './settings';

export interface FinBudgetRow {
  readonly id: string;
  readonly category_id: string | null;
  readonly amount_minor: number;
  readonly period_kind: string;
  readonly period_key: string | null;
  readonly start_day: string | null;
  readonly end_day: string | null;
  readonly created_at: number;
  readonly updated_at: number;
}

function toBudget(row: FinBudgetRow): Budget {
  let period: BudgetPeriod;
  if (row.period_kind === 'custom') {
    if (!row.start_day || !row.end_day) {
      throw new Error(`Budget ${row.id} is a custom period without both days.`);
    }
    period = { kind: 'custom', from: row.start_day, to: row.end_day };
  } else {
    if (!row.period_key || !isMonthKey(row.period_key)) {
      throw new Error(`Budget ${row.id} has an invalid month "${String(row.period_key)}".`);
    }
    period = { kind: 'month', month: row.period_key };
  }

  return {
    id: row.id,
    categoryId: row.category_id,
    amountMinor: row.amount_minor,
    period,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Deterministic id, so a retried write updates instead of duplicating. */
export function budgetIdFor(categoryId: string | null, period: BudgetPeriod): string {
  const category = categoryId ?? 'all';
  return period.kind === 'month'
    ? `bud_${category}_month_${period.month}`
    : `bud_${category}_custom_${period.from}_${period.to}`;
}

function periodColumns(period: BudgetPeriod): {
  readonly kind: string;
  readonly key: string | null;
  readonly from: string | null;
  readonly to: string | null;
} {
  budgetPeriodRange(period);
  return period.kind === 'month'
    ? { kind: 'month', key: period.month, from: null, to: null }
    : { kind: 'custom', key: null, from: period.from, to: period.to };
}

async function findBudgetRow(
  driver: SqliteDriver,
  categoryId: string | null,
  period: BudgetPeriod,
): Promise<FinBudgetRow | null> {
  const columns = periodColumns(period);
  return driver.getFirstAsync<FinBudgetRow>(
    `SELECT * FROM fin_budgets
      WHERE category_id IS ? AND period_kind = ?
        AND period_key IS ? AND start_day IS ? AND end_day IS ?`,
    [categoryId, columns.kind, columns.key, columns.from, columns.to],
  );
}

export interface BudgetQuery {
  readonly categoryId: string | null;
  readonly period: BudgetPeriod;
}

export interface SetBudgetInput extends BudgetQuery {
  readonly amountMinor: number;
  /** Optional explicit id. Defaults to a deterministic one. */
  readonly id?: string;
}

export interface BudgetWriteOptions {
  readonly now?: () => number;
}

/** Create or update one period's budget. Other periods are untouched. */
export async function setBudget(
  driver: SqliteDriver,
  input: SetBudgetInput,
  options: BudgetWriteOptions = {},
): Promise<Budget> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new RangeError('A budget must be a positive whole number of paise.');
  }
  if (input.amountMinor > MAX_ABS_AMOUNT_MINOR) {
    throw new RangeError('Budget is larger than the supported limit.');
  }

  const columns = periodColumns(input.period);
  const existing = await findBudgetRow(driver, input.categoryId, input.period);
  const now = (options.now ?? Date.now)();
  const id = existing?.id ?? input.id ?? budgetIdFor(input.categoryId, input.period);

  if (existing) {
    await driver.runAsync(
      'UPDATE fin_budgets SET amount_minor = ?, updated_at = ? WHERE id = ?',
      [input.amountMinor, now, id],
    );
  } else {
    await driver.runAsync(
      `INSERT INTO fin_budgets (
         id, category_id, amount_minor, period_kind, period_key,
         start_day, end_day, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         amount_minor = excluded.amount_minor,
         updated_at = excluded.updated_at`,
      [
        id,
        input.categoryId,
        input.amountMinor,
        columns.kind,
        columns.key,
        columns.from,
        columns.to,
        now,
        now,
      ],
    );
  }

  const row = await driver.getFirstAsync<FinBudgetRow>(
    'SELECT * FROM fin_budgets WHERE id = ?',
    [id],
  );
  if (!row) throw new Error(`Budget ${id} disappeared while it was being written.`);
  return toBudget(row);
}

/** The exact budget for one category and period, or `null`. */
export async function getBudget(
  driver: SqliteDriver,
  query: BudgetQuery,
): Promise<Budget | null> {
  const row = await findBudgetRow(driver, query.categoryId, query.period);
  return row ? toBudget(row) : null;
}

export interface ListBudgetsOptions {
  /** Keep budgets whose period overlaps this inclusive range. */
  readonly from?: string;
  readonly to?: string;
  readonly categoryId?: string | null;
  readonly period?: BudgetPeriod;
}

function samePeriod(first: BudgetPeriod, second: BudgetPeriod): boolean {
  if (first.kind === 'month' && second.kind === 'month') {
    return first.month === second.month;
  }
  if (first.kind === 'custom' && second.kind === 'custom') {
    return first.from === second.from && first.to === second.to;
  }
  return false;
}

/** All budget records, optionally narrowed by range, category or period. */
export async function listBudgets(
  driver: SqliteDriver,
  options: ListBudgetsOptions = {},
): Promise<Budget[]> {
  const rows = await driver.getAllAsync<FinBudgetRow>(
    'SELECT * FROM fin_budgets ORDER BY period_kind, period_key, start_day, category_id, id',
  );

  return rows
    .map(toBudget)
    .filter((budget) => {
      if (options.categoryId !== undefined && budget.categoryId !== options.categoryId) {
        return false;
      }
      if (options.period && !samePeriod(budget.period, options.period)) return false;
      if (options.from !== undefined || options.to !== undefined) {
        const range = budgetPeriodRange(budget.period);
        const from = options.from ?? range.from;
        const to = options.to ?? range.to;
        if (range.to < from || range.from > to) return false;
      }
      return true;
    });
}

/** Remove one period's budget. Other periods keep their records. */
export async function clearBudget(
  driver: SqliteDriver,
  query: BudgetQuery,
): Promise<boolean> {
  const row = await findBudgetRow(driver, query.categoryId, query.period);
  if (!row) return false;
  const result = await driver.runAsync('DELETE FROM fin_budgets WHERE id = ?', [row.id]);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Migration from goal budgets
// ---------------------------------------------------------------------------

const CATEGORY_METRIC_PREFIX = 'spend:cat:';

export interface BudgetMigrationOptions {
  readonly now?: () => number;
}

export interface BudgetMigrationResult {
  readonly applied: boolean;
  readonly created: number;
  readonly warnings: readonly string[];
}

interface LegacyGoalRow {
  readonly id: string;
  readonly title: string;
  readonly metric: string | null;
  readonly target: number | null;
  readonly kind: string;
  readonly period: string;
}

/**
 * Copy mutable goal budgets into period records exactly once.
 *
 * Only the *current* value can be recovered: the old model overwrote the target
 * on every edit, so earlier months no longer exist anywhere. One record for the
 * migration month is therefore the honest maximum.
 */
export async function migrateBudgets(
  driver: SqliteDriver,
  options: BudgetMigrationOptions = {},
): Promise<BudgetMigrationResult> {
  const now = options.now ?? Date.now;

  return withTransaction(driver, async () => {
    const already = (await getSetting(driver, SETTING_KEYS.budgetsMigrated)) === '1';
    const warnings: string[] = [];
    let created = 0;

    await driver.execAsync(FIN_BUDGETS_DDL);
    await driver.execAsync(BUDGET_INDEXES);

    const month = monthKeyOf(new Date(now()));
    const period: BudgetPeriod = { kind: 'month', month };

    const add = async (categoryId: string | null, amountMinor: number, source: string) => {
      if (amountMinor <= 0 || !Number.isSafeInteger(amountMinor)) {
        warnings.push(`${source} had an invalid amount and was skipped.`);
        return;
      }
      if (await getBudget(driver, { categoryId, period })) return;
      await setBudget(
        driver,
        { categoryId, amountMinor, period },
        { now },
      );
      created += 1;
    };

    if (await tableExists(driver, 'goals')) {
      const goals = await driver.getAllAsync<LegacyGoalRow>(
        `SELECT id, title, metric, target, kind, period
           FROM goals
          WHERE kind = 'limit' AND period = 'month' AND metric IS NOT NULL`,
      );

      for (const goal of goals) {
        const metric = goal.metric ?? '';
        const isOverall = metric === 'spend';
        const isCategory = metric.startsWith(CATEGORY_METRIC_PREFIX);
        if (!isOverall && !isCategory) continue;

        if (goal.target === null || !Number.isFinite(goal.target)) {
          warnings.push(`Budget goal "${goal.title}" had no usable target and was skipped.`);
          continue;
        }

        const categoryId = isOverall
          ? null
          : metric.slice(CATEGORY_METRIC_PREFIX.length);
        await add(
          categoryId,
          Math.round(goal.target * 100),
          `Budget goal "${goal.title}"`,
        );
      }
    }

    if (await hasColumn(driver, 'fin_categories', 'budget_minor')) {
      const categories = await driver.getAllAsync<{
        id: string;
        name: string;
        budget_minor: number | null;
      }>(
        `SELECT id, name, budget_minor FROM fin_categories
          WHERE budget_minor IS NOT NULL AND budget_minor > 0`,
      );

      for (const category of categories) {
        await add(
          category.id,
          category.budget_minor ?? 0,
          `Category "${category.name}" budget`,
        );
      }
    }

    await setSetting(driver, SETTING_KEYS.budgetsMigrated, '1');

    return { applied: !already, created, warnings };
  });
}

/** Rows used by tests and repair tools; not part of the public budget API. */
export async function countBudgetRows(driver: SqliteDriver): Promise<number> {
  const row = await driver.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM fin_budgets',
  );
  return row?.n ?? 0;
}
