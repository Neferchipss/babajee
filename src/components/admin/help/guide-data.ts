import type { Fig } from "./figures";

// The guide to the Aronium-style admin: chapters of articles, each a short
// intro, numbered steps (each with a drawing, figures.tsx), tips and warnings.
// Everything named here is on screen in the admin; when a screen changes,
// change its article. `paths` ties an article to the admin pages it covers, so
// the title bar's ? opens the right one (Guide.tsx).
export type Step = { t: string; fig?: Fig };
export type Article = {
  id: string;
  title: string;
  paths?: string[];
  intro: string;
  steps?: Step[];
  table?: { head: string[]; rows: string[][] };
  tips?: string[];
  careful?: string[];
};
export type Chapter = { id: string; title: string; articles: Article[] };

const TILL_TOOLS = [{ icon: "search", label: "Search" }, { icon: "edit", label: "Customer" }, { icon: "percent", label: "Discount" }, { icon: "tag", label: "Price" }, { icon: "add", label: "New sale" }, { icon: "history", label: "Refund" }, { icon: "box", label: "Cash drawer" }, { icon: "save", label: "F9 Save sale" }, { icon: "paid", label: "F10 Payment" }, { icon: "paid", label: "F12 Cash" }];

// the menu, as drawn in the pictures, with one entry open
const MENU = ["Dashboard", "Till", "Documents", "Products", "Price lists", "Stock", "Reporting", "Customers & suppliers", "Promotions", "Users & security", "Payment types", "Countries", "Tax rates", "My company"];
const SHOP = ["Storefront", "Admin theme", "Web analytics", "Messages", "Documentation"];
const side = (on: string, n?: number): Fig["side"] => ({
  items: MENU.map((m) => (m === on ? `*${m}${n ? `#${n}` : ""}` : m)),
  shop: SHOP.map((m) => (m === on ? `*${m}${n ? `#${n}` : ""}` : m)),
});
const DOC_TABS = (on: string) => ["View documents", "Payment pending", "To pack", "Ready to dispatch", "Customer requests", "Purchases", "Invoices", "New sale", "Carts"].map((t) => (t === on ? `*${t}` : t));
const DOC_TOOLS = (marks: Record<string, number> = {}, off: string[] = []) =>
  [
    ["add", "Add"],
    ["open", "Open"],
    ["paid", "Mark paid"],
    ["print", "Print"],
    ["excel", "Excel"],
    ["refresh", "Refresh"],
    ["list", "Carts"],
  ].map(([icon, label]) => ({ icon, label: `${off.includes(label) ? "~" : ""}${label}${marks[label] ? `#${marks[label]}` : ""}` }));
const ORDERS_GRID = (sel?: number) => ({
  cols: ["Number", "Date", "Customer", "City", "Status", "Paid", "Items", "Total"],
  rows: [
    ["BJ-2041", "24 Nov 11:02 am", "Aarav Example", "Pune", "Payment pending", "", "2", "₹1,450"],
    ["BJ-2040", "23 Nov 6:40 pm", "Meera Sample", "Mumbai", "Paid", "₹2,300", "3", "₹2,300"],
    ["BJ-2039", "23 Nov 1:15 pm", "Kabir Demo", "Delhi", "Packed", "₹890", "1", "₹890"],
  ],
  sel,
});
const PRODUCT_TOOLS = (marks: Record<string, number> = {}, off: string[] = []) =>
  [
    ["refresh", "Refresh"],
    ["folderAdd", "New group"],
    ["folderEdit", "Edit group"],
    ["add", "New product"],
    ["edit", "Edit product"],
    ["del", "Delete product"],
    ["import", "Import"],
    ["export", "Export"],
    ["paid", "Make active"],
    ["list", "Edit in table"],
  ].map(([icon, label]) => ({ icon, label: `${off.includes(label) ? "~" : ""}${label}${marks[label] ? `#${marks[label]}` : ""}` }));
const PRODUCTS_GRID = (sel?: number) => ({
  cols: ["Code", "Name", "Group", "Options", "Price", "Tax", "Stock", "Active"],
  rows: [
    ["RP-001", "King size papers", "Rolling Papers", "1", "₹120", "18%", "64", "✓"],
    ["GR-014", "4-part metal grinder", "Grinders", "3", "₹650", "18%", "9", "✓"],
    ["BG-002", "Glass bong 12 in", "Bongs", "1", "₹2,400", "18%", "", "Draft"],
  ],
  sel,
});

export const GUIDE: Chapter[] = [
  // ------------------------------------------------------------------ getting started
  {
    id: "start",
    title: "Getting started",
    articles: [
      {
        id: "what",
        title: "What Aronium-style is",
        paths: ["/admin/help", "/admin/settings/design"],
        intro:
          "Aronium-style is one of the admin's two designs; the other is Legacy, the admin as it was. It copies the back office of Aronium, the till program for counter shops: the same menu in the same order, the same screens, toolbars, grids, right-click menus, slide-in panels and document editors. Babajee's own extras (the online shop, GST, deliveries) sit inside those screens as extra tabs, columns and buttons, and under the menu in an **Online shop** group. Every page, button and permission is the same in every design; only the layout and look change.",
        steps: [
          {
            t: "To switch design, open **Admin theme** in the menu's **Online shop** group, just under Storefront (in Legacy it is **Settings › Admin design**). The two designs are listed one a row, each with a drawing of it.",
            fig: { caption: "Admin theme: one row per design", bar: { title: "Admin theme" }, side: side("Admin theme", 1), grid: { cols: ["Design", "", ""], rows: [["Legacy", "Use design", "Preview"], ["*Aronium-style", "Use design#2", "Preview#3"]], sel: 1 } },
          },
          { t: "**Use design** switches at once. Your pick is saved on your account, so it follows you to any device you sign in on. Each person on the team picks their own." },
          { t: "**Preview** opens the admin in a new tab in that design, without changing anything." },
        ],
        tips: ["Nothing about the shop changes when you switch design: same orders, same products, same rights."],
      },
      {
        id: "layout",
        title: "Find your way around the screen",
        intro: "Every screen has the same frame: the title bar across the top, the menu down the left, and the screen itself, usually tabs, a toolbar and a grid.",
        steps: [
          {
            t: "The **title bar** says where you are: **Management • Documents**, for example. The **←** arrow goes back to the Dashboard.",
            fig: { caption: "The title bar", bar: { title: "Documents", n: 1, back: 2, help: 3, account: 4, close: 5 }, side: side("Documents") },
          },
          { t: "On the right: **?** opens this guide at the page for the screen you are on; the person icon is your account (sign out from there); **×** closes the admin and opens the shop." },
          {
            t: "The **menu** on the left has Aronium's screens in Aronium's order, Dashboard to My company. Under them, the **Online shop** group has what a website needs and a till doesn't: Storefront, Admin theme (this design picker), Web analytics, Messages and Documentation (this guide, also opened by the **?** in the title bar). The open screen is solid blue. A red number on an entry counts work waiting there.",
            fig: { caption: "The menu, with the Online shop group under it", side: { ...side("Stock", 1)!, fold: 2 } },
          },
          { t: "**«** at the foot of the menu folds it down to icons for more room; **»** brings the names back. The admin remembers your choice on this device." },
          {
            t: "**Tabs** across the top of a screen are its pages. Documents, for example, has View documents, Payment pending, To pack and more. The open tab is blue, with a little pointer under it, and some tabs show a count.",
            fig: { caption: "Tabs on the Documents screen", bar: { title: "Documents" }, tabs: DOC_TABS("To pack").map((t, i) => (i === 2 ? `${t}#1` : t)) },
          },
          {
            t: "The **toolbar** under the tabs has the screen's big buttons. A grey button can't be used yet, usually because nothing is selected.",
            fig: { caption: "A toolbar: Open and Print wait for a selected row", tools: DOC_TOOLS({ Add: 1, Open: 2 }, ["Open", "Mark paid", "Print"]) },
          },
        ],
      },
      {
        id: "grids",
        title: "Grids: select, open, sort, tick",
        intro: "Most screens list things in a grid, as Aronium does: a header row on a blue line, one row per order, product or customer.",
        steps: [
          {
            t: "**Click** a row to select it: it turns solid blue, and the toolbar buttons that need a row (Open, Edit, Print…) wake up.",
            fig: { caption: "A selected row is solid blue", tools: DOC_TOOLS({ Open: 2 }), grid: { ...ORDERS_GRID(1), mark: { row: 1, n: 1 } } },
          },
          { t: "**Double-click** a row, or select it and press **Enter**, to open it: an order opens as a document in its own tab, a product slides its editor in, a customer opens their card." },
          { t: "Click a **column heading** to sort by it; click again to reverse. Headings that sort show a small arrow." },
          { t: "On Documents and Products you can work on many rows at once. Tick the box at the start of each row, or on Products hold **Ctrl** and click to add rows, and **Shift**-click to select a run. The toolbar and right-click menu then act on all of them (for example **Make active** on several products)." },
        ],
        tips: ["Grids keep their columns on a phone and scroll sideways: swipe the grid left to see the rest."],
      },
      {
        id: "rightclick",
        title: "Right-click menus",
        intro: "Right-click almost anywhere, as in Aronium, and you get the actions for that spot. What the menu offers depends on where you click.",
        steps: [
          {
            t: "Right-click a **row**: it is selected first, then the menu shows what you can do to it. On an order: Add, Edit, the next step (Mark paid, Packed…), Print, and more.",
            fig: { caption: "Right-click on an order", grid: ORDERS_GRID(0), popup: ["Add#1", "-", "Edit", "Mark paid#2", "-", "Print", "Print preview", "Save as PDF", "-", "Call", "WhatsApp", "Log contact", "-", "Tick", "Export to Excel", "-", "~Delete", "-", "Refresh"] },
          },
          { t: "Right-click the **empty part of a grid**: you get the screen's own actions (Add, Refresh…), with the row actions greyed out." },
          { t: "Right-click a **group** in a group list (Products, Stock, Price lists, Customers): New group, Edit group and so on." },
          { t: "Greyed items can't be used there: Delete on an order, for example, because orders are cancelled, never deleted. Inside a text box you get the normal Cut, Copy and Paste menu." },
          { t: "Close a menu with **Esc**, by clicking anywhere else, or by scrolling." },
        ],
      },
      {
        id: "panels",
        title: "Slide-in panels and windows",
        intro: "Adding and editing happens in a panel that slides in from the right over the screen, as in Aronium.",
        steps: [
          {
            t: "A panel has a light title, sometimes tabs, the fields with their labels above them, and **Save** and **Cancel** at the foot. **→** at the top right or **Esc** closes it without saving.",
            fig: { caption: "A slide-in panel", bar: { title: "Payment types" }, panel: { title: "New payment type", tabs: ["*General", "Rounding", "Icon"], fields: [{ label: "Name#1", value: "" }, { label: "~Code" }, { label: "Position", kind: "stepper", value: "4" }, { label: "~Enabled", kind: "switch", value: "on" }], saveN: 2, cancelN: 3 } },
          },
          { t: "A field with a **red border** is required and still empty. **Save** stays grey until the panel has what it needs." },
          { t: "Greyed fields are Aronium settings Babajee has nowhere to keep (a till's rounding or loyalty cards, for example). They are shown so the screen matches Aronium, and a note says why they can't change." },
          { t: "Some jobs use a window in the middle of the screen instead, such as Mark paid, Log contact, Export, or confirming a delete." },
        ],
      },
      {
        id: "keys",
        title: "Keyboard shortcuts",
        intro: "The shortcuts Aronium uses work on the screen you are on, except while you are typing in a box.",
        table: {
          head: ["Key", "What it does"],
          rows: [
            ["Enter", "Open the selected row"],
            ["F2", "Edit the selected row (or Quick inventory on Stock)"],
            ["Del", "Delete the selected row, where the screen allows it"],
            ["F5", "Refresh the screen's list (not the whole page)"],
            ["Esc", "Close a panel, window or right-click menu"],
            ["Space", "Tick the focused row, on Products"],
            ["Ctrl + N", "Add, in Aronium. In a web browser Ctrl + N opens a new browser window before the admin sees it, so use the toolbar's Add button or right-click › Add instead"],
          ],
        },
      },
      {
        id: "phone",
        title: "Using it on a phone",
        intro: "The design works on a phone too, with everything in reach.",
        steps: [
          { t: "The menu hides behind **☰** at the top left. Tap it, pick a screen, and it slides away again." },
          { t: "Toolbars wrap onto two rows; tabs scroll sideways; grids keep their columns and scroll sideways." },
          { t: "Panels take the whole width. Group lists sit above their grid instead of beside it." },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ the screens
  {
    id: "screens",
    title: "The screens",
    articles: [
      {
        id: "dashboard",
        title: "Dashboard",
        paths: ["/admin"],
        intro: "The first screen: Aronium's dashboard with the shop's real sales. Sales count as the Analytics page counts them: orders that are paid or further along, not test orders, before shipping.",
        steps: [
          {
            t: "**Monthly Sales** shows the year as one coloured bar per month. The arrows step a year back or forward, the round arrow refreshes, and the switch hides or shows the amounts on the bars.",
            fig: { caption: "Monthly Sales and Total Sales", bar: { title: "Dashboard" }, side: side("Dashboard"), cards: [{ title: "Monthly Sales - 2026#1", body: "▂ ▃ ▅ ▂ ▆ █ ▃ ▄ ▅ ▇ █ ▂" }, { title: "Total Sales#2", big: "18.80K", body: "Top performing month: NOVEMBER" }] },
          },
          { t: "**Total Sales** on the right is the year's total and its best month." },
          {
            t: "**Periodic Reports ( date - date )** covers a range, today to start with. The calendar button opens two date boxes to change it. Under it: **Top Products** (pick 5, 10 or 20), **Hourly Sales** (by Count or Amount), **Total Sales (Amount)** for the range, **Top Product Groups** (categories) and **Top Customers**.",
            fig: { caption: "Periodic Reports", cards: [{ title: "Top Products#1", body: "Product · Total" }, { title: "Hourly Sales#2", body: "Count ▾" }, { title: "Total Sales (Amount)", big: "4.35K" }] },
          },
        ],
        tips: ["Staff whose role has no money access (front-end and storefront roles) don't see sales; their home lists the parts of the shop they look after."],
      },
      {
        id: "till",
        title: "Till (counter sales)",
        paths: ["/admin/counter", "/admin/counter/receipt"],
        intro: "Aronium's sales screen, for customers who walk in to the shop's counter. A counter sale is paid and handed over on the spot: it has no address or delivery, its stock comes off, and its GST invoice is issued like any paid order's. Online orders don't change. How the till works (ways to pay, the cash drawer, discounts, prices, stock, the receipt) is set in Settings › Counter (till), or ≡ › Till settings.",
        steps: [
          {
            t: "The buttons across the top: **Search**, **Customer**, **Discount**, **Price**, **New sale**, **Refund**, **Cash drawer**, then **F9 Save sale**, the green **F10 Payment**, and a button for each of the first three ways to pay (**F12** is cash). **Transfer** and **Dine-in** are greyed: they're for restaurants.",
            fig: { caption: "The till", bar: { title: "Till" }, side: side("Till"), tools: TILL_TOOLS, strip: ["✱#1", "Barcode", "#", "Tag", "Search products by name"], grid: { cols: ["Item", "Qty × price", "Amount"], rows: [["Glass bong 12 in", "1 × 2,400.00", "2,400.00"], ["Rolling papers · King size", "3 × 60.00", "180.00"]], sel: 1 } },
          },
          { t: "On the right, the products as buttons: tap a group, then a product (a product with options shows its options). **⌂** goes back to the groups; the arrows page through. The four buttons beside the search box search everything, barcodes, codes or names." },
          { t: "A **barcode scanner** types into the search box and presses Enter: an exact barcode or code adds the item at once. Typing a name and pressing Enter adds it when only one product matches." },
          { t: "On the left, the ticket. Tap a line to select it: **✕ Delete** removes it, **Quantity** sets how many (or press + and −). **Discount** takes a percent or an amount off the selected item or the whole sale; **Price** types a different price for it, when Settings allow." },
          { t: "**Customer** puts the sale on a customer's account (find them by name, phone or email), or just a name and phone; add a business buyer's **GSTIN** for a B2B invoice, and a note. Leave it empty for a walk-in." },
          { t: "Below the ticket: **Void order** (tap twice) empties it, **Lock** blanks the screen until clicked, **Repeat round** adds the last sale's items again. Deleted lines and voided tickets are recorded for the **Voided items** report." },
          { t: "**Split** (above the ticket) moves some lines to a ticket of their own, paid as a separate sale with its own receipt and invoice. To share one bill, **Payment › Split evenly by** N makes N equal payments." },
          { t: "**Refund**: scan or type the receipt number (or pick the sale in ≡ › View sales history), choose what comes back, and how the money goes back. Cash comes out of the drawer; a credit note is issued and a refund slip prints." },
        ],
        table: {
          head: ["Key", "Does"],
          rows: [
            ["F9", "Save the sale for later (≡ › View open sales)"],
            ["F10", "Payment"],
            ["F12", "Paid in full in cash"],
            ["Enter (in search)", "Add the scanned or only match"],
            ["+ / −", "One more or one fewer of the selected line"],
            ["Delete", "Remove the selected line"],
            ["Esc", "Close a panel"],
          ],
        },
        tips: [
          "The ≡ menu has Management (back to the admin), View sales history, View open sales, Reprint last receipt, Credit payments, Split order, Cash in / out, End of day, Till settings and Lock.",
          "Reprints say **REPRINT** on the receipt and **DUPLICATE** on the A4 invoice.",
          "Refunds, sales on account, credit payments, split and the till's reports need database update 0086; until it's applied the till says so and Refund opens the sales history.",
        ],
        careful: ["A sale is real the moment it's done: stock comes off and an invoice number is taken. To undo one, refund it from its page (≡ › View sales history › Open)."],
      },
      {
        id: "documents",
        title: "Documents (orders)",
        paths: ["/admin/orders"],
        intro: "Every order, laid out as Aronium's Documents screen: a toolbar, a filter panel, the orders in a grid, and under it the selected order's items. The tabs are the kinds of work an order can wait on.",
        steps: [
          {
            t: "The **tabs**: View documents (every order), Payment pending, To pack, Ready to dispatch and Customer requests (each with how many are waiting), then Purchases, Invoices, New sale and Carts.",
            fig: { caption: "Documents", bar: { title: "Documents" }, side: side("Documents"), tabs: DOC_TABS("View documents"), tools: DOC_TOOLS(), grid: ORDERS_GRID() },
          },
          {
            t: "The **filter panel** narrows the grid: **Product** (orders with that product), **Order type** (any kind of work, including On the way, Delivery problems, Delivered, Cancelled & refunded and Counter sales), **Paid status**, **Customer** (name, email, phone or city), **Order number** (or invoice number) and **Period**. **Clear** empties it; **Search** reloads.",
            fig: { caption: "The filter panel", strip: ["Product: All products#1", "Order type: All orders#2", "Paid status: All transactions", "Customer: All customers", "Order number", "Period", "Search", "Clear#3"] },
          },
          { t: "The grid shows Number, Date, Customer, City, Status, Paid (what was received), Items, Invoice and Total. An unpaid order also shows how long it has waited and how long until it cancels itself, and the last time someone contacted the customer." },
          { t: "Select an order and its lines fill **Order items** underneath: Code, Name, Option, Quantity, Price, Tax and Total." },
          {
            t: "The toolbar: **Add** (a new order: see New sale), **Open**, the selected order's **next step** (Mark paid, Packed, Ship, Delivered, Review or Sort it out, depending on where it is), **Print** (its invoice, in a new tab), **Excel** (export), **Refresh** and **Carts**.",
            fig: { caption: "The next step button follows the selected order", tools: DOC_TOOLS({ "Mark paid": 1, Print: 2, Excel: 3 }), grid: ORDERS_GRID(0) },
          },
          { t: "On To pack and On the way you can tick several orders and move them together: the next-step button becomes **Mark 3 packed** (or delivered)." },
        ],
        tips: ["The menu's Documents tabs and the Order type box are the same list: picking a tab sets the box."],
      },
      {
        id: "order-page",
        title: "An order (the document editor)",
        paths: ["/admin/orders/view"],
        intro: "Double-click an order (or select it and **Open**) and it opens the way Aronium opens a document: in its own tab beside **View documents**, with the header fields, the document's tabs, the totals, the notes and the footer bar. Babajee's work on an order sits on top as a toolbar.",
        steps: [
          {
            t: "The **header**: Number (the order number), External document (the invoice number, once issued), Customer; Date, Due date and Stock date; and the **Paid** switch, red while unpaid, green once paid. On an unpaid order, clicking Paid opens **Mark paid**.",
            fig: { caption: "An order open as a document", bar: { title: "Documents" }, tabs: ["View documents", "*BJ-2041"], tools: [{ icon: "paid", label: "Mark paid#2" }, { icon: "history", label: "Log a contact" }, { icon: "truck", label: "~Delivery failed" }, { icon: "edit", label: "Edit order" }, { icon: "import", label: "~Return items" }, { icon: "export", label: "~Refund" }, { icon: "clear", label: "Cancel order" }, { icon: "print", label: "~Issue invoice" }, { icon: "refresh", label: "Refresh" }], strip: ["Number: BJ-2041", "External document", "Customer: Aarav Example", "Date: 24-11-2026", "Paid ●#1"], grid: { cols: ["Code", "Name", "Quantity", "Price", "Tax", "Total"], rows: [["RP-001", "King size papers", "5", "₹120", "18%", "₹600"], ["GR-014", "4-part metal grinder · Black", "1", "₹650", "18%", "₹650"]] } },
          },
          {
            t: "The **toolbar** holds the order's actions: the **next step** (Mark paid, Packed, Ship…, Delivered, as the order stands), **Log a contact**, **Delivery failed** (or **Send again**), **Returned (RTO)**, **Edit order**, **Return items**, **Refund**, **Cancel order**, **Invoice** (or **Issue invoice**), **Credit notes** and **Refresh**. A grey button doesn't apply to the order as it is.",
          },
          {
            t: "The **tabs**: **Document items** (the lines, with a small Edit / Delete / Return items / Refund bar), **Payments** (what was received; **New** marks it paid or marks an amount still due as received), **Delivery & tracking** (courier and tracking number), **Customer** (who, Deliver to, Bill to, a business buyer's GSTIN), **Customer requests** (cancel or return requests, to accept or decline), **Returns & refunds**, **History** (the road of steps and everything that happened), **Notes** and **Profit**.",
            fig: { caption: "The order's tabs", strip: ["*Document items#1", "Payments#2", "Delivery & tracking", "Customer", "Customer requests", "Returns & refunds", "History#3", "Notes", "Profit"] },
          },
          { t: "Under the tabs: the totals (total before tax, tax, total), then **Internal note** (a comment for staff; the customer never sees it) and **Note** (the order's own note)." },
          {
            t: "The **footer bar**: Delete stays grey (an order is cancelled, never deleted); **Save as PDF**, **Print preview** and **Print** open the invoice once the order is paid; **Save** keeps changed notes. **▾** beside Save has **Save note**, **Post comment**, **Print invoice** (or **Issue invoice**) and **Print credit notes**.",
            fig: { caption: "The footer bar and Save ▾", popup: ["Save note", "Post comment#1", "-", "Print invoice INV/26-27/0081", "~Print credit notes"] },
          },
        ],
        tips: ["Going back a step on History's road undoes what the later steps recorded."],
      },
      {
        id: "new-sale",
        title: "New sale (taking an order yourself)",
        paths: ["/admin/orders/new"],
        intro: "For a sale taken by phone, on WhatsApp or at the counter. It opens as Aronium's new Sales document and lands in Documents like any other order.",
        steps: [
          {
            t: "Open **Documents › New sale** (or **Add** on Documents). The header: Number (given on Save), **Customer** with a search, Date, and the **Paid** switch for payment already received.",
            fig: { caption: "A new sale", bar: { title: "Documents" }, tabs: ["View documents", "*New sale"], strip: ["Number: given on save", "Customer: Find a customer#1", "Date: 24-11-2026", "Paid ○#4"], side: { items: ["✱ ▥ # ⌂", "Find a product#2", "▸ Rolling Papers", "▸ Grinders", "▸ Bongs"] }, grid: { cols: ["Code", "Name", "Quantity#3", "Price", "Tax", "Total"], rows: [["RP-001", "King size papers", "2", "₹120", "18%", "₹240"]] } },
          },
          { t: "**Document items**: on the left the product picker (search by name, barcode or code, or open the **Products** tree by group); click a product to add it. On the right the lines: change the quantity, or type a price for one without one." },
          { t: "**Customer & delivery**: the customer's name, phone and email, and the delivery address (pick a saved one, or type it). For a walk-in customer, type their details here." },
          { t: "**Business buyer (GSTIN)**: the buyer's GSTIN, only for a business buyer. **Payments** shows the invoice is issued once paid." },
          { t: "Check the shipping charge and the totals, add a note, then **Save** (it waits in Payment pending) or **Save ▾ › Save as paid** if they have paid. The order opens." },
        ],
      },
      {
        id: "purchases",
        title: "Purchases (supplier bills)",
        paths: ["/admin/inventory/purchases"],
        intro: "Aronium's Documents screen with the document type set to Purchase: every supplier bill, the filter panel, **Documents (n)** and under it the selected bill's items. Posting a bill adds its products to stock and records the GST you paid.",
        steps: [
          {
            t: "The toolbar: **Add**, **Print**, **Print preview**, **Save as PDF**, **Edit** (opens the bill), **Delete** (voids a posted bill), then Babajee's **Opening stock**, **Upload a sheet** and **Suppliers**.",
            fig: { caption: "Purchases", bar: { title: "Documents" }, tabs: DOC_TABS("Purchases"), tools: [{ icon: "add", label: "Add#1" }, { icon: "print", label: "Print" }, { icon: "preview", label: "Print preview" }, { icon: "pdf", label: "Save as PDF" }, { icon: "edit", label: "Edit" }, { icon: "del", label: "Delete" }, { icon: "box", label: "Opening stock" }, { icon: "excel", label: "Upload a sheet" }, { icon: "folder", label: "Suppliers" }], grid: { cols: ["Number", "External document", "Supplier", "Date", "Total", "Status"], rows: [["P-0012", "DT/4471", "Demo Traders", "20-11-2026", "₹14,160", "Posted"]] } },
          },
          {
            t: "**Add** asks **Select document type**: **100 - Purchase** (a supplier bill), **100 - Purchase, from a sheet** (upload the supplier's .xlsx, .xls or .csv), or **Opening stock** (stock you already had, no bill). Greyed types are Aronium's; counts are made on Stock › Quick inventory.",
            fig: { caption: "Select document type", dialog: { title: "Select document type", lines: ["~Sales", "Expenses", "*100 - Purchase#1", "100 - Purchase, from a sheet", "~120 - Stock return", "Inventory", "Opening stock", "~300 - Inventory count"], buttons: ["Cancel"] } },
          },
          { t: "The **Purchase** editor opens in its own tab: Number, **External document** (the bill number), **Supplier** (or New supplier…); Date, Due date, Stock date. On the left the product picker; click a product to add a line, then set its quantity (loose or boxes) and the price before tax. **Fill from a sheet** reads the lines from a supplier's sheet." },
          { t: "Check the totals against the paper bill, then **Post bill**. Stock goes up, buying prices update, and the GST is recorded for the return. A bill number already used for that supplier is flagged." },
        ],
        careful: ["Check a bill against the paper bill before posting: it changes stock and the GST you claim."],
      },
      {
        id: "purchase-bill",
        title: "A posted bill",
        paths: ["/admin/inventory/purchases/bill"],
        intro: "A posted bill opens as Aronium's Purchase document. It can't be edited, so its lines are read-only.",
        steps: [
          { t: "The header: Number, External document (the bill number), Supplier; Date, Due date, Stock date; and the **Paid** switch." },
          { t: "**Document items** lists the lines; under the totals is the GST split (CGST + SGST, or IGST) and, if some can't be claimed, why. **Payments** keeps the day it was paid to the supplier." },
          { t: "**For the GST return** says which month's GSTR-2B the bill belongs in and the GST claim." },
          { t: "**Delete** in the footer voids the bill (**Yes, void it**): its stock is taken back out." },
        ],
      },
      {
        id: "invoices",
        title: "Invoices and credit notes",
        paths: ["/admin/finance/invoices"],
        intro: "Every GST invoice and credit note dated in a period. An invoice is issued when its order is paid; a credit note when an invoiced order is refunded. Neither can be changed once issued.",
        steps: [
          {
            t: "**Invoices** and **Credit notes** are tabs; set the **Period** above the grid. The grid shows Number, Date, Order, Customer, Tax number, Tax, Total and Status; a credit note also shows the invoice it is against.",
            fig: { caption: "Invoices", bar: { title: "Documents" }, tabs: ["*Invoices", "Credit notes"], tools: [{ icon: "refresh", label: "Refresh" }, { icon: "open", label: "Open#1" }, { icon: "print", label: "Print" }, { icon: "pdf", label: "Save as PDF" }, { icon: "print", label: "Print all (12)#2" }], grid: { cols: ["Number", "Date", "Order", "Customer", "Tax", "Total"], rows: [["INV/26-27/0081", "23-11-2026", "BJ-2040", "Meera Sample", "₹350.85", "₹2,300"]], sel: 0 } },
          },
          { t: "**Open** (or double-click) opens the order. **Print** and **Save as PDF** open the selected document to print or save from the print window; **Print all** prints every invoice in the period." },
        ],
      },
      {
        id: "carts",
        title: "Carts",
        paths: ["/admin/orders/carts"],
        intro: "Signed-in customers' carts that haven't become orders. A cart counts as abandoned after the window set in Settings › Carts; reminders are sent by hand on WhatsApp.",
        steps: [
          {
            t: "**Abandoned** and **Active now** are tabs, each with its count. Above the grid, **Cart to order** shows how many abandoned carts still turned into orders, over the last 7, 30 or 90 days.",
            fig: { caption: "Carts", bar: { title: "Documents" }, tabs: DOC_TABS("Carts"), tools: [{ icon: "refresh", label: "Refresh" }, { icon: "open", label: "Open customer" }, { icon: "paid", label: "Remind on WhatsApp#1" }, { icon: "paid", label: "Mark reminded#2" }, { icon: "edit", label: "Cart settings" }], strip: ["*Abandoned (4)", "Active now (2)"], grid: { cols: ["Customer", "Phone number", "In the cart", "Value", "Last change", "Reminded"], rows: [["Kabir Demo", "+91 90000 00003", "Glass bong 12 in", "₹2,400", "2 days ago", ""]], sel: 0 } },
          },
          { t: "Select a cart and **Remind on WhatsApp**: a chat opens with a ready message. After sending, **Mark reminded** so nobody reminds them twice." },
          { t: "**Open customer** (or double-click) opens the customer's card. **Cart settings** opens Settings › Carts." },
        ],
      },
      {
        id: "products",
        title: "Products",
        paths: ["/admin/products"],
        intro: "Aronium's Products screen: the product groups (Babajee's categories) on the left, and on the right a search row over the grid of products.",
        steps: [
          {
            t: "Click a group to list its products; **Products** at the top lists them all. Right-click a group for New group, Edit group and Delete group.",
            fig: { caption: "Groups and the grid", bar: { title: "Products" }, side: side("Products"), tabs: ["*Products", "Drafts", "Archived", "Product groups", "Collections", "Reviews", "Import"], tools: PRODUCT_TOOLS(), grid: PRODUCTS_GRID() },
          },
          {
            t: "The search row has four modes, as in Aronium: ✱ everything, the barcode, the code (SKU) and the name. Beside it, **Show** picks which products to list: Everything, No photo, No price, Drafts, Archived, Low stock or Out of stock, each with a count.",
            fig: { caption: "Search modes and the Show box", strip: ["*✱#1", "▥", "#", "⌂", "Product name", "Show: Everything ▾#2"] },
          },
          { t: "The grid shows Code, Name, Group, Barcode, Options, Price, Tax, Stock and Active (✓, Draft or Archived). Double-click a product, or select it and **Edit product**, to slide its editor in." },
          { t: "**Drafts** and **Archived** are also tabs: drafts aren't on the shop yet; archived products are retired but kept with their orders." },
          {
            t: "Select several products (tick boxes, **Ctrl**-click, **Shift**-click) and use **Make active**, **Make draft**, **Archive** or **Delete** from the toolbar or right-click menu. A product that has been ordered can't be deleted: archive it instead.",
            fig: { caption: "Several products selected, right-click", grid: { ...PRODUCTS_GRID(0) }, popup: ["New product", "New group", "-", "Edit", "-", "~Copy", "-", "Import", "Export", "-", "~Print", "~Save as PDF", "-", "Make active (2)#1", "Make draft (2)", "Archive (2)", "-", "Delete (2)", "-", "Refresh"] },
          },
          { t: "**Edit in table** swaps the grid for a spreadsheet you type straight into: names, prices and stock, with an empty row at the end to add a product. **Back to list** returns." },
          { t: "**Export** downloads a CSV with one row per option; **Import** opens the Import tab; **Full page** opens the selected product on its own page. Print, Save as PDF, Price tags and Merge are Aronium till features and stay grey." },
        ],
      },
      {
        id: "product-editor",
        title: "The product editor",
        paths: ["/admin/products/edit", "/admin/products/new"],
        intro: "Aronium's slide-in product editor, tab for tab: **Details**, **Price & tax**, **Stock control**, **Comments**, **Image & color**. Babajee's own tabs follow in the same style: **Options**, **Photos**, **Boxes & bundles**, **Sub-categories & tags**, **Shop page** and **Stock history**.",
        steps: [
          {
            t: "Double-click a product on Products (or **Edit product**). The words and numbers are a draft: nothing is kept until **Save** at the bottom right; **Cancel** or **→** (Esc) closes. Photos, boxes and bundles are saved the moment you change them.",
            fig: { caption: "The product editor", bar: { title: "Products" }, grid: PRODUCTS_GRID(1), panel: { title: "4-part metal grinder", tabs: ["*Details#1", "Price & tax", "Stock control", "Comments", "Image & color", "Options", "Photos", "Boxes & bundles", "Sub-categories & tags", "Shop page", "Stock history"], fields: [{ label: "Name", value: "4-part metal grinder" }, { label: "Code", value: "GR-014" }, { label: "Group", kind: "select", value: "Grinders" }, { label: "Active#2", kind: "switch", value: "on" }, { label: "Service (not using stock)", kind: "switch" }], saveN: 3 } },
          },
          { t: "**Details**: Name, Code (the SKU), Barcode, Group, **Active** (on the shop; off is a draft), **Service (not using stock)** and Description. A product with options keeps its codes on the Options tab." },
          {
            t: "**Price & tax**: Cost (the buying price before GST), GST paid on the cost, Markup and Sale price, which follow each other as you type. **Add tax to product** (or **Change tax**) sets the tax the GST way: the **HSN code** first, then its **GST slab**, plus Cess if the shop uses it. Without one, the shop's default slab applies.",
            fig: { caption: "Add tax to product: HSN code first", panel: { title: "Product tax", fields: [{ label: "HSN code#1", value: "96140000" }, { label: "GST slab#2", kind: "select", value: "18%" }, { label: "Cess (%)", value: "" }], saveN: 3 } },
          },
          { t: "**Stock control**: **Reorder point** (warn when stock reaches it; empty uses the shop's level). **Image & color**: the product's picture. **Comments**: Aronium's kitchen-ticket comments, not used here." },
          { t: "**Options**: each size or colour with its own name, code, barcode, cost, price and MRP, and whether it is on sale; **New option** adds one. **Photos** adds and orders pictures (one group per option). **Boxes & bundles** sets box sizes and combo packs." },
          { t: "**Sub-categories & tags**, **Shop page** (Brand, Product type, Specifications, Videos, search keywords) and **Stock history** (every change to its stock)." },
          { t: "**‹ ›** at the top step to the previous or next product (Alt + ← / →). They are blocked while there are unsaved changes: Save or Cancel first." },
        ],
        tips: ["Greyed fields (Unit of measurement, Age restriction, Price change allowed, Supplier…) are Aronium's; hover one to see why Babajee doesn't use it."],
      },
      {
        id: "product-groups",
        title: "Product groups",
        paths: ["/admin/products/categories"],
        intro: "Products › Product groups: the shop's groups (Bongs, Rolling Papers…) as Aronium's group tree on the left, and on the right the selected group's sub-categories, filter groups and box sizes.",
        steps: [
          {
            t: "**New group**, **Edit group** and **Delete group** on the toolbar or by right-clicking the tree; **Move up** and **Move down** set the order on the shop. A group with products can't be deleted: move its products first.",
            fig: { caption: "Product groups", bar: { title: "Products" }, tabs: ["Products", "Drafts", "Archived", "*Product groups", "Collections", "Reviews", "Import"], tools: [{ icon: "refresh", label: "Refresh" }, { icon: "folderAdd", label: "New group#1" }, { icon: "folderEdit", label: "Edit group" }, { icon: "del", label: "Delete group" }], side: { items: ["Product groups", "*Grinders", "Rolling Papers", "Bongs"] }, grid: { cols: ["Sub-categories", "Products"], rows: [["Metal", "12"], ["Wood", "4"]] }, panel: { title: "Edit \"Grinders\"", tabs: ["Details", "Image & color", "Shop page", "*Tax#2"], fields: [{ label: "HSN code#3", value: "84798999" }, { label: "GST slab", kind: "select", value: "18%" }], saveN: 4 } },
          },
          { t: "The group panel has **Details**, **Image & color**, **Shop page** (the line under the name, sold in boxes) and, on an existing group, **Tax**." },
          { t: "**Tax** sets the group's **HSN code** and **GST slab** together (a slab follows its HSN code under GST), then **Put them on** its products: only those missing one, or all of them." },
          { t: "On the right: **Sub-categories** (New sub-category, or **Fill from product names**), **Filter group**s (like Size) and **Box sizes** presets, each with its own right-click menu." },
        ],
      },
      {
        id: "collections",
        title: "Collections",
        paths: ["/admin/products/collections"],
        intro: "Products › Collections, laid out like Aronium's Price lists: the collections on top in the shop's order, and the selected one's products in a grid underneath.",
        steps: [
          {
            t: "**New collection** (start from Best sellers, New in, Gift ideas or Staff picks, or name your own), **Edit**, **Delete**, **Move up** / **Move down** and **Show on the shop** / **Take off the shop**, from the toolbar or right-click.",
            fig: { caption: "Collections", bar: { title: "Products" }, tabs: ["Products", "Drafts", "Archived", "Product groups", "*Collections", "Reviews", "Import"], tools: [{ icon: "refresh", label: "Refresh" }, { icon: "add", label: "New collection#1" }, { icon: "edit", label: "Edit" }, { icon: "del", label: "Delete" }], grid: { cols: ["#", "Collection", "How products are chosen", "Products", "On the shop"], rows: [["1", "Staff picks", "Hand-picked", "6", "✓"], ["2", "New in", "Automatic, from rules", "14", "✓"]], sel: 0 } },
          },
          { t: "**Edit** slides in the name, the line under it and **How products are chosen**: **Hand-picked**, or **Automatic, from rules** (set on the **Rules** tab)." },
          { t: "For a hand-picked collection, **Find a product to add** over the lower grid adds products; right-click one there to move it or **Take out of the collection**." },
          { t: "Showing or hiding saves at once." },
        ],
      },
      {
        id: "reviews",
        title: "Reviews",
        paths: ["/admin/products/reviews"],
        intro: "Products › Reviews: customers' reviews. Only customers who received the product can review it; new and edited reviews wait for you here.",
        steps: [
          {
            t: "**Waiting**, **Published** and **Hidden** are tabs. Each row: Rating, Product, Customer, Date and the review; the selected one is read out under the grid.",
            fig: { caption: "Reviews", bar: { title: "Products" }, strip: ["*Waiting (2)", "Published", "Hidden"], tools: [{ icon: "refresh", label: "Refresh" }, { icon: "open", label: "Open" }, { icon: "paid", label: "Publish#1" }, { icon: "clear", label: "Hide" }, { icon: "del", label: "Delete" }], grid: { cols: ["Rating", "Product", "Customer", "Date", "Review"], rows: [["★★★★★", "4-part metal grinder", "Meera Sample", "22-11-2026", "Smooth and solid"]], sel: 0 } },
          },
          { t: "**Publish** puts it on the product page; **Hide** keeps it off; **Back to waiting** returns it. **Delete** removes it for good (asked first). Double-click opens it in a panel with the same buttons." },
        ],
      },
      {
        id: "import",
        title: "Import products from a sheet",
        paths: ["/admin/products/import"],
        intro: "Products › Import: add or update products from an .xlsx or .csv sheet, in Aronium's numbered steps. Nothing is saved until you press Import.",
        steps: [
          {
            t: "**Template** downloads a sheet with the right columns. Fill it in, then **Open file** (step 1, **Select file**).",
            fig: { caption: "Import", bar: { title: "Products" }, tabs: ["Products", "Drafts", "Archived", "Product groups", "Collections", "Reviews", "*Import"], tools: [{ icon: "open", label: "Open file#1" }, { icon: "excel", label: "Template" }, { icon: "import", label: "Import#3" }, { icon: "clear", label: "Cancel" }], strip: ["1 Select file", "*2 Check changes#2", "3 Import"], grid: { cols: ["Row", "Product", "Changes"], rows: [["4", "King size papers", "Sale price ₹110 → ₹120"], ["9", "Glass ashtray", "New product (draft)"]] } },
          },
          { t: "Step 2, **Check changes**: grids of **New products**, **New options**, **To update** and notes on rows that can't be used, with why." },
          { t: "Step 3, **Import**. New products come in as drafts; empty cells leave what's there alone. **Cancel** drops the sheet." },
        ],
      },
      {
        id: "price-lists",
        title: "Price lists",
        paths: ["/admin/price-lists"],
        intro: "Aronium keeps several price lists; Babajee has one, the shop's prices, shown here as the price list **Products** with every option's buying cost, markup and price.",
        steps: [
          {
            t: "**Price lists** on the left has the one list, Products; **Product groups** under it filters the grid. The grid shows Code, Product (and option), Cost price, Markup, Price, Tax inclusive and Taxes.",
            fig: { caption: "Price lists", bar: { title: "Price lists" }, side: side("Price lists"), tools: [{ icon: "refresh", label: "Refresh" }, { icon: "add", label: "~New price list" }, { icon: "edit", label: "~Edit" }, { icon: "excel", label: "Excel" }, { icon: "percent", label: "Edit prices#1" }, { icon: "tag", label: "Product prices#2" }], grid: { cols: ["Code", "Product", "Cost price", "Markup", "Price", "Taxes"], rows: [["RP-001", "King size papers", "₹70", "71.43%", "₹120", "GST 18%"], ["GR-014", "4-part metal grinder · Black", "₹380", "71.05%", "₹650", "GST 18%"]], sel: 0 } },
          },
          { t: "**Product prices** (or double-click) sets one option's price; the markup and price follow each other as you type." },
          { t: "**Edit prices** changes many at once in two steps: first Increase or Decrease by a percentage with rounding, then tick which options and check old → new before applying." },
          { t: "**Excel** downloads the list as a CSV. New price list, Copy price list, Delete, Print and Save as PDF stay grey: there is only the one list." },
        ],
        careful: ["Edit prices changes real selling prices on the shop as soon as you apply it. The admin on your own computer uses the live database too."],
      },
      {
        id: "stock",
        title: "Stock",
        paths: ["/admin/inventory/stock"],
        intro: "Aronium's Stock screen: every option's quantity, buying cost and value, with totals at the foot.",
        steps: [
          {
            t: "The switches filter the grid: **Negative quantity**, **Non zero quantity**, **Zero quantity**, **Active products**. The three boxes count options below zero (red), with none left (blue) and in stock (green).",
            fig: { caption: "Stock", bar: { title: "Stock" }, side: side("Stock"), tools: [{ icon: "refresh", label: "Refresh" }, { icon: "history", label: "Stock history" }, { icon: "excel", label: "Excel" }, { icon: "list", label: "Quick inventory#2" }, { icon: "import", label: "Stock in" }, { icon: "box", label: "Suppliers" }], strip: ["Negative quantity", "Non zero quantity", "Zero quantity", "Active products", "Show: Counted ▾#1", "0", "1", "6"], grid: { cols: ["Code", "Name", "Quantity", "Low at", "Cost price", "Value"], rows: [["RP-001", "King size papers", "64", "5", "₹70", "₹7,680"], ["GR-014", "4-part metal grinder · Black", "0", "3", "₹380", "₹0"]], sel: 0 } },
          },
          { t: "**Show** picks Counted (options whose stock is counted), Not counted, or Everything. An option only limits sales once it is counted." },
          { t: "The grid: Code, Name, Quantity, Unit of measure, Low at, Cost price, Cost, Cost incl. tax, Value and Value incl. tax. The foot totals stock at cost and at the selling price." },
          { t: "Select an option, then: **Quick inventory** (or F2, or double-click) sets the counted quantity with a note; **Add or adjust** adds stock or corrects the count; **Buying price** sets what it cost; **Start counting / Stop counting** turns counting on or off for it." },
          { t: "**Excel** and **Inventory count report** download the list. **Stock in** enters a supplier bill." },
        ],
      },
      {
        id: "stock-history",
        title: "Stock history",
        paths: ["/admin/inventory/history"],
        intro: "Stock › Stock history: every change to stock, newest first: sales, cancellations and refunds put back, bills, adjustments, counting switched on or off. It is read-only; stock changes on Stock and on purchase bills.",
        steps: [
          {
            t: "The filter band: **Movement type** (All movements, Orders, Purchase bills, Adjustments…) and a search over product, option, order, bill or note.",
            fig: { caption: "Stock history", bar: { title: "Stock" }, tabs: ["Stock", "*Stock history"], strip: ["Movement type: All movements ▾#1", "Product, option, order, bill or note", "Search", "Clear"], grid: { cols: ["Date", "Product", "Option", "Quantity", "In stock after", "Document"], rows: [["24-11-2026", "King size papers", "", "−2", "64", "BJ-2041"], ["20-11-2026", "King size papers", "", "+50", "66", "P-0012"]], sel: 0 } },
          },
          { t: "Right-click a row (or use the toolbar) to **Open order**, **Open document** (the bill) or **Open product stock**. **Show older** loads more." },
        ],
      },
      {
        id: "reporting",
        title: "Reporting",
        paths: ["/admin/analytics/reports"],
        intro: "Aronium's report list, with Babajee's reports: pick one, set the dates, and show it.",
        steps: [
          {
            t: "The list is grouped: **Sales** (Sales by product, Sales by channel, Daily sales, Hourly sales, Hourly sales by product groups, Item list, Users, Payment types, Payment types by users, Payment types by customers, Sales by customer, Worst sellers, Finance by month, Refunds, Discounts granted, Item discounts), **Counter (till)** (Refunds (till), Unpaid sales (on account), Collected credit payments, Starting cash entries, Cash in / out, Voided items), **Customers** (New customers, Marketing), **Stock control** (Stock), **Tax** (GST by state), **Delivery** (Deliveries by courier, Deliveries by state, Late deliveries), **Returns** and **Online shop**. **Search reports** finds one by name.",
            fig: { caption: "Select report", bar: { title: "Reporting" }, side: side("Reporting"), tabs: ["*Select report"], grid: { cols: ["Sales"], rows: [["*Sales by product#1"], ["Sales by customer"], ["Worst sellers"], ["Finance by month"]] }, panel: { title: "Filter", fields: [{ label: "From#2", value: "01-11-2026" }, { label: "To", value: "24-11-2026" }], save: "Show report", saveN: 3 } },
          },
          { t: "The till's reports (Daily sales to Item discounts) also filter by **User** (who made the sale: the cashier, the staff member who took the order, or the website) and **Channel** (online, counter or both)." },
          { t: "In **Filter** on the right set **From** and **To**, then **Show report** (or double-click the report). It opens in its own tab as a print preview: the report's page with its title, period and totals." },
          { t: "In the preview: **Print**, **Save ▾** to download it as CSV, the page arrows and zoom. Close a report's tab with its ×; **Select report** goes back to the list." },
        ],
      },
      {
        id: "customers",
        title: "Customers & suppliers",
        paths: ["/admin/customers"],
        intro: "One grid of customers and suppliers, as Aronium has it, with Babajee's customer groups on the left.",
        steps: [
          {
            t: "**Your groups** on the left: Everyone, Customers, Admins, Test accounts, Have ordered, Repeat buyers, Never ordered, No order in 90 days, then the groups you have made, each with a count. Click one to list it.",
            fig: { caption: "Customers & suppliers", bar: { title: "Customers & suppliers" }, side: side("Customers & suppliers"), tabs: ["*Customers", "Suppliers", "Sign-ins"], tools: [{ icon: "refresh", label: "Refresh" }, { icon: "add", label: "Add#2" }, { icon: "edit", label: "Edit" }, { icon: "folderAdd", label: "New group#1" }, { icon: "export", label: "Export" }], grid: { cols: ["Code", "Name", "Phone number", "Email", "Customer", "Supplier", "Orders", "Spent"], rows: [["7F3A21", "Aarav Example", "+91 90000 00001", "aarav@example.com", "✓", "", "3", "₹4,200"], ["C0FFEE", "Demo Traders", "+91 90000 00002", "", "", "✓", "", ""]] } },
          },
          { t: "The grid shows Code, Name, Tax number, Address, Country, Phone number, Email, Active, Customer, Supplier, Tax exempt, Tags, Orders and Spent. Search by any of them in the search row." },
          { t: "**Add** slides in a panel for a new customer or supplier. **Edit** (or double-click) on a customer opens their card; on a supplier it opens the supplier's panel." },
          { t: "**Delete** works on suppliers only and makes them inactive; customer accounts stay. **Export** downloads the customers as a CSV." },
        ],
      },
      {
        id: "customer-card",
        title: "A customer's card",
        paths: ["/admin/customers/view"],
        intro: "A customer opens the way Aronium opens a document: a tab with their name beside **Customers & suppliers**, a toolbar, and the editor's tabs.",
        steps: [
          {
            t: "The toolbar: **Save**, then **New order** (a sale for them), **Call**, **WhatsApp** and **Email**.",
            fig: { caption: "A customer's card", bar: { title: "Customers & suppliers" }, tabs: ["Customers & suppliers", "*Aarav Example"], tools: [{ icon: "save", label: "Save#3" }, { icon: "add", label: "New order" }, { icon: "paid", label: "Call" }, { icon: "paid", label: "WhatsApp" }, { icon: "paid", label: "Email" }], strip: ["*General#1", "Orders", "Activity", "Notes & support#2", "Addresses", "Sign-ins", "Wishlist"], cards: [{ title: "General info", body: "First name · Last name · Gender · Buying as · Tax number (GSTIN) · Status · Tags" }, { title: "Orders", big: "3", body: "Amount spent ₹4,200 · Last order 23-11-2026" }] },
          },
          { t: "**General**: Aronium's form, labels on the left: first and last name, gender, **Buying as** (Individual or Business, with business name and GSTIN), **Status** (Active, or Blocked: can't order, with why, for staff only), **Tags** and contact. Change something and **Save**." },
          { t: "**Orders**: their orders; double-click one to open it. **Activity**: their visits and what they did on the shop. **Notes & support**: private notes, logged contacts and Contact-page messages; **Add note**, **Log a contact**, **Mark as done**." },
          { t: "**Addresses** (saved delivery addresses), **Sign-ins** (their sign-ins and failed attempts) and **Wishlist** (what they saved with the heart)." },
        ],
      },
      {
        id: "suppliers",
        title: "Suppliers",
        paths: ["/admin/inventory/suppliers"],
        intro: "Customers & suppliers › Suppliers: the same grid showing only suppliers.",
        steps: [
          { t: "**Add** (or Add new supplier) opens the supplier panel: name, **Tax number** (their GSTIN; without one, GST on their bills can't be claimed), phone, notes, active." },
          { t: "**Edit** changes one; **Delete** (Deactivate) makes it inactive. Bills already posted keep their supplier. Tick **Show inactive** to see them and **Reactivate** one." },
        ],
      },
      {
        id: "sign-ins",
        title: "Sign-ins",
        paths: ["/admin/customers/sign-ins"],
        intro: "Customers & suppliers › Sign-ins: every sign-in to the shop and every failed attempt, newest first, kept 180 days.",
        steps: [
          { t: "**All** and **Failed** are tabs; search by name, email or network. Each row: Date, Name, Email, Result, Device and Network." },
          { t: "Five or more failures on one email in the last day show as a red banner: someone guessing a password, or a customer who forgot theirs. **Open customer** opens their card." },
        ],
      },
      {
        id: "promotions",
        title: "Promotions",
        paths: ["/admin/promotions"],
        intro: "In Babajee a promotion is an option on offer: its MRP is set above its price, so the shop shows it as a deal. The screen lists every option on offer.",
        steps: [
          {
            t: "The grid shows Name, Option, Group, Regular price (the MRP), Promotion price (what it sells for), Discount and Active.",
            fig: { caption: "Promotions", bar: { title: "Promotions" }, side: side("Promotions"), tools: [{ icon: "refresh", label: "Refresh" }, { icon: "add", label: "Add promotion#1" }, { icon: "edit", label: "Edit" }, { icon: "del", label: "Delete" }], grid: { cols: ["Name", "Option", "Group", "Regular price", "Promotion price", "Discount"], rows: [["4-part metal grinder", "Black", "Grinders", "₹800", "₹650", "19%"]] } },
          },
          { t: "**Add promotion** opens a full-screen editor. On the left pick products (search, groups, tick) and **▶** adds them; on the right type each item's MRP. **Save** sets the MRPs." },
          { t: "**Edit** changes the MRP; **Delete** clears it, so the option is no longer a deal. Neither changes the selling price." },
          { t: "The name, dates and day boxes at the top are Aronium's; Babajee's offers have no name or dates, so they stay grey." },
        ],
      },
      {
        id: "users",
        title: "Users & security",
        paths: ["/admin/settings/team"],
        intro: "The staff who can open the admin, and what each can do.",
        steps: [
          {
            t: "**Users** lists First name, Last name, Email, Access level (a number, as in Aronium), Role and Active. **Show inactive users** lists those whose access was removed.",
            fig: { caption: "Users", bar: { title: "Users & security" }, side: side("Users & security"), tabs: ["*Users", "Security", "Activity log"], tools: [{ icon: "refresh", label: "Refresh" }, { icon: "add", label: "Add user#1" }, { icon: "edit", label: "Edit" }, { icon: "del", label: "Delete" }, { icon: "key", label: "~Reset password" }], grid: { cols: ["First name", "Last name", "Email", "Access level", "Role", "Active"], rows: [["Asha", "Example", "asha@example.com", "5", "Store account", "✓"]] } },
          },
          { t: "Access levels: **9** Owner, **8** Admin, **5** Store account, **3** Storefront manager, **1** Front-end UI. Only an owner can give owner or admin." },
          { t: "In a user's panel, **Keep out of visits and analytics** stops their own browsing being counted." },
          { t: "**Security** shows which level each part of the admin needs." },
        ],
      },
      {
        id: "activity",
        title: "Activity log",
        paths: ["/admin/settings/activity"],
        intro: "Users & security › Activity log, set out like Documents: every change made in the admin, newest first, kept a year. Customers' own actions aren't here; each order keeps its own History.",
        steps: [
          {
            t: "Filter by **Area** and **User**. Each row is one change: Date, User, Area, Action, Item.",
            fig: { caption: "Activity log", bar: { title: "Users & security" }, tabs: ["Users", "Security", "*Activity log"], strip: ["Area: Everything ▾#1", "User: All users ▾", "Clear"], grid: { cols: ["Date", "User", "Area", "Action", "Item"], rows: [["24-11-2026 11:20", "Asha Example", "Products", "Changed", "King size papers"]], sel: 0 } },
          },
          { t: "Under the splitter, the selected change's fields: **Field**, **Old value**, **New value**." },
        ],
      },
      {
        id: "payment-types",
        title: "Payment types",
        paths: ["/admin/payment-types"],
        intro: "The ways customers can pay you, in the order Mark paid offers them (UPI, Bank transfer, Cash…).",
        steps: [
          { t: "**New payment type** adds one; **Edit** renames it; **Move up** and **Move down** set its place in Mark paid's list; **Delete** removes it." },
          { t: "The other columns and editor tabs are Aronium's till settings and are shown fixed." },
        ],
        tips: ["Only owners and admins can change payment types."],
      },
      {
        id: "countries",
        title: "Countries",
        paths: ["/admin/countries"],
        intro: "Babajee delivers within India only, so the list has one country, India (IN). Under it, the states and union territories with their short code and GST state code. It is read-only.",
      },
      {
        id: "tax-rates",
        title: "Tax rates (GST)",
        paths: ["/admin/tax-rates"],
        intro: "India's GST slabs: 0, 5, 12, 18, 28 and 40%, the shop's default marked, with how many products sit on each, and Cess when it is switched on. The slabs are set by law, so nothing here adds, changes or moves them.",
        steps: [
          {
            t: "Each slab shows how GST charges it: **CGST** and **SGST / UTGST**, half each, to a buyer in the shop's own state; the whole rate as **IGST** to any other state.",
            fig: { caption: "Tax rates", bar: { title: "Tax rates" }, side: side("Tax rates"), tabs: ["*Tax rates", "Product taxes (HSN)#2", "Tax returns"], grid: { cols: ["Name", "Rate", "CGST", "SGST / UTGST", "IGST#1", "Products"], rows: [["GST 5%", "5%", "2.5%", "2.5%", "5%", "1"], ["GST 18% (default)", "18%", "9%", "9%", "18%", "453"]] } },
          },
          { t: "There is no switching of taxes: a product's slab follows its **HSN code**, set on **Product taxes (HSN)**." },
        ],
      },
      {
        id: "product-taxes",
        title: "Product taxes (HSN)",
        paths: ["/admin/finance/gst"],
        intro: "Tax rates › Product taxes (HSN), on Aronium's Products layout: the product groups down the left, the search row and the grid on the right, each product's HSN code and GST slab edited right in the grid.",
        steps: [
          {
            t: "The grid: Name, Group, **HSN code**, **GST slab**, and the split it makes (CGST + SGST, IGST). Click a cell to change it. **Missing HSN or slab only** lists what still needs one.",
            fig: { caption: "Product taxes (HSN)", bar: { title: "Tax rates" }, tabs: ["Tax rates", "*Product taxes (HSN)", "Tax returns"], side: { items: ["Product groups", "*Grinders", "Rolling Papers"] }, strip: ["Search product or HSN", "Missing HSN or slab only#1", "Fill missing#3", "Set on all 16"], grid: { cols: ["Name", "Group", "HSN code#2", "GST slab", "CGST + SGST", "IGST"], rows: [["4-part metal grinder", "Grinders", "84798999", "18%", "9% + 9%", "18%"]] } },
          },
          { t: "For a whole group, the slab is set together with its HSN code: **Fill missing** fills only products still without one; **Set on all** sets every product in the group." },
          { t: "Every line of a tax invoice needs an HSN code. A product without its own slab uses the shop's default (Shop settings)." },
        ],
      },
      {
        id: "tax-returns",
        title: "Tax returns",
        paths: ["/admin/finance/returns"],
        intro: "Tax rates › Tax returns, laid out like Reporting: everything the CA needs for a month, built from the invoices, credit notes and supplier bills.",
        steps: [
          {
            t: "On the left, **Select return to download**: **GST returns** (GSTR-1 tables and a GSTR-3B summary), **Tally** registers, and **Purchases**. In **Filter** on the right pick the **Period** (This month, Last month, or From and To), then download.",
            fig: { caption: "Tax returns", bar: { title: "Tax rates" }, tabs: ["Tax rates", "Product taxes (HSN)", "*Tax returns"], grid: { cols: ["Select return to download"], rows: [["*GST returns#1"], ["Tally registers"], ["Purchases"]] }, panel: { title: "Filter", fields: [{ label: "Period#2", kind: "select", value: "Last month" }], save: "Download", saveN: 3 } },
          },
        ],
        careful: ["Check before filing: go through the returns with the CA."],
      },
      {
        id: "company",
        title: "My company",
        paths: ["/admin/settings"],
        intro: "The shop's own details, as Aronium's My company, plus the shop's settings.",
        steps: [
          {
            t: "**Company data**: the shop's name, legal name, tax number (GSTIN), address, state, phone and email, bank account (name, number, IFSC, UPI) and invoice prefix and note. These print on invoices. **Save** wakes up once something changes.",
            fig: { caption: "My company", bar: { title: "My company" }, side: side("My company"), tabs: ["*Company data", "Void reasons", "My logo", "~Reset database", "Shop settings"], panel: { title: "My company data", fields: [{ label: "Name", value: "Babajee" }, { label: "Tax number#1", value: "27XXXXX0000X1Z0" }, { label: "State / Province", kind: "select", value: "Maharashtra" }], saveN: 2 } },
          },
          { t: "**Void reasons**: the return reasons customers pick from, the return window in days, and after how many hours an unpaid order cancels itself." },
          { t: "**My logo** points to the storefront design. **Reset database** is Aronium's and is not available in Babajee." },
          { t: "**Shop settings** has the rest: Business details, Payments and bank, Delivery and couriers, GST, Orders, returns and carts, Low stock, and Data export. The admin's design is picked on **Admin theme**, in the Online shop group." },
        ],
      },
      {
        id: "storefront",
        title: "Storefront: colours and homepage",
        paths: ["/admin/storefront"],
        intro: "Online shop › Storefront › Colours and homepage: three tabs under the toolbar.",
        steps: [
          {
            t: "**Colours** sets the shop's colours, light and dark: pick a preset, change any part, check it in the preview, then **Save**. **Revert** goes back to what is live.",
            fig: { caption: "Colours and homepage", bar: { title: "Storefront" }, side: side("Storefront"), tabs: ["*Colours and homepage", "Banners", "Pages, blog and FAQs", "Menus"], strip: ["Colours", "Announcement", "*Homepage sections#1"], tools: [{ icon: "refresh", label: "Refresh" }, { icon: "add", label: "New section#2" }, { icon: "edit", label: "Edit" }, { icon: "sort", label: "Move up" }, { icon: "sort", label: "Move down" }, { icon: "paid", label: "Hide" }, { icon: "del", label: "Delete" }], grid: { cols: ["#", "Section", "Shows", "Shown"], rows: [["1", "Banners", "", "✓"], ["2", "Products", "Best sellers", "✓"]], sel: 1 } },
          },
          { t: "**Announcement**: the line along the top of the shop, with an optional link; **Take down** removes it." },
          { t: "**Homepage sections**: the homepage top to bottom. **New section** (pick a kind), **Edit** in the slide-in panel, **Move up** / **Move down**, **Show** / **Hide** (at once, with Undo) and **Delete** (asked first)." },
        ],
      },
      {
        id: "banners",
        title: "Storefront: banners",
        paths: ["/admin/storefront/banners"],
        intro: "Storefront › Banners: the homepage's rotating banners, a row each, in the order they turn.",
        steps: [
          { t: "**New banner**, **Edit**, **Delete**, **Move up** / **Move down** and **Show on the homepage** / **Take off the homepage**, from the toolbar or right-click." },
          { t: "**Edit** slides in a preview and the banner's Heading, Line under it, Button words, where it **Goes to**, the **Colour** (Dark, Gold, Green, Paper) or a **Picture**, and **Starts** / **Ends** dates it runs between. **Save** keeps them; showing or hiding saves at once, with Undo." },
        ],
      },
      {
        id: "pages",
        title: "Storefront: pages, blog and FAQs",
        paths: ["/admin/storefront/pages"],
        intro: "Storefront › Pages, blog and FAQs: **Pages**, **Blog**, **FAQs** and **Search listings** as tabs, each its own grid.",
        steps: [
          { t: "**New page** / **New post** opens the slide-in panel: the words, then its search listing (Title in Google, Description in Google) on a second tab. **New question** takes a topic, the question and the answer." },
          { t: "**Put on the shop** / **Take off the shop**, **Move up** / **Move down**, **Open on the shop** and **Delete** (asked first), from the toolbar or right-click. **Search listings** sets the Google title and description of the shop's built-in pages." },
        ],
      },
      {
        id: "menus",
        title: "Storefront: menus",
        paths: ["/admin/storefront/menus"],
        intro: "Storefront › Menus: the extra links in the shop's header and footer, beside the shop's own (Shop, categories, account). **Header** and **Footer** are tabs, a row a link in order.",
        steps: [
          { t: "**New link**, **Edit** (the words and where it goes), **Delete**, **Move up** / **Move down** and **Show** / **Hide**. Showing saves at once, with Undo; words and links wait for **Save**." },
        ],
      },
      {
        id: "analytics",
        title: "Web analytics",
        paths: ["/admin/analytics"],
        intro: "Online shop › Web analytics: the shop as a website, drawn as Aronium's dashboard. **Overview** (sales, visits, profit and GST), **Traffic** (where visitors come from and what they do) and **Live view** (who is on the shop now). Staff visits are never counted.",
        steps: [
          { t: "The toolbar: **Refresh**, **Print**, **Reporting** (the report list) and **Help**." },
          { t: "**Periodic Reports ( dates ) 📅** sets the period: the calendar picks **Today**, **Yesterday**, **This month** or other quick periods, or two dates." },
        ],
      },
      {
        id: "messages",
        title: "Messages",
        paths: ["/admin/support"],
        intro: "Online shop › Messages: what people send from the shop's Contact page, one row each. The site sends nothing itself: you reply by email or WhatsApp.",
        steps: [
          {
            t: "**Open**, **Replied** and **Closed** are tabs. The selected message reads in the pane under the grid, with its staff note.",
            fig: { caption: "Messages", bar: { title: "Messages" }, side: side("Messages"), strip: ["*Open (1)", "Replied", "Closed"], tools: [{ icon: "refresh", label: "Refresh" }, { icon: "paid", label: "Reply by email" }, { icon: "paid", label: "Reply on WhatsApp#1" }, { icon: "paid", label: "Mark replied#2" }, { icon: "clear", label: "Close" }, { icon: "open", label: "Customer's account" }], grid: { cols: ["Received", "Name", "Topic", "Message"], rows: [["24-11-2026", "Kabir Demo", "Delivery", "When will my order…"]], sel: 0 } },
          },
          { t: "**Reply by email** or **Reply on WhatsApp**, then **Mark replied** (or **Close**). **Reopen** / **Back to open** bring one back. **Find the order** and **Customer's account** open what it is about; **Save note** keeps a staff note. Double-click opens it in a panel." },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ tasks
  {
    id: "tasks",
    title: "How to…",
    articles: [
      {
        id: "t-phone-order",
        title: "Take an order by phone or WhatsApp",
        intro: "The customer calls or messages to order. You enter it yourself as a new sale.",
        steps: [
          { t: "Open **Documents › New sale** (or Documents › **Add**)." },
          { t: "In **Customer**, find them by name, phone or email. A new customer: type their name, phone and address on **Customer & delivery**." },
          { t: "On **Document items**, click each product in the picker on the left, and set how many on the right. Check the shipping charge." },
          { t: "A business buyer? Add their GSTIN on **Business buyer (GSTIN)**." },
          { t: "**Save** (it waits in Payment pending), or **Save ▾ › Save as paid** if they have paid. The order opens in its tab." },
        ],
      },
      {
        id: "t-counter",
        title: "Sell to a customer at the counter",
        paths: [],
        intro: "A customer walks in, picks something up and pays at the counter.",
        steps: [
          { t: "Open **Till** in the menu. If it says the cash drawer is closed, open it first (see Open and close the cash drawer)." },
          { t: "Scan each item's barcode, or tap its group and then the product. Scanning the same item again adds one more." },
          { t: "Need a discount? Select the line (or none, for the whole sale) and press **Discount**: a percent or an amount. The till stops at the largest discount Settings allow." },
          {
            t: "Press **F10 Payment**. Pick how they pay; for cash, tap the note they hand you (or type it) and the till shows the **change**. To split, add a second payment in another way, like part cash and part UPI. Card and UPI can't be paid over the total: only cash gives change.",
            fig: { caption: "Payment", bar: { title: "Till" }, panel: { title: "Payment", fields: [{ label: "Total", value: "₹2,580.00" }, { label: "Cash#1", kind: "select", value: "Cash" }, { label: "Cash given#2", value: "3,000" }, { label: "Change", value: "₹420.00" }], save: "Done · change ₹420.00", saveN: 3 } },
          },
          { t: "Paid in full by one way? Skip the panel: press that way's button on the top bar (**F12** for cash) and the sale is done at once." },
          { t: "Press **Done**. The receipt prints if Settings say so; otherwise the bar above the ticket has **Receipt**, **GST invoice** and **Open** for the last sale." },
        ],
        tips: ["Busy counter? **F9 Save sale** parks the ticket; serve the next person and resume it from ≡ › View open sales."],
      },
      {
        id: "t-drawer",
        title: "Open and close the cash drawer",
        paths: [],
        intro: "With the cash drawer switched on (Settings › Counter (till)), each day at the counter starts by opening the drawer with its float and ends by counting it.",
        steps: [
          { t: "Start of the day: **Cash drawer** on the till. Count the cash you start with, type it as the **float**, and press **Open drawer**." },
          { t: "Cash taken out for something (tea, a courier, a supplier) or put in (change from the bank): **Cash drawer › Cash in / out**, the amount and why." },
          {
            t: "End of the day: **Cash drawer › End of day** (or ≡ › End of day). It shows the float, sales by each way of paying, cash in and out, refunds, and the cash that should be there. Count the drawer, type what you counted, and **Close the drawer**.",
            fig: { caption: "End of day", bar: { title: "Till" }, panel: { title: "Cash drawer", tabs: ["Now", "Cash in / out", "*End of day", "Past days"], fields: [{ label: "Cash that should be in the drawer", value: "₹8,420.00" }, { label: "Cash counted in the drawer#1", value: "8,400" }, { label: "Note" }], save: "Close the drawer", saveN: 2 } },
          },
          { t: "The end-of-day report shows over or short; **Print** it on the till's printer. Past days lists every day's count." },
        ],
        careful: ["Owners, admins and the store account close the drawer. While the drawer is switched on and closed, the till won't sell."],
      },
      {
        id: "t-till-refund",
        title: "Refund or take back something sold",
        paths: [],
        intro: "A customer brings something back, or was overcharged. The refund is made at the till; the GST credit note is issued as for any refund.",
        steps: [
          { t: "On the till press **Refund**. Scan the barcode on their receipt, or type its number (BJ-…) or the invoice number, and press Enter. Or open ≡ › **View sales history** and tap **Refund** on the sale." },
          { t: "For each item coming back, press **+** (or **All**). The amount to give back fills in; change it for a part refund (a price match, say)." },
          { t: "Pick how the money goes back. **Cash** comes out of the open drawer and shows on the end-of-day count. A sale on account can instead be taken **off what's owed**." },
          { t: "Leave **Put the returned items back in stock** ticked unless they're damaged; add a reason; press **Refund**. The refund slip prints; its bar has the A4 credit note." },
        ],
        careful: ["Owners, admins and the store account can refund. An order that hasn't been paid yet is cancelled, not refunded."],
      },
      {
        id: "t-on-account",
        title: "Sell on account and collect later",
        paths: [],
        intro: "A regular takes goods now and pays later. Switch it on in Settings › Counter (till) › Sales on account, with a credit limit if you want one.",
        steps: [
          { t: "Press **Customer** and find their account: only a customer with an account can owe. What they owe already shows beside them." },
          { t: "In **F10 Payment** pick **On account** for what they'll pay later: all of it, or the rest after a part payment in cash or UPI. The till stops at their credit limit." },
          { t: "The sale is complete: stock comes off and the GST tax invoice is issued at once, as the law asks for goods supplied. The receipt shows what's still to pay." },
          { t: "When they pay: ≡ › **Credit payments**, tap them, type what they're paying (all or part), pick how, **Take**. It pays their oldest sales first; cash goes in the drawer; a payment receipt prints." },
        ],
        tips: ["The customer's page shows what they owe and their own credit limit. **Reporting › Unpaid sales (on account)** lists everything owed, oldest first."],
      },
      {
        id: "t-split",
        title: "Split a bill",
        paths: [],
        intro: "Two ways, depending on what the customers want.",
        steps: [
          { t: "**Separate sales**: press **Split** above the ticket, choose the items (and how many) going on the second ticket, **Split off**. Take payment for this ticket; the other waits under ≡ › View open sales and is rung up as its own sale with its own receipt and invoice. Split again for a third." },
          { t: "**One sale, shared payment**: in **F10 Payment** pick the way they pay, type the number of people in **Split evenly by** and press **Split**: that many equal payments are added. Mix ways by adding payments one at a time instead." },
        ],
      },
      {
        id: "t-unpaid",
        title: "Get an unpaid order paid",
        intro: "Babajee has no card gateway: an order is placed unpaid, someone from the shop contacts the customer to take payment, then marks it paid. Unpaid orders cancel themselves after the hours set in My company › Void reasons.",
        steps: [
          {
            t: "Open **Documents › Payment pending**. Each order shows how long it has waited and how long until it cancels itself; the oldest are first.",
            fig: { caption: "Payment pending", bar: { title: "Documents" }, tabs: DOC_TABS("Payment pending"), grid: { cols: ["Number", "Date", "Customer", "Status", "Total"], rows: [["BJ-2041", "24 Nov 11:02 am", "Aarav Example", "Payment pending · 3 h ago · 45 h left", "₹1,450"]], sel: 0, mark: { row: 0, n: 1 } } },
          },
          {
            t: "Right-click the order: **Call** rings the customer, **WhatsApp** opens a chat with a ready message (order number and amount). After talking, **Log contact** records what happened.",
            fig: { caption: "Right-click an unpaid order", grid: { cols: ["Number", "Customer", "Total"], rows: [["BJ-2041", "Aarav Example", "₹1,450"]], sel: 0 }, popup: ["Add", "-", "Edit", "Mark paid#3", "-", "Print", "-", "Call#1", "WhatsApp", "Log contact#2", "-", "Refresh"] },
          },
          {
            t: "In **Log contact** pick what happened (No answer, Will pay today, Will pay later, Call back, Wants to cancel…) or write a note, then **Log it**. The last contact shows under the order in the grid.",
            fig: { caption: "Log contact", dialog: { title: "Log contact · BJ-2041", lines: ["No answer", "*Will pay today#1", "Will pay later", "Call back", "Wants to cancel"], buttons: ["Log it#2"] } },
          },
          {
            t: "When the money arrives: select the order, **Mark paid** (toolbar or right-click). Pick **How** it was paid, add the **Transaction reference (UTR or UPI ref)** for anything but cash, and a receipt number if any.",
            fig: { caption: "Mark paid", dialog: { title: "Mark paid · BJ-2041", lines: ["How: *UPI#1", "Transaction reference (UTR or UPI ref)#2", "Receipt number, if any"], buttons: ["Mark paid#3"] } },
          },
          { t: "Marking it paid issues the GST invoice and sends the customer their confirmation email. The order moves to To pack." },
        ],
        tips: ["The reference lets the accountant match the payment to the bank statement."],
      },
      {
        id: "t-dispatch",
        title: "Pack and dispatch orders",
        intro: "From paid to on its way.",
        steps: [
          { t: "Open **Documents › To pack**. Pack each order, then select it and **Packed** (or tick several and **Mark 3 packed**)." },
          { t: "Open **Ready to dispatch**. Select an order and **Ship**: the order opens with its ship step." },
          { t: "Pick the **Courier** (Blue Dart, DTDC, Delhivery, Ekart, India Post, Shadowfax, Xpressbees or other) and type the tracking number. The customer is emailed; the order's **Delivery & tracking** tab keeps both." },
          { t: "When it arrives: **On the way** in the Order type box, select it, **Delivered** (or tick several and mark them delivered together)." },
        ],
      },
      {
        id: "t-requests",
        title: "Cancellations, returns and refunds",
        intro: "Customers can ask to cancel, or to return within the return window. Those wait in Customer requests.",
        steps: [
          { t: "Open **Documents › Customer requests**, select the order, **Review**. The order opens; its **Customer requests** tab holds the request." },
          { t: "**Accept and refund** (or **Accept and refund everything**) refunds it; **Decline** turns it down with a reply." },
          { t: "Without a request: the order's toolbar has **Cancel order**, **Return items** (pick what came back; it goes back on the shelf) and **Refund** (an amount)." },
          { t: "Paying a refund back by hand: once sent, **Payments › Mark refund paid**. A mistaken refund can be undone with **Reverse refund** on **Returns & refunds**." },
          { t: "A refund on an invoiced order issues a credit note (the toolbar's **Credit notes**, and Documents › Invoices › Credit notes)." },
        ],
      },
      {
        id: "t-problems",
        title: "Sort out a failed delivery",
        intro: "When a courier can't deliver.",
        steps: [
          { t: "Open the order and **Delivery failed** on its toolbar; record what happened. The order shows in **Delivery problems** (Order type box on Documents)." },
          { t: "Then either **Send again** (it goes back on the way) or, if the courier is bringing it back, **Returned (RTO)** to take it back in." },
        ],
      },
      {
        id: "t-add-product",
        title: "Add a product",
        intro: "A new product, ready for the shop.",
        steps: [
          {
            t: "Open **Products**, pick its group on the left, then **New product** (toolbar or right-click). Type its name, check the group, **Save**: it is added as a draft and its editor slides in.",
            fig: { caption: "New product", bar: { title: "Products" }, tools: PRODUCT_TOOLS({ "New product": 1 }), panel: { title: "New product", fields: [{ label: "Name#2", value: "Glass ashtray" }, { label: "Group", kind: "select", value: "Ashtrays" }], saveN: 3 } },
          },
          { t: "**Price & tax**: the cost, the sale price, and **Add tax to product** (HSN code, then slab). **Save**." },
          { t: "**Photos**: add pictures. Sizes or colours? **Options › New option** for each, with its own price and code." },
          { t: "Count its stock: see Count stock, below." },
          { t: "When it's ready, switch **Active** on (Details) and **Save**: it is on the shop." },
        ],
      },
      {
        id: "t-stock-in",
        title: "Put stock in from a supplier bill",
        intro: "Stock arrives with a bill.",
        steps: [
          { t: "Open **Documents › Purchases** (or **Stock in** on Stock), then **Add › 100 - Purchase**." },
          { t: "Choose the **Supplier** (or New supplier…) and type the bill number as **External document**, with its date." },
          { t: "Click each product in the picker on the left; set how many (loose or boxes) and the price before tax. Got the supplier's sheet? **Fill from a sheet**." },
          { t: "Check the total against the paper bill, then **Post bill**. Stock goes up, each option's buying price is updated, and the GST is recorded for the return (claimable if the supplier has a GSTIN)." },
        ],
        tips: ["Stock you already had, with no bill: Purchases › Opening stock."],
      },
      {
        id: "t-count",
        title: "Count stock",
        intro: "An option only limits sales once its stock is counted.",
        steps: [
          { t: "Open **Stock** and set **Show** to **Not counted**." },
          { t: "Select an option and **Start counting**." },
          { t: "Count the shelf, select the option and **Quick inventory** (or F2): type the counted quantity and a note. Or **Add or adjust** to add a delivery or correct the count." },
        ],
        careful: ["Don't start counting an option until you have its real count: a counted option with 0 can't be ordered."],
      },
      {
        id: "t-buying-price",
        title: "Set a buying price",
        intro: "What an option cost you, for profit and stock value.",
        steps: [
          { t: "Open **Stock**, select the option, **Buying price**, and type what it cost." },
          { t: "Posting a supplier bill updates it on its own, as the average of what you paid." },
        ],
      },
      {
        id: "t-promotion",
        title: "Put products on offer",
        intro: "Show a product as a deal, with its MRP struck through.",
        steps: [
          { t: "Open **Promotions › Add promotion**." },
          { t: "On the left find the products, tick them, **▶** to add." },
          { t: "Type each one's MRP (higher than its price), then **Save**. The shop shows the discount." },
          { t: "To end it: select it and **Delete**. The price stays; only the MRP goes." },
        ],
      },
      {
        id: "t-bulk-prices",
        title: "Change many prices at once",
        intro: "A price rise across a group, for example.",
        steps: [
          { t: "Open **Price lists**, pick the group under Product groups." },
          { t: "**Edit prices**: Increase or Decrease by a percentage, and how to round." },
          { t: "Tick the options to change and check each old → new price, then apply." },
        ],
        careful: ["This changes real prices on the shop at once."],
      },
      {
        id: "t-group",
        title: "Find a customer, make a customer group",
        intro: "Groups pick out customers by rules, like everyone who spent over ₹5,000 in Pune.",
        steps: [
          { t: "Open **Customers & suppliers** and type in the search row to find someone; double-click to open their card." },
          { t: "**New group** (toolbar, or right-click the group list), name it, and add rules (what to look at, how, value). Customers who match all of them are in it." },
          { t: "The group appears under Your groups; click it to list its customers. Edit group and Delete group change or remove it." },
        ],
      },
      {
        id: "t-staff",
        title: "Add a staff member",
        intro: "Staff sign in with their own shop account.",
        steps: [
          { t: "They make an account on the shop first." },
          { t: "Open **Users & security › Add user**, type their email and pick the access level (9 Owner … 1 Front-end UI). **Save**." },
          { t: "To change their level: select them, **Edit**. To remove their access: **Delete** (their shop account stays)." },
          { t: "**Keep out of visits and analytics** stops their own browsing being counted." },
        ],
      },
      {
        id: "t-gst",
        title: "GST invoices, credit notes and returns",
        intro: "What the shop does for GST, and where to find it.",
        steps: [
          { t: "An invoice is issued when an order is paid, a credit note when an invoiced order is refunded. Both are in **Documents › Invoices** and can't be changed." },
          { t: "Each product needs an HSN code and slab: **Tax rates › Product taxes (HSN)**, or **Add tax to product** in the product editor." },
          { t: "Each month: **Tax rates › Tax returns**, pick the period, download the GST returns, the Tally registers and the purchases, and hand them to the CA." },
        ],
        careful: ["Check the returns with the CA before filing."],
      },
      {
        id: "t-report",
        title: "Run and export a report",
        intro: "For the accountant or to check how things went.",
        steps: [
          { t: "Open **Reporting**, select the report, set **From** and **To**, **Show report**." },
          { t: "In its tab, **Save ▾** downloads it as CSV for a spreadsheet; **Print** prints it." },
        ],
      },
      {
        id: "t-settings",
        title: "Change the shop's settings",
        intro: "Shipping, returns, GST, payment details and more.",
        steps: [
          { t: "**My company › Company data** for what prints on invoices; **Save**." },
          { t: "**My company › Shop settings** for shipping, couriers, returns, carts, low-stock level, GST and data export. Each topic saves on its own." },
        ],
      },
      {
        id: "t-storefront",
        title: "Change the shop's banners and pages",
        intro: "What customers see.",
        steps: [
          { t: "**Storefront › Banners**: **New banner**, or select one and **Edit**; set its dates, then **Save**. **Move up** / **Move down** change the order." },
          { t: "**Storefront › Pages, blog and FAQs**: **New page**, **New post** or **New question**." },
          { t: "**Storefront › Colours and homepage**: the shop's look, the announcement, and the homepage sections." },
        ],
      },
    ],
  },
];

export const ALL = GUIDE.flatMap((c) => c.articles.map((a) => ({ ...a, chapter: c })));

// the article for an admin page: the longest of its paths that the page sits under
export function articleFor(path: string): string | null {
  const p = path.split(/[?#]/)[0].replace(/\/$/, "") || "/admin";
  let best: { id: string; n: number } | null = null;
  for (const a of ALL)
    for (const q of a.paths ?? [])
      if ((p === q || p.startsWith(`${q}/`)) && q.length > (best?.n ?? -1) && !(q === "/admin" && p !== "/admin")) best = { id: a.id, n: q.length };
  return best?.id ?? null;
}
