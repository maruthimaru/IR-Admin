 Update Records on Save — How It Works                                                                                
                                                                                                                       
  Scenario: You have an Inventory form and an Order form. When an order is saved, you want to automatically deduct     
  stock quantity and mark the item as "sold" in inventory.                                                             
                                                                                                                       
  ---                                                                                                                  
  Step 1 — Inventory Form
                                                                                                                       
  Create a form called inventory with these fields:
                                                                                                                       
  ┌───────────┬───────────┬──────────────────────────────────────┐                                                     
  │   Field   │    Key    │                 Type                 │
  ├───────────┼───────────┼──────────────────────────────────────┤                                                     
  │ Item Name │ item_name │ Text                                 │                                                     
  ├───────────┼───────────┼──────────────────────────────────────┤                                                     
  │ Stock Qty │ stock_qty │ Number                               │                                                     
  ├───────────┼───────────┼──────────────────────────────────────┤
  │ Status    │ status    │ Select (Purchased / In Stock / Sold) │
  └───────────┴───────────┴──────────────────────────────────────┘
                                          
  ---
  Step 2 — Order Form with Sub-Form                                                                                    
                                              
  Create an order form with an order_items Sub Form field containing:                                                  
                                              
  ┌────────────────┬──────────────┬──────────────┬──────────────────────────────────────────┐                          
  │     Field      │     Key      │     Type     │                  Notes                   │
  ├────────────────┼──────────────┼──────────────┼──────────────────────────────────────────┤                          
  │ Inventory Item │ inventory_id │ API Dropdown │ Source Form = inventory, Value Key = _id │
  ├────────────────┼──────────────┼──────────────┼──────────────────────────────────────────┤                          
  │ Qty Ordered    │ qty_ordered  │ Number       │                                          │                          
  ├────────────────┼──────────────┼──────────────┼──────────────────────────────────────────┤
  │ Action         │ action       │ Select       │ Options: new, cancel                     │                          
  └────────────────┴──────────────┴──────────────┴──────────────────────────────────────────┘                          
                                          
  ---                                                                                                                  
  Step 3 — Configure "Update Records on Save"                                                                          
                                              
  Open the order_items sub-form field in the builder → expand Update Records on Save:                                  
                                              
  Enable ✓                                                                                                             
  Target Form: inventory
  Lookup Key: inventory_id ← this is the sub-form field whose value is the inventory record's _id                      
                                              
  ---                                                                                                                  
  Step 4 — Add Update Rules                                                                                            
                                                                                                                       
  Rule 1 — Deduct stock quantity                                                                                       
  Target Field:  stock_qty                                                                                             
  Operation:     Subtract (−)             
  Value Source:  From Field → qty_ordered     
  → inventory.stock_qty -= row.qty_ordered                                                                             
                                              
  Rule 2 — Update status (Conditional)                                                                                 
                                              
  Operation:     Set (=)                                                                                               
  Value Source:  Conditional
    Condition Field: action                                                                                            
    When "new"    → sold                      
    When "cancel" → in_stock                                                                                           
    Default:        in_stock
  → If action = "new", sets inventory.status = "sold"                                                                  
  → If action = "cancel", sets inventory.status = "in_stock"
                                                                                                                       
  ---                                                                                                                  
  What Happens on Save
                                                                                                                       
  User creates an order:
  order_items: [                                                                                                       
    { inventory_id: "abc123", qty_ordered: 5, action: "new" },
    { inventory_id: "def456", qty_ordered: 2, action: "new" },
  ]                                                                                                                    
                                              
  Backend runs _apply_subform_updates():                                                                               
                                                                                                                       
  1. Finds inventory record _id = abc123 → runs:                                                                       
    - $inc: { stock_qty: -5 } (subtract 5)                                                                             
    - $set: { status: "sold" } (action = "new" → "sold")                                                               
  2. Finds inventory record _id = def456 → runs:                                                                       
    - $inc: { stock_qty: -2 }                                                                                          
    - $set: { status: "sold" }                                                                                         
                                                                                                                       
  User cancels the same order (creates a cancel order with action = "cancel"):                                         
  - $inc: { stock_qty: +2 } (add back — use Add (+) rule for cancel form)                                              
  - $set: { status: "in_stock" } (action = "cancel" → "in_stock")                                                      
                                                                                                                       
  ---                                         
  Value Source Summary                                                                                                 
                      
  ┌─────────────┬─────────────────────────────────────────┬───────────────────────────────────────────────────────┐    
  │    Mode     │               When to use               │                        Example                        │
  ├─────────────┼─────────────────────────────────────────┼───────────────────────────────────────────────────────┤    
  │ From Field  │ Copy/use a number from sub-form row     │ Subtract qty_ordered from stock_qty                   │
  ├─────────────┼─────────────────────────────────────────┼───────────────────────────────────────────────────────┤    
  │ Static      │ Always write a hardcoded text           │ Always set status = "sold" regardless of anything     │
  │ Value       │                                         │                                                       │    
  ├─────────────┼─────────────────────────────────────────┼───────────────────────────────────────────────────────┤
  │ Conditional │ Different value based on a sub-form     │ action = "new" → "sold", action = "cancel" →          │    
  │             │ field                                   │ "in_stock"                                            │    
  └─────────────┴─────────────────────────────────────────┴─────────────────────────────────────────