# 📘 prd.md — Odoo Cafe POS (MVP + Customer QR Ordering)

## 1. Product Overview

**Product Name:** Odoo Cafe POS  
**Type:** Web-based Restaurant Point of Sale System  
**Primary Users:**  
- POS Staff / Admin  
- Kitchen Staff  
- Customers (QR-based self ordering)

**Platform:**  
- POS & Kitchen: Desktop / Tablet (Web)  
- Customer: Mobile Browser (Web)

---

## 2. Problem Statement

Restaurants require a **modern POS system** that supports:
- Table-based ordering
- Real-time kitchen coordination
- Multiple payment methods (Cash, Digital, UPI)
- Customer self-ordering via QR
- Controlled order confirmation to avoid fake or unpaid orders

---

## 3. Goals & Success Criteria (MVP)

### Goals
- Enable POS staff to manage sessions, tables, orders, and payments
- Allow customers to scan a QR, browse menu, place and pay for orders
- Ensure POS staff confirms customer-paid orders before kitchen processing
- Maintain real-time sync across POS, Kitchen, and Customer views

### Success Criteria
- Customer can complete order + payment without staff help
- POS receives customer orders for confirmation
- Kitchen receives only confirmed orders
- Sales and session totals remain accurate

---

## 4. User Roles

### 4.1 POS Admin / Staff
- Login & authentication
- Configure products, tables, and payment methods
- Open / close POS sessions
- Create manual orders
- Confirm customer-paid orders
- Send confirmed orders to kitchen
- View basic reports

### 4.2 Kitchen Staff
- View confirmed orders
- Update order preparation stages

### 4.3 Customer
- Scan QR on table
- View menu
- Place and pay for order
- Track order status

---

## 5. Features In Scope (MVP)

---

## 5.1 Authentication
- POS & Kitchen users: Email + Password (Supabase Auth)
- Customers: No login required

---

## 5.2 POS Backend Configuration

### Product Management
- Name
- Category
- Price
- Active / Inactive

### Payment Methods
- Cash
- Digital (Card/Bank)
- UPI QR (UPI ID stored in system)

### Floor & Table Management
- Create floors
- Manage tables:
  - Table number
  - Seats
  - Active status
  - Auto-generated QR code per table

---

## 5.3 POS Session Management
- POS staff opens a session
- All orders are linked to an active session
- Session tracks:
  - Orders count
  - Total sales
- Closing session disables new orders

---

## 5.4 POS Terminal (Staff Interface)

### Floor / Table View
- Tables shown as cards
- Table status:
  - Available
  - Occupied
  - Pending Confirmation (customer-paid order waiting)

### Order Confirmation Queue (New)
- List of customer-paid orders
- POS staff can:
  - Review order details
  - Confirm order
  - Reject order (manual refund – post-MVP automation)

---

## 5.5 Customer QR Ordering (New Feature)

### QR Scan Flow
- Customer scans QR placed on table
- Redirected to customer menu web app
- Table ID & session info passed via secure token

### Customer Menu
- Browse product categories
- Add/remove items
- Adjust quantities
- View live total

### Customer Payment Flow
- Customer proceeds to payment
- Supported methods:
  - UPI QR
  - Digital (Card/Bank)
- Payment-first approach

### Post-Payment State
- Order created with status: `Paid – Pending POS Confirmation`
- Customer sees confirmation message and waiting status

---

## 5.6 POS Order Confirmation Flow (New)
- Customer-paid orders appear in POS dashboard
- POS staff actions:
  - Confirm order → sent to kitchen
  - Reject order → order cancelled (refund handled manually)

---

## 5.7 Kitchen Display System (KDS)
- Receives only confirmed orders
- Order stages:
  1. To Cook
  2. Preparing
  3. Completed
- Kitchen staff updates order status in real time

---

## 5.8 POS Manual Payment Flow
- Cash
- Digital (Card/Bank)
- UPI QR
- POS orders follow pay-after-order flow

---

## 5.9 Customer Display
- Shows:
  - Order items
  - Total amount
  - Payment status
  - Order status (Waiting / Preparing / Completed)

---

## 5.10 Reports & Dashboard
- Total sales
- Orders count
- Filters:
  - Date
  - Session
- Includes both POS and Customer QR orders

---

## 6. Unified Order Lifecycle

1. Order created (POS or Customer QR)
2. Payment completed
3. Customer orders → Pending POS Confirmation
4. POS confirms order
5. Order sent to Kitchen
6. Order prepared & completed
7. Reflected in reports

---

## 7. Tech Stack

### Frontend
- React
- Vite
- Tailwind CSS
- React Router

### Backend
- Supabase
  - PostgreSQL
  - Authentication
  - Realtime subscriptions
  - Storage (QR codes if required)

---

## 8. Core Data Models (MVP)

### Table
- id
- table_number
- qr_token

### Order
- id
- table_id
- session_id
- source (`pos | customer`)
- status (`pending_confirmation | confirmed | cancelled`)
- payment_status (`paid | unpaid`)
- total_amount

### OrderItem
- id
- order_id
- product_id
- quantity
- price

### Payment
- id
- order_id
- method
- amount
- status

### Session
- id
- opened_at
- closed_at
- total_sales

---

## 9. Out of Scope (Post-MVP)
- Automated refunds
- Inventory management
- Online delivery
- Loyalty programs
- Advanced analytics

---

## 10. MVP Delivery Expectation
- Fully functional POS + Customer QR flow
- Real-time sync between POS, Kitchen, and Customer
- Payment-first customer ordering
- Stable, demo-ready hackathon product
