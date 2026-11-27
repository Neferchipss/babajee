import type { LegacyFig } from "./legacy-figures";

// The Legacy guide's words: chapters (the index's groups, one shown at a
// time like HDRI Knight's tabs), each a run of numbered sections. Every
// button, tab, field and chip named here is in the Legacy admin's code
// (AdminNav / nav-data.tsx and the pages under app/admin); the people,
// orders and products in the drawings are made up.
//
// In the words: **bold** for a name on screen, [[section-id|words]] for a
// link to another section.

export type Block =
  | { p: string }
  | { group: string }
  | { controls: [string, string][] }
  | { steps: string[] }
  | { tip: string }
  | { careful: string };
export type LSection = { id: string; title: string; lead: string; blocks?: Block[]; fig?: LegacyFig; paths?: string[] };
export type LChapter = { id: string; label: string; sections: LSection[] };

export const LEGACY: LChapter[] = [
  {
    id: "start",
    label: "Getting started",
    sections: [
      {
        id: "l-layout",
        title: "Finding your way",
        lead: "The Legacy admin sits inside the shop's own frame: the shop's header with the admin search along the top, the section tree down the left, and the open page beside it.",
        paths: ["/admin/help"],
        blocks: [
          {
            controls: [
              ["Section tree", "Home, Orders, Catalogue, Inventory, Customers, Finance, Storefront, Analytics and Settings. The open section shows every page it holds on a guide line under it."],
              ["Counts", "The numbers beside a page are live: orders waiting to be paid, packed or dispatched, customer requests (in red), and low stock beside Inventory."],
              ["View shop · Admin design · Documentation", "At the foot of the tree: the shop itself, the theme picker, and this guide."],
              ["Search", "One box across the admin: orders (number, name, phone, email, city, pincode), products (name, category, options, SKU), customers and the admin's pages. Results come as you type; **Ctrl+K** or **/** jumps to it."],
              ["On a phone", "The sections become a strip across the top, and under it the open section's pages as a row of chips with the same counts."],
            ],
          },
          { tip: "What you see depends on your role: a page outside it isn't in your tree. See [[l-team|Team and roles]]." },
        ],
        fig: {
          label: "The Legacy layout",
          mock: { nav: "Orders/Payment pending#2", title: "Payment pending", sub: "Not paid yet. Contact each customer to take payment, then mark it paid.", actions: ["Export", "*New order#3"], search: "Search by order number, name, phone or email#4", table: { cols: ["Order", "Date", "Customer", "Status", "Total"], rows: [["BJ-2041", "24 Nov 4:10 pm", "Riya Demo", "*Payment pending", "₹1,250"], ["BJ-2040", "24 Nov 1:02 pm", "Kabir Demo", "*Payment pending", "₹640"]] } },
          callouts: [
            [2, "The section tree: the open section lists its pages, each with its live count."],
            [3, "The page's main action sits at the top right of its head."],
            [4, "Every list has its own search under the head; the header's search looks across the whole admin."],
          ],
        },
      },
      {
        id: "l-mode",
        title: "Light, dark or as the device is",
        lead: "Legacy follows the shop's colours, so it has a light and a dark look. Pick one from your account menu in the header.",
        blocks: [
          { steps: ["Open your account menu (the person icon at the right of the header).", "Pick **System**, **Light** or **Dark**. System follows the device, and is where everyone starts."] },
          { tip: "The choice is kept in this browser; it changes the admin and the shop together." },
        ],
      },
      {
        id: "l-theme",
        title: "Switching to Aronium-style",
        lead: "The admin has two themes: Legacy, the admin as it was, and Aronium-style, a copy of Aronium's back office. Every page, button and permission is the same in both; only the layout and look change.",
        paths: ["/admin/settings/design"],
        blocks: [
          { steps: ["Open **Settings › Admin design**, or **Admin design** at the foot of the tree.", "Press **Use Aronium-style** to switch at once, or **Preview in a new tab** to look without switching.", "To come back, open **Admin theme** in Aronium-style's menu and choose **Legacy**."] },
          { tip: "Your pick is saved on your account, so it follows you to any device you sign in on. Each person picks their own." },
        ],
        fig: {
          label: "Settings › Admin design",
          mock: { nav: "Settings/Admin design", title: "Admin design", sub: "Two ways the admin can look and work.", cards: [{ title: "Legacy", lines: ["The admin as it was", "Section tree, the shop's colours"], buttons: ["*In use"] }, { title: "Aronium-style", lines: ["Based on Aronium's back office"], buttons: ["Use Aronium-style#1", "Preview in a new tab#2"] }] },
          callouts: [
            [1, "Switches you to Aronium-style at once."],
            [2, "Opens the admin in a new tab in that theme, changing nothing."],
          ],
        },
      },
      {
        id: "l-docs",
        title: "Using this guide",
        lead: "This is the Legacy theme's guide. Each chapter in the index holds numbered sections; every drawing is a small copy of the real screen with numbered callouts.",
        blocks: [
          { controls: [["Index", "Chapters down the left; press a chapter's arrow to fold it."], ["Search", "Finds sections by their words, not only their titles."], ["Links", "Each section has its own address (?a=…), so you can send someone straight to it."]] },
          { tip: "Opened from a page, the guide starts at that page's section." },
        ],
      },
    ],
  },

  {
    id: "orders",
    label: "Home and orders",
    sections: [
      {
        id: "l-home",
        title: "Home",
        lead: "The first page: today at a glance, and what needs doing.",
        paths: ["/admin"],
        blocks: [{ controls: [["Today vs yesterday", "Today against yesterday; **Full analytics →** opens Analytics."], ["Pending actions", "Orders waiting on you, each step with its count."], ["Follow-ups", "Contacts logged with **Needs a follow-up** ticked, until they're done."], ["Latest orders", "The newest orders; **All orders** opens the list."]] }],
      },
      {
        id: "l-orders",
        title: "Order lists",
        lead: "Orders is one list split by step: Payment pending, To pack, Ready to dispatch, On the way, then Customer requests, Delivery problems, Delivered, Cancelled & refunded and Counter sales. Each page says in a line what it's for, and each order carries the one button that moves it on.",
        paths: ["/admin/orders"],
        blocks: [
          {
            controls: [
              ["Payment pending · Mark paid", "Not paid yet. Contact the customer, then **Mark paid**. Each order shows how long ago it was placed and how long before it cancels itself (Settings › Orders, returns and carts). **Call**, **WhatsApp** and **Log** sit on every unpaid order."],
              ["To pack · Packed", "Paid and ready to pack."],
              ["Ready to dispatch · Ship…", "Packed; ship each with its courier and tracking number."],
              ["On the way · Delivered", "With the courier; mark each delivered when it arrives."],
              ["Customer requests · Review", "Customers asking to cancel or return."],
              ["Delivery problems · Sort it out", "Orders the courier couldn't deliver."],
            ],
          },
          { group: "Many at once" },
          { p: "Tick orders to move them together: from **To pack** to packed, or from **On the way** to delivered. Marking paid is one order at a time, because each needs how it was paid." },
          { p: "**Export** downloads the orders shown (or the ticked ones) as a sheet; **New order** takes an order yourself; **Carts →** opens [[l-carts|Carts]]." },
        ],
        fig: {
          label: "Orders › To pack",
          mock: { nav: "Orders/To pack", title: "To pack", sub: "Paid and ready to pack. Pack them, then mark them packed.", actions: ["Export#3", "*New order"], search: "Search by order number, name, phone or email", table: { ticks: true, sel: 0, cols: ["Order", "Customer", "Items", "Total", ""], rows: [["BJ-2038", "Riya Demo", "2 items", "₹1,250", "*Packed#1"], ["BJ-2037", "Kabir Demo", "1 item", "₹640", "Packed"]] }, chips: ["2 ticked: Packed#2"] },
          callouts: [
            [1, "The step button moves this one order on."],
            [2, "Tick several to move them in one go."],
            [3, "A sheet of the orders shown, or of the ticked ones."],
          ],
        },
      },
      {
        id: "l-till",
        title: "Counter sale (till)",
        lead: "For customers who walk in to the shop's counter: a till laid out like a shop till, the same in both designs. A counter sale is paid and handed over on the spot, so it has no address or delivery; its stock comes off and its GST invoice is issued like any paid order's. Online orders don't change.",
        paths: ["/admin/counter", "/admin/counter/receipt"],
        blocks: [
          {
            controls: [
              ["Products (right)", "Groups as buttons, then products, then a product's options. **⌂** goes back; the arrows page through. Search everything, barcodes, codes or names; a scanner's Enter adds an exact barcode or code at once."],
              ["Ticket (left)", "Tap a line to select it. **✕ Delete**, **Quantity** (or + and −). **Void order** (tap twice), **Lock**, **Repeat round** (the last sale's items again)."],
              ["Customer", "Put the sale on a customer's account, or just a name and phone; a business buyer's **GSTIN** for a B2B invoice; a note."],
              ["Discount · Price", "A percent or an amount off the selected item or the whole sale, or a different price, as far as Settings › Counter (till) allows."],
              ["F9 Save sale", "Park the ticket; resume it from ≡ › **View open sales**."],
              ["F10 Payment", "Pick how they paid; for cash, the note they hand you, and the till shows the change. Split between ways by adding another payment. Only cash can be paid over the total."],
              ["Quick ways to pay", "The first three ways to pay have their own buttons (**F12** is cash): paid in full that way, done at once."],
              ["≡ menu", "Management, **View sales history** (reprint the receipt or invoice, refund, open), **View open sales**, **Reprint last receipt**, **Credit payments**, **Split order**, **Cash in / out**, **End of day**, **Till settings**, **Lock**."],
              ["Refund", "Scan or type the receipt number, pick what comes back and how the money goes back (cash comes out of the drawer). Stock goes back, a credit note is issued and a refund slip prints."],
              ["On account", "In Payment, for a customer with an account when Settings › Counter (till) allows it: they pay later, all or part, within their credit limit. The invoice is issued with the sale."],
              ["Split", "Move lines to a ticket of their own (paid as a separate sale), or **Split evenly by** N in Payment for N equal payments."],
              ["Reprints", "Say **REPRINT** on the receipt and **DUPLICATE** on the A4 invoice. Deleted lines and voided tickets are recorded for the Voided items report."],
            ],
          },
          { p: "After a sale the bar above the ticket offers **Receipt**, **GST invoice** and **Open**. The receipt prints on its own if Settings say so, on an 80 or 58 mm roll or A4. Counter sales show in Orders under **Counter sales**, tagged \"counter\"; an order's page has **Counter sale · receipt**." },
          { careful: "A sale is real the moment it's done: stock comes off and an invoice number is taken. To undo one, refund it from its page." },
        ],
      },
      {
        id: "l-order",
        title: "An order's page",
        lead: "Open any order to see it all: the road of steps, the items and money, the customer, delivery, and every note and contact.",
        paths: ["/admin/orders/view"],
        blocks: [
          {
            controls: [
              ["The road", "Paid, packed, shipped, delivered. The next step is a button; **or tap a step on the road, forward or back**."],
              ["Log a contact", "Records a call or message: how, what happened, and **Needs a follow-up** to list it on Home until done."],
              ["Edit order", "Change quantities or add items; the new total is shown before you save."],
              ["Return items · Refund", "Take items back and refund them, or refund an amount. Each refund can be undone with **Reverse refund**."],
              ["Credit notes", "Issued for refunds on an invoiced order."],
              ["Courier", "The courier and tracking number, with a link to track it."],
              ["Notes and activity", "Staff comments (**Post**), the order's note (**Save note**), and everything that happened."],
              ["Buyer's GSTIN (B2B)", "Add a business buyer's GSTIN for a tax invoice in their name."],
            ],
          },
        ],
        fig: {
          label: "An order's page",
          mock: { nav: "Orders/All orders", back: "Orders", title: "BJ-2038", actions: ["Log a contact#2", "Edit order", "Return items", "Refund#3"], road: ["Paid", "*Packed#1", "~Shipped", "~Delivered"], cards: [{ title: "Items", lines: ["Glass bong 30 cm · ₹1,000", "Rolling papers · ₹250", "*Total ₹1,250"] }, { title: "Notes and activity#4", lines: ["Paid by UPI · 24 Nov", "Packed · 24 Nov"], buttons: ["Post"] }] },
          callouts: [
            [1, "The road: the order's steps, the current one lit."],
            [2, "Log a call or message, with a follow-up if needed."],
            [3, "Refund money; Return items takes things back first."],
            [4, "Staff comments and the whole history."],
          ],
        },
      },
      {
        id: "l-new",
        title: "New order",
        lead: "Take an order yourself, for a phone or WhatsApp customer.",
        paths: ["/admin/orders/new"],
        blocks: [
          {
            controls: [
              ["Customer", "**Find a customer: name, phone…**, or type a new one's details. **Change** clears the pick."],
              ["Items", "**Find a product by name** and pick it; type a quantity and, if needed, a price. Products without a price can be added with one typed in."],
              ["Deliver to", "The address; a saved one fills it in. **Pick a state** sets which GST applies."],
              ["Buyer's GSTIN (B2B)", "Only for a business buyer."],
              ["Payment already received", "Tick it if they've paid; otherwise the order waits in Payment pending."],
              ["Notes", "Anything to remember: how they paid, when to deliver."],
            ],
          },
          { p: "**Create order** shows the total on the button and opens the new order." },
        ],
        fig: {
          label: "Orders › New order",
          mock: { nav: "Orders/New order", title: "New order", cards: [{ title: "Customer#1", fields: [["Find a customer", "Riya Demo · 98XXXXXX01"]] }, { title: "Items#2", lines: ["Glass bong 30 cm × 1 · ₹1,000"], fields: [["Find a product by name", ""]] }, { title: "Total", lines: ["Subtotal ₹1,000", "Delivery ₹60"], fields: [["Payment already received#3", "☐"]], buttons: ["*Create order · ₹1,060#4"] }] },
          callouts: [
            [1, "Pick the customer, or type a new one."],
            [2, "Find products and set quantities."],
            [3, "Tick only if they've already paid."],
            [4, "Creates it and opens the order."],
          ],
        },
      },
      {
        id: "l-carts",
        title: "Carts",
        lead: "Carts of signed-in customers who left without ordering, and how many carts turn into orders.",
        paths: ["/admin/orders/carts"],
        blocks: [{ controls: [["Cart to order", "How many carts became orders over **Last 7 days**, **Last 30 days** or **Last 90 days**."], ["Remind on WhatsApp", "Opens WhatsApp with a reminder ready; customers without a number show **No phone number**."], ["Mark reminded", "Notes that you've reminded them."]] }, { tip: "When a cart counts as abandoned is set in **Settings → Carts**." }],
      },
    ],
  },

  {
    id: "catalogue",
    label: "Catalogue",
    sections: [
      {
        id: "l-products",
        title: "Products",
        lead: "Every product, as cards with photos or as a table you can type into.",
        paths: ["/admin/products"],
        blocks: [
          {
            controls: [
              ["Cards · Table", "Cards show photos; the table lets you type names, prices and stock straight in."],
              ["Needs", "Chips for what needs work: **No photo**, **No price**, **Low stock** and **Out of stock**, with how many."],
              ["Search", "By name, brand, keyword, SKU or barcode."],
              ["Ticked products", "**Make Active**, **Make draft**, **Archive** or **Delete** them together. Products with orders are kept."],
              ["Add a product", "Starts a new one (see [[l-add|Add a product]])."],
            ],
          },
        ],
        fig: {
          label: "Catalogue › Products",
          mock: { nav: "Catalogue/Products", title: "Products", actions: ["Cards", "*Table#1", "*Add a product"], chips: ["No photo 12#2", "No price 4", "Low stock 3", "Out of stock 1"], search: "Search by name, brand, keyword, SKU or barcode", table: { ticks: true, sel: 0, cols: ["Product", "Category", "Price", "Stock", "Status"], rows: [["Glass bong 30 cm", "Bongs", "₹1,000", "8", "*Active"], ["Rolling papers", "Rolling Papers", "₹250", "40", "*Active"]] } },
          callouts: [
            [1, "Switch between photo cards and the typing table."],
            [2, "Each chip lists the products that need that fixing."],
          ],
        },
      },
      {
        id: "l-product",
        title: "A product's page",
        lead: "Everything about one product, in cards down the page; the status sits at the top.",
        paths: ["/admin/products/edit"],
        blocks: [
          {
            controls: [
              ["Draft · Active · Archived", "Draft is being prepared and not on the shop; Active is on the shop; Archived is retired but kept for its orders."],
              ["Basics", "Name, description, brand."],
              ["Photos", "Drop photos in; drag to reorder. With options, each option can have its own."],
              ["Price and codes / Options", "Price, MRP (**MRP (₹)**), SKU, barcode, weight, and with several options each one's own; **Undo** after a change."],
              ["Stock", "The count per option; **Add or adjust in Inventory** changes it."],
              ["Specifications", "Rows like Material: Aluminium."],
              ["Ready for the shop?", "What's still missing before it can go on the shop."],
              ["Tax", "**GST on sales** and the **HSN code** (4, 6 or 8 digits); cess when it's switched on."],
              ["Organise", "Category, sub-categories and search keywords."],
              ["Cost and profit", "Buying price and margin; set or correct them in **Inventory → Stock**."],
              ["Search listing", "How it shows on Google."],
            ],
          },
          { careful: "**Delete this product** at the bottom removes it for good; a product with orders can only be archived." },
        ],
        fig: {
          label: "A product's page",
          mock: { nav: "Catalogue/Products", back: "Products", title: "Glass bong 30 cm", status: ["Draft", "*Active#1", "Archived"], cards: [{ title: "Basics", fields: [["Name", "Glass bong 30 cm"], ["Brand", "Demo Glass"]] }, { title: "Tax#2", fields: [["GST on sales", "18%"], ["HSN code", "7013"]] }] },
          callouts: [
            [1, "Status: Active puts it on the shop."],
            [2, "GST slab and HSN code, printed on invoices."],
          ],
        },
      },
      {
        id: "l-add",
        title: "Add a product",
        lead: "A short form for a new product; it then opens on its own page to finish.",
        paths: ["/admin/products/new"],
        blocks: [{ steps: ["Open **Catalogue › Add a product** (or **Add a product** on Products).", "Give it a name and category, then finish it on its page: photos, price, tax, stock.", "Set it **Active** when **Ready for the shop?** has nothing left."] }],
      },
      {
        id: "l-categories",
        title: "Categories",
        lead: "Each kind of product (Bongs, Rolling Papers…) and the sub-categories it's split into.",
        paths: ["/admin/products/categories"],
        blocks: [
          {
            controls: [
              ["Details", "Name, on the shop or not, the line under its name, and **Delete this type** when it's empty."],
              ["Sub-categories", "Grouped (Size, Paper…): **Add sub-category**, **Edit**, **Delete**, **Rename** or **Remove group**, and **Fill from product names…** to tag products from their names."],
              ["Box sizes", "Box presets for products sold in boxes; **Save preset**."],
              ["Tax for its products", "One GST rate, or one HSN code, for every product in it: each has its own **Set for all**, which asks first. Orders already placed keep what they were charged; a single product can differ on its own page."],
            ],
          },
        ],
      },
      {
        id: "l-import",
        title: "Import from a sheet",
        lead: "Add products, or update prices, stock and more, from an Excel or CSV sheet.",
        paths: ["/admin/products/import"],
        blocks: [{ steps: ["**Download a template** for the column names, or use your own sheet.", "Choose the file: each row is matched by SKU first, then by name and option.", "Check what will change, then import. New products come in as drafts; **See the new drafts** lists them."] }, { careful: "This changes real products as soon as you import." }],
      },
      {
        id: "l-drafts",
        title: "Drafts and Archived",
        lead: "Drafts are products being prepared; Archived ones are retired but kept for their orders. Both are Products, filtered.",
        paths: [],
      },
      {
        id: "l-collections",
        title: "Collections",
        lead: "Hand-picked or automatic lists of products, like Staff picks, shown on the shop.",
        paths: ["/admin/products/collections"],
        blocks: [{ controls: [["Hand-picked", "Add products by name and put them in order."], ["Automatic, from rules", "Category, sub-category tag, brand, name, price, in stock, on sale, added or sold in the last days; **Save rules**, **Refresh now**."], ["Delete collection", "Asks first (**Keep it** to stop)."]] }],
      },
      {
        id: "l-reviews",
        title: "Reviews",
        lead: "Only customers who received the product can review it; new and edited reviews wait here until you publish them.",
        paths: ["/admin/products/reviews"],
        blocks: [{ controls: [["Waiting · Published · Hidden", "The three lists."], ["Publish · Hide", "Puts a review on the shop or takes it off."], ["Delete for good", "Asks first."]] }],
      },
    ],
  },

  {
    id: "inventory",
    label: "Inventory",
    sections: [
      {
        id: "l-stock",
        title: "Stock",
        lead: "Every option's count and buying price. This is the one place stock changes.",
        paths: ["/admin/inventory/stock"],
        blocks: [
          {
            controls: [
              ["Totals", "Options counted, pieces in stock, stock at buying price (before GST), and how many are low or out."],
              ["Counted · Low · Out · Not counted · Everything", "Chips that filter the list."],
              ["Counting", "The switch per option: on to keep a count, off to stop. Starting can be undone from its message."],
              ["Add or adjust", "Stock in with a supplier bill (or without), or correct a count with a reason."],
              ["Buying price", "Set or correct the buying price; **Set buying price** when there's none."],
              ["Low at", "The count at which an option shows as low."],
              ["Purchase bills", "Opens the bills."],
            ],
          },
        ],
        fig: {
          label: "Inventory › Stock",
          mock: { nav: "Inventory/Stock", title: "Stock", actions: ["Purchase bills"], stats: [["7", "options counted"], ["868", "pieces in stock"], ["₹1,44,319", "stock at buying price"], ["0", "low or out"]], chips: ["*Counted 7#1", "Low 0", "Out 0", "Not counted 533", "Everything 540"], table: { cols: ["Product", "In stock", "Low at", "Buying price", "Counting"], rows: [["Glass bong 30 cm", "8", "3", "₹620", "*Counted#2"], ["Rolling papers", "40", "10", "Set buying price#3", "*Counted"]] } },
          callouts: [
            [1, "Filter by counted, low, out or not counted."],
            [2, "The Counting switch, per option; Add or adjust sits beside it."],
            [3, "Set or correct the buying price."],
          ],
        },
      },
      {
        id: "l-purchases",
        title: "Purchase bills",
        lead: "Bills from your suppliers. Posting one adds its products to stock and records the GST you paid.",
        paths: ["/admin/inventory/purchases"],
        blocks: [
          {
            controls: [
              ["New purchase bill", "**Choose a supplier** (or **New supplier…**), the bill number and date, then the lines: products, quantities (boxes or loose), prices before GST and GST."],
              ["Fill from a sheet", "Reads the lines from the supplier's sheet and matches them to your products."],
              ["Opening stock", "Counts you already have, without a bill."],
              ["Upload a sheet", "A whole bill from a sheet."],
              ["Post bill", "The button shows the total; **Don't post** keeps you editing."],
            ],
          },
          { tip: "Opening a posted bill shows its GST split and **For the GST return**; **Void bill** takes it back out of stock (asks first)." },
        ],
        fig: {
          label: "Inventory › Purchase bills › New",
          mock: { nav: "Inventory/Purchase bills", title: "Purchases", actions: ["*New purchase bill", "Opening stock", "Upload a sheet"], form: { title: "New purchase bill", fields: [["Supplier#1", "Choose a supplier"], ["Bill no.", "INV-0042"], ["Lines#2", "Glass bong 30 cm × 10 · ₹620"]], buttons: ["Don't post", "*Post bill · ₹7,316#3"] } },
          callouts: [
            [1, "Pick the supplier, or add a new one."],
            [2, "Each line: product, quantity, price before GST and GST."],
            [3, "Posts it: the stock goes up and the GST is recorded."],
          ],
        },
      },
      {
        id: "l-suppliers",
        title: "Suppliers",
        lead: "Who the shop buys from, with their GSTIN to claim the GST on their bills.",
        paths: ["/admin/inventory/suppliers"],
        blocks: [{ controls: [["Add a supplier", "Name, GSTIN, phone and notes."], ["Edit", "Change their details; a supplier can be deactivated and brought back."]] }],
      },
      {
        id: "l-history",
        title: "Stock history",
        lead: "Every change to stock, newest first.",
        paths: ["/admin/inventory/history"],
        blocks: [{ controls: [["Everything · Orders · Bills · Adjustments", "Filter by what moved the stock."], ["Search", "By product, option, order, bill or note."]] }, { tip: "To change stock, use [[l-stock|Stock]] or a [[l-purchases|purchase bill]]." }],
      },
    ],
  },

  {
    id: "customers",
    label: "Customers",
    sections: [
      {
        id: "l-customers",
        title: "All customers",
        lead: "Everyone with an account. Tap one for their orders, activity and support history.",
        paths: ["/admin/customers"],
        blocks: [
          {
            controls: [
              ["Ready-made groups", "**Everyone**, **Customers**, **Admins**, **Test accounts**, **Have ordered**, **Repeat buyers**, **Never ordered**, **No order in 90 days**."],
              ["Your groups · + New group", "Your own groups from rules, like spent over ₹5,000 in Pune; **Edit group** changes one."],
              ["Search", "By name, email, phone, city or tag."],
              ["Export · Add customer", "A sheet of the list; add someone by hand."],
            ],
          },
        ],
        fig: {
          label: "Customers › All customers",
          mock: { nav: "Customers/All customers", title: "All customers", actions: ["Export", "*Add customer"], chips: ["*Everyone", "Customers 400", "Repeat buyers 98", "Never ordered 42#1"], search: "Search by name, email, phone, city or tag", cards: [{ title: "Your groups#2", chips: ["+ New group", "Big spenders Pune"] }], table: { cols: ["Customer", "City", "Orders", "Spent"], rows: [["Riya Demo", "Pune", "4", "₹13,500"], ["Kabir Demo", "Goa", "1", "₹640"]] } },
          callouts: [
            [1, "Ready-made groups, with their counts."],
            [2, "Your own groups from rules."],
          ],
        },
      },
      {
        id: "l-customer",
        title: "A customer's page",
        lead: "One customer: how to reach them, what they bought and what they did on the shop.",
        paths: ["/admin/customers/view"],
        blocks: [{ controls: [["WhatsApp · Call · Email · New order", "Reach them, or take an order for them."], ["Orders · Tags · Contact · Addresses · Sign-ins · Wishlist", "Their record, with a map for each address."], ["Account", "Gender, individual or business, and **Active**, **Inactive** or **Blocked: can't order**; **Save account**."], ["Activity · support history", "Their visits, and every contact and note."]] }],
      },
      {
        id: "l-messages",
        title: "Messages",
        lead: "Messages from the Contact page. Reply by email or WhatsApp, then mark them replied or closed; the site never sends anything itself.",
        paths: ["/admin/support"],
        blocks: [{ controls: [["Open · Replied · Closed", "The three lists."], ["Reply by email · WhatsApp", "Opens your email or WhatsApp with the message ready."], ["Mark replied · Close · Reopen", "Moves it between the lists."]] }],
      },
      {
        id: "l-signins",
        title: "Sign-ins",
        lead: "Every sign-in to the shop and admin, and every failed attempt.",
        paths: ["/admin/customers/sign-ins"],
        blocks: [{ controls: [["All · Failed", "The two lists."], ["Many failed attempts in the last day", "A warning when one email fails several times: someone guessing, or a customer who forgot their password."]] }],
      },
    ],
  },

  {
    id: "finance",
    label: "Finance and GST",
    sections: [
      {
        id: "l-gst",
        title: "GST & HSN",
        lead: "Every product's HSN code and GST slab. A product's slab follows its HSN code; products without their own slab use the shop's default.",
        paths: ["/admin/finance/gst"],
        blocks: [{ controls: [["By category · Products", "Set codes a category at a time, or product by product."], ["Missing HSN or rate", "Shows only what still needs a code or slab."], ["HSN · Rate… · Fill missing · Set all", "Per category: type the HSN code and pick the rate, then **Fill missing** fills only the products without one, or **Set all** sets it on every product in the category."]] }, { tip: "The default slab and the shop's GSTIN are in [[l-settings|Settings › GST]]." }],
        fig: {
          label: "Finance › GST & HSN",
          mock: { nav: "Finance/GST & HSN", title: "GST & HSN", chips: ["*By category#1", "Products", "Missing HSN or rate"], table: { cols: ["Category", "HSN code", "GST", ""], rows: [["Rolling Papers", "4813", "18%", "*Fill missing#2"], ["Bongs", "7013", "18%", "Set all 34"]] } },
          callouts: [
            [1, "Work a category at a time, or product by product."],
            [2, "Fills only the products still missing a code or rate; Set all overwrites every one."],
          ],
        },
      },
      {
        id: "l-invoices",
        title: "Invoices and credit notes",
        lead: "Every invoice and credit note dated in the range. An invoice is issued when its order is paid; a credit note when an invoiced order is refunded. Neither can be changed once issued.",
        paths: ["/admin/finance/invoices"],
        blocks: [{ controls: [["Invoices · Credit notes · Cancelled", "The lists, with GST on them."], ["Print", "Prints or saves as PDF."]] }],
      },
      {
        id: "l-returns",
        title: "GST returns and Tally",
        lead: "Pick the month, download, and hand it to the CA.",
        paths: ["/admin/finance/returns"],
        blocks: [{ controls: [["GST returns", "The GSTR-1 tables and a GSTR-3B summary, with input credit from bills ticked as in GSTR-2B."], ["Tally registers", "Sales and purchase registers, ready to import."], ["Purchases", "One row per posted stock line."], ["Check before filing", "Warnings to clear before filing."]] }],
      },
      {
        id: "l-profit",
        title: "Profit and GST",
        lead: "On Analytics: gross sales, cost, profit and margin, GST collected and paid, input tax credit and net GST payable.",
        paths: [],
        blocks: [{ tip: "Profit needs buying prices: set them in [[l-stock|Stock]]." }],
      },
    ],
  },

  {
    id: "storefront",
    label: "Storefront",
    sections: [
      {
        id: "l-design",
        title: "Colours and homepage",
        lead: "The shop's colours, the line along its top, and what the homepage shows.",
        paths: ["/admin/storefront"],
        blocks: [{ controls: [["Colours", "Sets the shop's colours, light and dark: pick a preset, change any part, check it in the preview, then **Save**. **Revert** goes back to what is live."], ["Announcement along the top", "One short line on every page, with an optional link; **Save**."], ["Homepage sections", "Add, reorder, show or hide sections; **Undo** after a change."]] }],
      },
      {
        id: "l-banners",
        title: "Banners",
        lead: "The banners that turn on the homepage, in order.",
        paths: ["/admin/storefront/banners"],
        blocks: [{ controls: [["On the homepage", "Show or hide each."], ["Picture · words · link · dates", "Save; **Remove picture**; **Delete banner** asks first."]] }],
      },
      {
        id: "l-pages",
        title: "Pages, blog and FAQs",
        lead: "The shop's own pages and blog posts, common questions, and how pages show on Google.",
        paths: ["/admin/storefront/pages"],
        blocks: [{ controls: [["Pages · Blog · FAQs · Search listings", "The four lists."], ["Shown · Save", "On or off the shop; **Live: open it ↗** opens it."], ["Delete for good", "Asks first."]] }],
      },
      {
        id: "l-menus",
        title: "Menus",
        lead: "Links to your pages, blog posts or collections in the shop's header and footer.",
        paths: ["/admin/storefront/menus"],
        blocks: [{ controls: [["New link", "Words and address; **Save**."], ["Shown", "On or off."]] }],
      },
    ],
  },

  {
    id: "analytics",
    label: "Analytics",
    sections: [
      {
        id: "l-analytics",
        title: "Overview",
        lead: "How the shop is doing for the dates you pick, against the period before.",
        paths: ["/admin/analytics"],
        blocks: [{ controls: [["Dates", "**Today**, **Yesterday**, **Last 7 days**, **Last 30 days**, **Last 90 days**, **This month** or **Custom**."], ["Sales breakdown · Top products · Sales by state · Sales by category", "Where the money comes from."], ["Profit & GST summary", "See [[l-profit|Profit and GST]]."]] }],
      },
      {
        id: "l-traffic",
        title: "Traffic and Live view",
        lead: "Who visits, where they come from and how far they get; and who's on the shop right now.",
        paths: ["/admin/analytics/traffic", "/admin/analytics/live"],
        blocks: [{ controls: [["Traffic", "Conversion rate, when people visit, first page seen, most viewed pages, browse-to-buy rate."], ["Live view", "Refreshes every 15 seconds: visitors, at checkout, pages open now."]] }],
      },
      {
        id: "l-reports",
        title: "Reports",
        lead: "Tables to download for your accountant or to check stock.",
        paths: ["/admin/analytics/reports"],
        blocks: [
          { steps: ["Pick the dates.", "Pick a report: sales by product or customer, stock, finance by month, GST by state, deliveries, returns and more.", "**Download CSV**, or **Print** an A4 sheet."] },
          { tip: "The till's reports (Daily sales, Hourly sales, Payment types, Users, Item list, Refunds (till), Unpaid sales, Collected credit payments, Starting cash entries, Cash in / out, Voided items, Discounts granted, Item discounts and more) also filter by **Channel** and **Cashier**." },
          { tip: "GST returns, Tally and purchases are in [[l-returns|Finance]]." },
        ],
      },
    ],
  },

  {
    id: "settings",
    label: "Settings",
    sections: [
      {
        id: "l-settings",
        title: "Store settings",
        lead: "Pick a topic, change what you need, then **Save** at the bottom. Each topic saves on its own.",
        paths: ["/admin/settings"],
        blocks: [{ controls: [["Business details", "Printed on every invoice: shop name, legal name, GSTIN, address."], ["Payments and bank", "How customers can pay, and the bank and UPI details."], ["Delivery and couriers", "Shipping charges, couriers and delivery problems."], ["GST", "Prices include GST or not, the default slab, cess."], ["Orders, returns and carts", "When unpaid orders cancel, the return window, carts."], ["Low stock", "When an option counts as low."], ["Data export", "Download the shop's data."]] }, { tip: "**Unsaved changes** shows until you Save or **Discard**." }],
      },
      {
        id: "l-team",
        title: "Team and roles",
        lead: "Who can open the admin and what each can do. Every change anyone makes is in the activity log.",
        paths: ["/admin/settings/team"],
        blocks: [{ controls: [["Owner", "Everything, including the team."], ["Admin", "Everything except owners and admins."], ["Store account", "Orders, customers, stock, purchases, prices and costs, GST, profit and reports."], ["Storefront manager", "Products and the shop's banners, pages, blog, FAQs, menus and SEO."], ["Front-end UI", "The shop's look only."], ["Add someone", "Their email and role; **Remove…** takes them off (asks first)."], ["Keep out of visits and analytics", "Their own visits aren't counted."]] }],
      },
      {
        id: "l-activity",
        title: "Activity log",
        lead: "Every change made in the admin, with who made it and when.",
        paths: ["/admin/settings/activity"],
        blocks: [{ controls: [["Everything", "Filter by area and by person (**Everyone**)."], ["Show older", "Goes further back."]] }],
      },
    ],
  },

  {
    id: "tasks",
    label: "How to…",
    sections: [
      {
        id: "t-phone",
        title: "Take a phone or WhatsApp order",
        lead: "From the customer's call to an order in the list.",
        blocks: [{ steps: ["Open **Orders › New order**.", "Find the customer, or type a new one's name and phone.", "Find each product by name and set quantities.", "Fill **Deliver to**; add their GSTIN only for a business.", "Tick **Payment already received** only if they've paid.", "Press **Create order**. Unpaid, it waits in Payment pending."] }],
      },
      {
        id: "t-counter",
        title: "Sell to a customer at the counter",
        lead: "A customer walks in, picks something up and pays.",
        blocks: [
          { steps: ["Open **Orders › Counter sale (till)**. If the cash drawer is closed, open it first.", "Scan each item's barcode, or tap its group and then the product.", "For a discount, select the line (or none, for the whole sale) and press **Discount**.", "Press **F10 Payment**, pick how they paid and, for cash, the note they hand you: the till shows the change. Or press the way's own button (**F12** for cash) when they pay the exact amount.", "Press **Done**. Print the receipt, or the A4 **GST invoice** if they want one."] },
          { tip: "Busy counter? **F9 Save sale** parks the ticket while you serve the next person." },
        ],
      },
      {
        id: "t-drawer",
        title: "Open and close the cash drawer",
        lead: "With the cash drawer on (Settings › Counter (till)), each day starts with the float and ends with a count.",
        blocks: [
          { steps: ["Start of the day: **Cash drawer**, type the float you start with, **Open drawer**.", "Cash taken out or put in during the day: **Cash drawer › Cash in / out**, with the amount and why.", "End of the day: **Cash drawer › End of day**. It shows sales by way of paying, cash in and out, refunds, and the cash that should be there.", "Count the drawer, type what you counted, and **Close the drawer**. The report shows over or short; **Print** it."] },
          { careful: "Owners, admins and the store account close the drawer. While it's switched on and closed, the till won't sell." },
        ],
      },
      {
        id: "t-till-refund",
        title: "Refund or take back something sold",
        lead: "At the till, with the credit note issued as for any refund.",
        blocks: [
          { steps: ["On the till press **Refund**, scan or type the receipt number and press Enter (or tap **Refund** on the sale in ≡ › View sales history).", "Press **+** or **All** for each item coming back; change the amount for a part refund.", "Pick how the money goes back: cash comes out of the drawer; a sale on account can be taken off what's owed.", "Keep **Put the returned items back in stock** ticked unless damaged, add a reason, press **Refund**. The slip prints; the A4 credit note is on its bar."] },
          { careful: "Owners, admins and the store account can refund." },
        ],
      },
      {
        id: "t-on-account",
        title: "Sell on account and collect later",
        lead: "A regular pays later. Switch it on in Settings › Counter (till) › Sales on account.",
        blocks: [
          { steps: ["**Customer**: find their account (what they owe shows beside them).", "In **F10 Payment** pick **On account** for what they'll pay later, all or the rest after a part payment.", "The sale completes and its GST invoice is issued at once; the receipt shows what's still to pay.", "When they pay: ≡ › **Credit payments**, tap them, the amount and how, **Take**. A payment receipt prints."] },
          { tip: "Their page shows what they owe and their credit limit; the **Unpaid sales (on account)** report lists everything owed." },
        ],
      },
      {
        id: "t-split",
        title: "Split a bill",
        lead: "Separate sales, or one sale paid in shares.",
        blocks: [{ steps: ["Separate sales: **Split** above the ticket, choose what goes on the second ticket, **Split off**; it waits in ≡ › View open sales to be rung up on its own.", "Shared payment: in **F10 Payment** type the number of people in **Split evenly by** and press **Split**."] }],
      },
      {
        id: "t-unpaid",
        title: "Get an unpaid order paid",
        lead: "Payments are taken by hand: the order is placed unpaid, you contact the customer, then mark it paid.",
        blocks: [{ steps: ["Open **Orders › Payment pending**.", "On the order, press **Call** or **WhatsApp**.", "Press **Log** to note what happened; tick **Needs a follow-up** if you must try again.", "When they've paid, press **Mark paid**, pick **How was it paid?** and add the reference (UTR or UPI ref).", "Marking paid issues the invoice and emails the customer that their order is confirmed."] }, { careful: "Unpaid orders cancel themselves after the hours set in Settings." }],
        fig: {
          label: "Mark paid",
          mock: { nav: "Orders/Payment pending", title: "Payment pending", table: { cols: ["Order", "Customer", "Total", ""], rows: [["BJ-2041", "Riya Demo", "₹1,250", "Call · WhatsApp · Log#1"]] }, form: { title: "Mark BJ-2041 paid", note: "This issues the invoice and emails the customer.", chips: ["*UPI#2", "Bank transfer", "Cash", "Other"], fields: [["Transaction reference#3", "412345678901"]], buttons: ["Back", "*Mark paid"] } },
          callouts: [
            [1, "Reach them, and log what happened."],
            [2, "How it was paid."],
            [3, "The UTR or UPI reference, optional."],
          ],
        },
      },
      {
        id: "t-ship",
        title: "Pack and dispatch",
        lead: "From paid to on the way.",
        blocks: [{ steps: ["Open **Orders › To pack**; pack, then press **Packed** (or tick several).", "Open **Ready to dispatch**; press **Ship…**.", "Enter the **Courier** and **Tracking number**, and confirm.", "When it arrives, press **Delivered** on **On the way**."] }],
      },
      {
        id: "t-requests",
        title: "Cancellations, returns and refunds",
        lead: "Customers ask from their account; you accept and refund, or decline with a reply.",
        blocks: [{ steps: ["Open **Orders › Customer requests** and press **Review**.", "Accept with **Accept and refund everything** (a cancel) or **Accept and refund** (a return), or **Decline** with a reply.", "For anything else, use **Return items** or **Refund** on the order's page. A refund on an invoiced order issues a credit note.", "A refund can be undone with **Reverse refund**."] }],
      },
      {
        id: "t-problems",
        title: "A delivery that failed",
        lead: "When the courier couldn't deliver.",
        blocks: [{ steps: ["On the order, press **Delivery failed?** and **Record it**. It moves to **Delivery problems**.", "Contact the customer (**Message on WhatsApp** has the words ready).", "Then **Send again** with the courier and new tracking number, or mark it **Returned to origin (RTO)**."] }],
      },
      {
        id: "t-product",
        title: "Add a product",
        lead: "From nothing to on the shop.",
        blocks: [{ steps: ["**Catalogue › Add a product**: name and category.", "On its page: photos, description, price (and options if it has sizes or colours).", "**Tax**: GST on sales and HSN code.", "Stock: start counting it in **Inventory › Stock** and add what you have.", "Check **Ready for the shop?**, then set it **Active**."] }],
      },
      {
        id: "t-bill",
        title: "Put stock in from a supplier bill",
        lead: "The bill adds the stock and records the GST.",
        blocks: [{ steps: ["**Inventory › Purchase bills › New purchase bill**.", "Choose the supplier, type the bill number and date.", "Add each line, or **Fill from a sheet**.", "Press **Post bill**. Stock goes up; the GST shows in the returns."] }],
      },
      {
        id: "t-count",
        title: "Count stock",
        lead: "Start keeping a count for an option, or correct one.",
        blocks: [{ steps: ["Open **Inventory › Stock**, chip **Not counted**.", "Switch **Counting** on for the option.", "Press **Add or adjust** to put in the count, with a reason for a correction."] }],
      },
      {
        id: "t-buying",
        title: "Set buying prices",
        lead: "Buying prices drive profit and stock value.",
        blocks: [{ steps: ["Open **Inventory › Stock**.", "Press **Buying price** (or **Set buying price**) on the option, type it and save. Posting a bill sets it too."] }],
      },
      {
        id: "t-offer",
        title: "Put a product on offer",
        lead: "An offer is the old price shown crossed out beside the new one.",
        blocks: [{ steps: ["Open the product's page.", "Type the MRP in **MRP (₹)** and the price you sell at in the price.", "Clear **MRP (₹)** to end the offer."] }],
      },
      {
        id: "t-prices",
        title: "Change many prices at once",
        lead: "Two ways.",
        blocks: [{ steps: ["**Products › Table**: type prices straight into the table.", "Or **Import from a sheet**: a sheet of SKUs and new prices; check, then import."] }, { careful: "Both change real prices on the shop at once." }],
      },
      {
        id: "t-group",
        title: "Make a customer group",
        lead: "A group from rules, like spent over ₹5,000 in Pune.",
        blocks: [{ steps: ["Open **Customers › All customers** and press **+ New group**.", "Add the rules (**Customers who match all of these:**).", "Name it and press **Create group**. It sits under **Your groups**."] }],
      },
      {
        id: "t-staff",
        title: "Add a staff member",
        lead: "Give someone access, with only what their job needs.",
        blocks: [{ steps: ["Open **Settings › Team and roles**.", "Under **Add someone**, type their email and pick a role.", "Press **Add**. They sign in with that email."] }],
      },
      {
        id: "t-gst",
        title: "GST invoices and returns",
        lead: "Invoices come by themselves; returns are a download.",
        blocks: [{ steps: ["Make sure **Settings › Business details** has the GSTIN, and every product has its HSN code (**Finance › GST & HSN**).", "Invoices are issued when orders are marked paid; print them from **Finance › Invoices and credit notes**.", "Each month: **Finance › GST returns and Tally**, pick the month, clear **Check before filing**, download, send to the CA."] }],
      },
      {
        id: "t-report",
        title: "Run a report",
        lead: "A table for your accountant, or to check stock.",
        blocks: [{ steps: ["**Analytics › Reports**.", "Pick the dates and the report.", "**Download CSV**."] }],
      },
      {
        id: "t-storefront",
        title: "Change the shop's banners and pages",
        lead: "What customers see.",
        blocks: [{ steps: ["**Storefront › Banners**: add or change a banner, pick dates, show it.", "**Pages, blog and FAQs**: write a page, then **Shown** and **Save**.", "**Menus**: add a **New link** to it."] }],
      },
    ],
  },
];

export const LALL = LEGACY.flatMap((c) => c.sections.map((s) => ({ ...s, chapter: c })));

// the section for an admin address (?from=), else null
export function legacyFor(path: string): string | null {
  const bare = path.split("?")[0].replace(/\/$/, "") || "/admin";
  let best: { id: string; n: number } | null = null;
  for (const s of LALL)
    for (const p of s.paths ?? [])
      if ((bare === p || (p !== "/admin" && bare.startsWith(`${p}/`))) && p.length > (best?.n ?? -1)) best = { id: s.id, n: p.length };
  return best?.id ?? null;
}
