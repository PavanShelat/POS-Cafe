# POS-Cafe Project Overview

## Product Summary
POS-Cafe is a web-based cafe Point of Sale system with four user roles:
- Admin
- Cashier
- Kitchen Staff
- Customer (QR ordering)

The system supports table management, POS/manual ordering, customer QR ordering, payment-first flow, kitchen workflow, and order/session reporting.

## Role-Based Activities

### Admin
1. Sign in and access all protected modules.
2. Perform first-time setup (create the first admin account).
3. Manage staff accounts (create staff, assign roles, delete staff).
4. Access settings and review product/table/payment configuration views.
5. Monitor all orders (confirmed, pending, cancelled).
6. Access kitchen and reports views.
7. Manage POS session lifecycle (open/close session).

### Cashier
1. Sign in and access POS terminal views.
2. Open Floor View and pick a table.
3. Create manual POS orders from product catalog.
4. Collect payment in POS order flow (cash/card/UPI) before kitchen processing.
5. Submit paid order so it can be processed by kitchen.
6. Review pending customer QR orders and confirm/reject them.
7. View orders page and open order detail modal for item-level details.
8. Track session totals and active orders.

### Kitchen Staff
1. Sign in and access Kitchen Display.
2. View only confirmed and paid orders.
3. Process each order through kitchen stages:
   - To Cook
   - Preparing
   - Completed
4. Update kitchen status in real time.
5. Complete tickets so table status can move toward availability.

### Customer (QR Ordering)
1. Scan table QR code.
2. Open customer menu for that table.
3. Browse categories and products.
4. Add/remove items in cart.
5. Proceed to payment and choose payment method (UPI or digital).
6. Place paid order.
7. View order status page after payment.

## Core Operational Flow
1. Staff opens an active POS session.
2. Order is created from either:
   - POS manual flow (cashier)
   - Customer QR flow
3. Payment is completed.
4. Customer-origin orders go to pending confirmation queue.
5. Cashier confirms customer orders.
6. Confirmed + paid orders are visible in Kitchen Display.
7. Kitchen processes order to completion.
8. Orders are visible in Orders page and included in reporting/session totals.

## Main Pages in This Project
- Login / Setup
- Floor View
- Orders
- Kitchen Display
- Reports
- Settings
- Staff Management
- Customer Menu
- Customer Payment
- Customer Order Status

## Notes
- Supabase is used for auth and backend infrastructure.
- Prisma is used for database access and CRUD APIs.
- Dummy menu data is auto-seeded when database is empty.
