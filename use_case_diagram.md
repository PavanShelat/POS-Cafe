# POS Cafe - Use Case Diagram

```mermaid
useCaseDiagram
    actor "POS Staff / Admin" as Admin
    actor "Kitchen Staff" as Kitchen
    actor "Customer" as Customer

    package "POS Cafe System" {
        
        usecase "Login & Authentication" as UC1
        usecase "Manage Products & Categories" as UC2
        usecase "Manage Tables & Floors" as UC3
        usecase "Manage POS Sessions (Open/Close)" as UC4
        
        usecase "Scan QR Code" as UC5
        usecase "Browse Menu" as UC6
        usecase "Manage Cart" as UC7
        usecase "Place Order & Pay" as UC8
        usecase "Track Order Status" as UC9
        
        usecase "View Floor Plan & Table Status" as UC10
        usecase "Create Manual Order" as UC11
        usecase "Process Manual Payment" as UC12
        usecase "Confirm/Reject Customer Orders" as UC13
        
        usecase "View Confirmed Orders" as UC14
        usecase "Update Order Status (Cook/Ready)" as UC15
        
        usecase "View Sales Reports" as UC16
    }

    Admin --> UC1
    Admin --> UC2
    Admin --> UC3
    Admin --> UC4
    Admin --> UC10
    Admin --> UC11
    Admin --> UC12
    Admin --> UC13
    Admin --> UC16

    Customer --> UC5
    Customer --> UC6
    Customer --> UC7
    Customer --> UC8
    Customer --> UC9

    Kitchen --> UC14
    Kitchen --> UC15

    %% Relationships
    UC8 ..> UC13 : <<include>> (Requires Confirmation)
    UC13 ..> UC14 : <<include>> (Sends to Kitchen)
```
