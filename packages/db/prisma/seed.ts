import { prisma, CategoryKind, BudgetType } from "../index";

type SeedItem = {
  name: string;
  kind: CategoryKind;
  budgetType: BudgetType;
};

const TEMPLATES: Record<string, SeedItem[]> = {
  "Personal Default": [
    { name: "Salary", kind: "income", budgetType: "none" },
    { name: "Other Income", kind: "income", budgetType: "none" },
    { name: "Housing", kind: "expense", budgetType: "monthly_reset" },
    { name: "Groceries", kind: "expense", budgetType: "monthly_reset" },
    { name: "Dining Out", kind: "expense", budgetType: "rollover_envelope" },
    { name: "Entertainment", kind: "expense", budgetType: "rollover_envelope" },
    { name: "Transportation", kind: "expense", budgetType: "monthly_reset" },
    { name: "Subscriptions", kind: "expense", budgetType: "monthly_reset" },
    { name: "Travel", kind: "expense", budgetType: "sinking_fund" },
    { name: "Car Maintenance", kind: "expense", budgetType: "sinking_fund" },
    { name: "Insurance", kind: "expense", budgetType: "monthly_reset" },
    { name: "Shopping", kind: "expense", budgetType: "rollover_envelope" },
    { name: "Miscellaneous", kind: "expense", budgetType: "monthly_reset" },
    { name: "Transfer", kind: "transfer", budgetType: "none" },
  ],
  "Freelancer / Irregular Income": [
    { name: "Client Income", kind: "income", budgetType: "none" },
    { name: "Other Income", kind: "income", budgetType: "none" },
    { name: "Housing", kind: "expense", budgetType: "monthly_reset" },
    { name: "Business Expenses", kind: "expense", budgetType: "rollover_envelope" },
    { name: "Taxes Reserve", kind: "expense", budgetType: "sinking_fund" },
    { name: "Health Insurance", kind: "expense", budgetType: "monthly_reset" },
    { name: "Dining Out", kind: "expense", budgetType: "rollover_envelope" },
    { name: "Travel", kind: "expense", budgetType: "sinking_fund" },
    { name: "Equipment", kind: "expense", budgetType: "sinking_fund" },
    { name: "Miscellaneous", kind: "expense", budgetType: "rollover_envelope" },
    { name: "Transfer", kind: "transfer", budgetType: "none" },
  ],
  "Family / Joint Accounts": [
    { name: "Household Income", kind: "income", budgetType: "none" },
    { name: "Housing", kind: "expense", budgetType: "monthly_reset" },
    { name: "Groceries", kind: "expense", budgetType: "monthly_reset" },
    { name: "Childcare", kind: "expense", budgetType: "monthly_reset" },
    { name: "Kids Activities", kind: "expense", budgetType: "rollover_envelope" },
    { name: "Dining Out", kind: "expense", budgetType: "rollover_envelope" },
    { name: "Utilities", kind: "expense", budgetType: "monthly_reset" },
    { name: "Insurance", kind: "expense", budgetType: "monthly_reset" },
    { name: "Car Maintenance", kind: "expense", budgetType: "sinking_fund" },
    { name: "Family Travel", kind: "expense", budgetType: "sinking_fund" },
    { name: "Subscriptions", kind: "expense", budgetType: "monthly_reset" },
    { name: "Miscellaneous", kind: "expense", budgetType: "rollover_envelope" },
    { name: "Transfer", kind: "transfer", budgetType: "none" },
  ],
};

async function main() {
  for (const [templateName, items] of Object.entries(TEMPLATES)) {
    const template = await prisma.categoryTemplate.upsert({
      where: { name: templateName },
      update: {},
      create: { name: templateName },
    });

    await prisma.categoryTemplateItem.deleteMany({
      where: { categoryTemplateId: template.id },
    });

    await prisma.categoryTemplateItem.createMany({
      data: items.map((item, index) => ({
        categoryTemplateId: template.id,
        name: item.name,
        kind: item.kind,
        budgetType: item.budgetType,
        sortOrder: index,
      })),
    });

    console.log(`Seeded template "${templateName}" with ${items.length} categories`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
