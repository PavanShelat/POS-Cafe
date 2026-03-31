# 📄 PRODUCT REQUIREMENT DOCUMENT (PRD)

## Feature: GST Taxation System for POS Café Management

---

## 1. 🎯 Objective

Implement a GST-compliant taxation system for a café POS that:

- Calculates GST (CGST + SGST) on orders  
- Generates GST-compliant invoices (PDF)  
- Provides monthly tax reports for filing  

---

## 2. 📌 Business Rules

### 2.1 Tax Structure

- Country: India  
- GST Model:  
  - CGST: 2.5%  
  - SGST: 2.5%  
  - Total GST: 5%  
- Same GST applied to all products  

---

### 2.2 Pricing Model

- Prices stored as: Tax Exclusive  
- GST is added during billing  

---

### 2.3 Discount Logic

- Discounts applied BEFORE tax calculation  

---

### 2.4 Tax Calculation Logic

**Formula:**

Subtotal = Sum of item prices  
Discounted Amount = Subtotal - Discount  

CGST = Discounted Amount * 2.5%  
SGST = Discounted Amount * 2.5%  

Final Total = Discounted Amount + CGST + SGST  

---

## 3. 🧾 Invoice Requirements

### Fields:

- Business Name  
- GSTIN  
- Invoice Number (unique)  
- Date & Time  
- Customer Details (Name / Phone)  

### Item List:

- Item Name  
- Quantity  
- Price  

### Totals:

- Subtotal  
- CGST (2.5%)  
- SGST (2.5%)  
- Final Amount  

### Format:

- Clean layout  
- Tax shown at total level only  
- Generate PDF invoice  

---

## 4. 📊 Reporting Module

### 4.1 Monthly GST Report

User can:

- Select date range (monthly)  

---

### 4.2 Report Fields:

- Total Sales (before tax)  
- Total CGST collected  
- Total SGST collected  
- Total Orders count  

---

### 4.3 Export:

- Format: Excel (.xlsx)  

---

## 5. ⚙️ Admin Controls

Admin can:

- Edit GST rate (default: 5%)  

Changes should apply to future orders only  

---

## 6. 🧠 Edge Cases

- Refund: Reverse GST proportionally  
- Zero discount case  
- Multiple items per order  
- Large order rounding  
- Invoice uniqueness (no duplication)  

---

## 7. 🗄️ DATABASE DESIGN

### 7.1 Orders Table

orders  
- id (PK)  
- invoice_number  
- customer_name  
- customer_phone  
- subtotal  
- discount  
- cgst_amount  
- sgst_amount  
- total_amount  
- created_at  

---

### 7.2 Order Items Table

order_items  
- id (PK)  
- order_id (FK)  
- product_id  
- name  
- quantity  
- price  
- total_price  

---

### 7.3 Tax Config Table

tax_config  
- id  
- gst_percentage (default 5)  
- cgst_percentage (2.5)  
- sgst_percentage (2.5)  
- updated_at  

---

## 8. 🔌 API DESIGN

### 8.1 Create Order

POST /orders  

Input:  
- items[]  
- discount  
- customer details  

Output:  
- full bill with tax breakdown  

---

### 8.2 Get Invoice

GET /orders/:id/invoice  
→ returns PDF  

---

### 8.3 GST Report

GET /reports/gst?start_date=&end_date=  

Output:  
- total_sales  
- total_cgst  
- total_sgst  
- total_orders  

---

### 8.4 Export Report

GET /reports/gst/export  
→ returns Excel file  

---

### 8.5 Update Tax

PUT /admin/tax  

Input:  
- gst_percentage  

---

## 9. 🖥️ UI FLOW

### Billing Screen:

- Add items  
- Apply discount  
- Show:  
  - Subtotal  
  - CGST  
  - SGST  
  - Final total  
- Enter customer details  
- Generate bill → PDF  

---

### Reports Screen:

- Select date range  
- View summary  
- Export Excel  

---

### Admin Panel:

- Update GST %  

---

## 10. ✅ ACCEPTANCE CRITERIA

- GST correctly calculated for all orders  
- Discount applied before tax  
- Invoice PDF generated correctly  
- GST report matches order data  
- Excel export works  
- GST update reflects in new orders only  