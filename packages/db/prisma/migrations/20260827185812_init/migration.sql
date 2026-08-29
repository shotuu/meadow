-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateEnum
CREATE TYPE "app"."AccountType" AS ENUM ('checking', 'savings', 'credit_card', 'brokerage', 'cash', 'loan', 'other');

-- CreateEnum
CREATE TYPE "app"."AccountClassification" AS ENUM ('asset', 'liability');

-- CreateEnum
CREATE TYPE "app"."SyncSource" AS ENUM ('plaid', 'ibkr_flex', 'csv', 'manual');

-- CreateEnum
CREATE TYPE "app"."CategorySource" AS ENUM ('rule', 'ai', 'manual', 'uncategorized');

-- CreateEnum
CREATE TYPE "app"."SplitType" AS ENUM ('gross_addition', 'deduction');

-- CreateEnum
CREATE TYPE "app"."CategoryKind" AS ENUM ('income', 'expense', 'transfer');

-- CreateEnum
CREATE TYPE "app"."BudgetType" AS ENUM ('none', 'monthly_reset', 'rollover_envelope', 'sinking_fund');

-- CreateEnum
CREATE TYPE "app"."BudgetPeriod" AS ENUM ('weekly', 'monthly', 'quarterly', 'annual');

-- CreateEnum
CREATE TYPE "app"."SinkingFundRecurrence" AS ENUM ('one_time', 'repeating');

-- CreateEnum
CREATE TYPE "app"."RuleMatchType" AS ENUM ('exact_merchant', 'contains', 'regex');

-- CreateEnum
CREATE TYPE "app"."RuleSource" AS ENUM ('user_created', 'learned_from_correction');

-- CreateEnum
CREATE TYPE "app"."RecurringCadence" AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly', 'annual', 'irregular');

-- CreateEnum
CREATE TYPE "app"."RecurringStatus" AS ENUM ('active', 'amount_changed', 'missed', 'cancelled', 'merged');

-- CreateEnum
CREATE TYPE "app"."RecurringEventType" AS ENUM ('amount_increased', 'amount_decreased', 'missed', 'resumed', 'cancelled');

-- CreateEnum
CREATE TYPE "app"."InvestmentTradeType" AS ENUM ('buy', 'sell', 'dividend', 'interest', 'fee', 'deposit', 'withdrawal');

-- CreateEnum
CREATE TYPE "app"."BucketAssignmentSource" AS ENUM ('user', 'default_rule');

-- CreateEnum
CREATE TYPE "app"."AlertRuleType" AS ENUM ('budget_over_target', 'emergency_fund_below_floor', 'portfolio_drift', 'sinking_fund_underfunded', 'recurring_amount_changed', 'recurring_missed', 'large_transaction', 'low_balance');

-- CreateTable
CREATE TABLE "auth"."users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "app"."users" (
    "id" TEXT NOT NULL,
    "default_currency" TEXT NOT NULL DEFAULT 'USD',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."currencies" (
    "code" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimal_places" INTEGER NOT NULL DEFAULT 2,
    "name" TEXT NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "app"."exchange_rates" (
    "id" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL,
    "quote_currency" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "as_of_date" DATE NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "app"."AccountType" NOT NULL,
    "classification" "app"."AccountClassification" NOT NULL,
    "currency" TEXT NOT NULL,
    "institution_name" TEXT,
    "sync_source" "app"."SyncSource" NOT NULL,
    "external_account_id" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."plaid_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plaid_item_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "institution_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "cursor" TEXT,
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "plaid_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ibkr_flex_configs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "flex_token" TEXT NOT NULL,
    "flex_query_id" TEXT NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "last_report_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "ibkr_flex_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "merchant_name" TEXT,
    "date" DATE NOT NULL,
    "authorized_date" DATE,
    "category_id" TEXT,
    "category_confidence" DECIMAL(4,3),
    "category_source" "app"."CategorySource" NOT NULL DEFAULT 'uncategorized',
    "is_transfer" BOOLEAN NOT NULL DEFAULT false,
    "transfer_pair_id" TEXT,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "external_transaction_id" TEXT,
    "import_batch_id" TEXT,
    "notes" TEXT,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."transaction_splits" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "split_type" "app"."SplitType" NOT NULL,
    "category_id" TEXT,

    CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_category_id" TEXT,
    "kind" "app"."CategoryKind" NOT NULL,
    "budget_type" "app"."BudgetType" NOT NULL DEFAULT 'none',
    "icon" TEXT,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."budgets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "period" "app"."BudgetPeriod" NOT NULL,
    "rollover_enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollover_cap" DECIMAL(18,4),
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."budget_period_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "allotted_amount" DECIMAL(18,4) NOT NULL,
    "rolled_over_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "spent_amount" DECIMAL(18,4) NOT NULL,
    "remaining_amount" DECIMAL(18,4) NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_period_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."sinking_funds" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT,
    "name" TEXT NOT NULL,
    "target_amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "deadline_date" DATE NOT NULL,
    "recurrence" "app"."SinkingFundRecurrence" NOT NULL DEFAULT 'one_time',
    "recurrence_interval" TEXT,
    "current_balance" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "sinking_funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."sinking_fund_contributions" (
    "id" TEXT NOT NULL,
    "sinking_fund_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,

    CONSTRAINT "sinking_fund_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."categorization_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "match_type" "app"."RuleMatchType" NOT NULL,
    "pattern" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "source" "app"."RuleSource" NOT NULL DEFAULT 'user_created',
    "match_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_matched_at" TIMESTAMP(3),

    CONSTRAINT "categorization_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."recurring_series" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "merchant_key" TEXT NOT NULL,
    "category_id" TEXT,
    "cadence" "app"."RecurringCadence" NOT NULL,
    "expected_amount" DECIMAL(18,4) NOT NULL,
    "amount_tolerance_pct" DECIMAL(4,3) NOT NULL DEFAULT 0.10,
    "currency" TEXT NOT NULL,
    "last_seen_date" DATE NOT NULL,
    "next_expected_date" DATE,
    "status" "app"."RecurringStatus" NOT NULL DEFAULT 'active',
    "confidence_score" DECIMAL(4,3) NOT NULL,

    CONSTRAINT "recurring_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."recurring_series_transactions" (
    "recurring_series_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,

    CONSTRAINT "recurring_series_transactions_pkey" PRIMARY KEY ("recurring_series_id","transaction_id")
);

-- CreateTable
CREATE TABLE "app"."recurring_series_events" (
    "id" TEXT NOT NULL,
    "recurring_series_id" TEXT NOT NULL,
    "event_type" "app"."RecurringEventType" NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "recurring_series_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."investment_holdings" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "security_type" TEXT NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "avg_cost" DECIMAL(18,4),
    "currency" TEXT NOT NULL,
    "market_value" DECIMAL(18,4) NOT NULL,
    "as_of_date" DATE NOT NULL,
    "asset_class_tag" TEXT,

    CONSTRAINT "investment_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."investment_holdings_history" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "market_value" DECIMAL(18,4) NOT NULL,
    "as_of_date" DATE NOT NULL,

    CONSTRAINT "investment_holdings_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."investment_transactions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "symbol" TEXT,
    "trade_type" "app"."InvestmentTradeType" NOT NULL,
    "quantity" DECIMAL(20,8),
    "price" DECIMAL(18,4),
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "external_id" TEXT,

    CONSTRAINT "investment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."target_allocations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bucket_name" TEXT NOT NULL,
    "target_weight_pct" DECIMAL(5,2) NOT NULL,
    "drift_threshold_pct" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "target_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."holding_bucket_assignments" (
    "user_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "bucket_name" TEXT NOT NULL,
    "assigned_by" "app"."BucketAssignmentSource" NOT NULL DEFAULT 'user',

    CONSTRAINT "holding_bucket_assignments_pkey" PRIMARY KEY ("user_id","symbol")
);

-- CreateTable
CREATE TABLE "app"."alert_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rule_type" "app"."AlertRuleType" NOT NULL,
    "config" JSONB NOT NULL,
    "category_id" TEXT,
    "account_id" TEXT,
    "sinking_fund_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."alert_events" (
    "id" TEXT NOT NULL,
    "alert_rule_id" TEXT,
    "user_id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "related_entity_type" TEXT,
    "related_entity_id" TEXT,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."import_batches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "source_filename" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "column_mapping" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."csv_import_templates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "institution_name" TEXT NOT NULL,
    "column_mapping" JSONB NOT NULL,
    "date_format" TEXT NOT NULL,
    "amount_sign_convention" TEXT NOT NULL,

    CONSTRAINT "csv_import_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."category_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "category_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."category_template_items" (
    "id" TEXT NOT NULL,
    "category_template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_name" TEXT,
    "kind" "app"."CategoryKind" NOT NULL,
    "budget_type" "app"."BudgetType" NOT NULL DEFAULT 'none',
    "icon" TEXT,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "category_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "auth"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "auth"."accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "auth"."sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "auth"."verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "auth"."verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_base_currency_quote_currency_as_of_date_key" ON "app"."exchange_rates"("base_currency", "quote_currency", "as_of_date");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "app"."accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "plaid_items_plaid_item_id_key" ON "app"."plaid_items"("plaid_item_id");

-- CreateIndex
CREATE INDEX "plaid_items_user_id_idx" ON "app"."plaid_items"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ibkr_flex_configs_account_id_key" ON "app"."ibkr_flex_configs"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_transfer_pair_id_key" ON "app"."transactions"("transfer_pair_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_date_idx" ON "app"."transactions"("user_id", "date" DESC);

-- CreateIndex
CREATE INDEX "transactions_account_id_date_idx" ON "app"."transactions"("account_id", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_account_id_external_transaction_id_key" ON "app"."transactions"("account_id", "external_transaction_id");

-- CreateIndex
CREATE INDEX "transaction_splits_transaction_id_idx" ON "app"."transaction_splits"("transaction_id");

-- CreateIndex
CREATE INDEX "categories_user_id_idx" ON "app"."categories"("user_id");

-- CreateIndex
CREATE INDEX "budgets_category_id_effective_from_idx" ON "app"."budgets"("category_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "budget_period_snapshots_category_id_period_start_key" ON "app"."budget_period_snapshots"("category_id", "period_start");

-- CreateIndex
CREATE INDEX "sinking_funds_user_id_idx" ON "app"."sinking_funds"("user_id");

-- CreateIndex
CREATE INDEX "sinking_fund_contributions_sinking_fund_id_idx" ON "app"."sinking_fund_contributions"("sinking_fund_id");

-- CreateIndex
CREATE INDEX "categorization_rules_user_id_priority_idx" ON "app"."categorization_rules"("user_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_series_user_id_merchant_key_key" ON "app"."recurring_series"("user_id", "merchant_key");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_series_transactions_transaction_id_key" ON "app"."recurring_series_transactions"("transaction_id");

-- CreateIndex
CREATE INDEX "recurring_series_events_recurring_series_id_idx" ON "app"."recurring_series_events"("recurring_series_id");

-- CreateIndex
CREATE UNIQUE INDEX "investment_holdings_account_id_symbol_as_of_date_key" ON "app"."investment_holdings"("account_id", "symbol", "as_of_date");

-- CreateIndex
CREATE UNIQUE INDEX "investment_holdings_history_account_id_symbol_as_of_date_key" ON "app"."investment_holdings_history"("account_id", "symbol", "as_of_date");

-- CreateIndex
CREATE UNIQUE INDEX "investment_transactions_account_id_external_id_key" ON "app"."investment_transactions"("account_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "target_allocations_user_id_bucket_name_key" ON "app"."target_allocations"("user_id", "bucket_name");

-- CreateIndex
CREATE INDEX "alert_rules_user_id_idx" ON "app"."alert_rules"("user_id");

-- CreateIndex
CREATE INDEX "alert_events_user_id_triggered_at_idx" ON "app"."alert_events"("user_id", "triggered_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "csv_import_templates_user_id_institution_name_key" ON "app"."csv_import_templates"("user_id", "institution_name");

-- CreateIndex
CREATE UNIQUE INDEX "category_templates_name_key" ON "app"."category_templates"("name");

-- AddForeignKey
ALTER TABLE "auth"."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."users" ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."plaid_items" ADD CONSTRAINT "plaid_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ibkr_flex_configs" ADD CONSTRAINT "ibkr_flex_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "app"."import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_transfer_pair_id_fkey" FOREIGN KEY ("transfer_pair_id") REFERENCES "app"."transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "app"."transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."transaction_splits" ADD CONSTRAINT "transaction_splits_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."categories" ADD CONSTRAINT "categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "app"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."budgets" ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."budget_period_snapshots" ADD CONSTRAINT "budget_period_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."budget_period_snapshots" ADD CONSTRAINT "budget_period_snapshots_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."sinking_funds" ADD CONSTRAINT "sinking_funds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."sinking_funds" ADD CONSTRAINT "sinking_funds_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."sinking_fund_contributions" ADD CONSTRAINT "sinking_fund_contributions_sinking_fund_id_fkey" FOREIGN KEY ("sinking_fund_id") REFERENCES "app"."sinking_funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."sinking_fund_contributions" ADD CONSTRAINT "sinking_fund_contributions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "app"."transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."categorization_rules" ADD CONSTRAINT "categorization_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."categorization_rules" ADD CONSTRAINT "categorization_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."recurring_series" ADD CONSTRAINT "recurring_series_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."recurring_series" ADD CONSTRAINT "recurring_series_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."recurring_series_transactions" ADD CONSTRAINT "recurring_series_transactions_recurring_series_id_fkey" FOREIGN KEY ("recurring_series_id") REFERENCES "app"."recurring_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."recurring_series_transactions" ADD CONSTRAINT "recurring_series_transactions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "app"."transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."recurring_series_events" ADD CONSTRAINT "recurring_series_events_recurring_series_id_fkey" FOREIGN KEY ("recurring_series_id") REFERENCES "app"."recurring_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."investment_holdings" ADD CONSTRAINT "investment_holdings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."investment_holdings_history" ADD CONSTRAINT "investment_holdings_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."investment_transactions" ADD CONSTRAINT "investment_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."target_allocations" ADD CONSTRAINT "target_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."holding_bucket_assignments" ADD CONSTRAINT "holding_bucket_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."alert_rules" ADD CONSTRAINT "alert_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."alert_rules" ADD CONSTRAINT "alert_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."alert_events" ADD CONSTRAINT "alert_events_alert_rule_id_fkey" FOREIGN KEY ("alert_rule_id") REFERENCES "app"."alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."alert_events" ADD CONSTRAINT "alert_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."import_batches" ADD CONSTRAINT "import_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."import_batches" ADD CONSTRAINT "import_batches_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."csv_import_templates" ADD CONSTRAINT "csv_import_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."category_template_items" ADD CONSTRAINT "category_template_items_category_template_id_fkey" FOREIGN KEY ("category_template_id") REFERENCES "app"."category_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
