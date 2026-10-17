// Demo data for local development: `npm run seed`.
// Only writes to an empty database, and refuses to run with NODE_ENV=production.
import "dotenv/config";
import crypto from "node:crypto";
import { prisma } from "./prisma.js";

async function seedIfEmpty() {
  const productCount = await prisma.product.count();
  if (productCount > 0) {
    console.log("Database already has products; nothing seeded.");
    return;
  }

  const categories = [
    { name: "Coffee", icon: "coffee" },
    { name: "Tea", icon: "tea" },
    { name: "Snacks", icon: "snacks" },
    { name: "Desserts", icon: "desserts" },
    { name: "Beverages", icon: "beverages" },
    { name: "Sandwiches", icon: "sandwiches" },
  ];

  await prisma.category.createMany({ data: categories });
  const createdCategories = await prisma.category.findMany();
  const categoryMap = new Map(createdCategories.map(cat => [cat.name, cat.id]));

  const products = [
    { name: "Espresso", category: "Coffee", price: 120, active: true, description: "Rich and bold single shot" },
    { name: "Americano", category: "Coffee", price: 150, active: true, description: "Espresso with hot water" },
    { name: "Cappuccino", category: "Coffee", price: 180, active: true, description: "Espresso with steamed milk foam" },
    { name: "Latte", category: "Coffee", price: 200, active: true, description: "Espresso with creamy steamed milk" },
    { name: "Masala Chai", category: "Tea", price: 80, active: true, description: "Spiced Indian tea" },
    { name: "Green Tea", category: "Tea", price: 100, active: true, description: "Light and refreshing" },
    { name: "Croissant", category: "Snacks", price: 150, active: true, description: "Buttery, flaky pastry" },
    { name: "Muffin", category: "Snacks", price: 120, active: true, description: "Blueberry or chocolate chip" },
    { name: "Chocolate Cake", category: "Desserts", price: 180, active: true, description: "Rich chocolate layers" },
    { name: "Cheesecake", category: "Desserts", price: 220, active: true, description: "Creamy New York style" },
    { name: "Fresh Lime Soda", category: "Beverages", price: 90, active: true, description: "Refreshing lime drink" },
    { name: "Mango Smoothie", category: "Beverages", price: 180, active: true, description: "Creamy mango blend" },
    { name: "Grilled Cheese", category: "Sandwiches", price: 180, active: true, description: "Melted cheese on sourdough" },
    { name: "Club Sandwich", category: "Sandwiches", price: 250, active: true, description: "Triple-decker classic" },
  ];

  await prisma.product.createMany({
    data: products.map(p => ({
      name: p.name,
      category_id: categoryMap.get(p.category) || null,
      price: p.price,
      active: p.active,
      description: p.description,
    })),
  });

  await prisma.floor.createMany({
    data: [
      { name: "Ground Floor" },
      { name: "Terrace" },
    ],
  });

  const floors = await prisma.floor.findMany();
  const floorMap = new Map(floors.map(f => [f.name, f.id]));

  const tables = [
    { floor: "Ground Floor", table_number: "T1", seats: 2 },
    { floor: "Ground Floor", table_number: "T2", seats: 4 },
    { floor: "Ground Floor", table_number: "T3", seats: 4 },
    { floor: "Ground Floor", table_number: "T4", seats: 6 },
    { floor: "Ground Floor", table_number: "T5", seats: 2 },
    { floor: "Ground Floor", table_number: "T6", seats: 4 },
    { floor: "Terrace", table_number: "T7", seats: 4 },
    { floor: "Terrace", table_number: "T8", seats: 6 },
    { floor: "Terrace", table_number: "T9", seats: 8 },
    { floor: "Terrace", table_number: "T10", seats: 2 },
  ];

  await prisma.table.createMany({
    data: tables.map(t => ({
      floor_id: floorMap.get(t.floor),
      table_number: t.table_number,
      seats: t.seats,
      qr_token: crypto.randomUUID(),
      active: true,
      status: "available",
    })),
  });

  await prisma.pOSConfig.create({
    data: {
      restaurant_name: "Bean & Brew Cafe",
      gstin: "29ABCDE1234F1Z5",
      upi_id: "beanbrewcafe@upi",
      currency: "Rs ",
      tax_rate: 5,
    },
  });

  const activeSession = await prisma.session.findFirst({ where: { is_active: true } });
  if (!activeSession) {
    await prisma.session.create({ data: { is_active: true, total_sales: 0, orders_count: 0 } });
  }

  console.log("Seeded demo menu, floors, tables and config.");
}

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo data with NODE_ENV=production.");
  process.exit(1);
}

try {
  await seedIfEmpty();
} finally {
  await prisma.$disconnect();
}
